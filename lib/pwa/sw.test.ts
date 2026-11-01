// @vitest-environment node
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import vm from "node:vm"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PAGES_CACHE, pagesOf } from "@/lib/pwa/serviceWorker"

/**
 * The one service worker (public/sw.js, asana-12): web push and the app's pages
 * and files on the device, so the app opens from a cold start with no network.
 * It runs here in a worker scope of its own (node:vm), with Cache Storage and
 * the network faked, and is held to what a member sees: a page they opened
 * opens again offline, a page they never opened says so, and nothing the API
 * answers passes through it.
 */
const WORKER = resolve(__dirname, "../../public/sw.js")
const ORIGIN = "https://camp.example.com"
const at = (path: string) => new URL(path, ORIGIN).href
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
const script = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/javascript" } })
// The real offline page (public/offline.html), as the worker keeps it at install.
const OFFLINE_PAGE = readFileSync(resolve(__dirname, "../../public/offline.html"), "utf8")

const keyOf = (req: unknown) => (typeof req === "string" ? at(req) : (req as { url: string }).url)

class FakeCache {
  entries = new Map<string, Response>()
  async match(req: unknown, opts?: { ignoreSearch?: boolean }) {
    const url = new URL(keyOf(req))
    let hit = this.entries.get(url.href)
    if (!hit && opts?.ignoreSearch) {
      for (const [k, v] of this.entries) {
        const u = new URL(k)
        if (u.origin === url.origin && u.pathname === url.pathname) hit = v
      }
    }
    return hit?.clone()
  }
  async put(req: unknown, res: Response) {
    const k = keyOf(req)
    this.entries.delete(k)
    this.entries.set(k, res.clone())
  }
  async delete(req: unknown, opts?: { ignoreSearch?: boolean }) {
    if (!opts?.ignoreSearch) return this.entries.delete(keyOf(req))
    const path = new URL(keyOf(req)).pathname
    let gone = false
    for (const k of [...this.entries.keys()]) if (new URL(k).pathname === path) gone = this.entries.delete(k) || gone
    return gone
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }))
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>()
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache())
    return this.stores.get(name)!
  }
  async has(name: string) {
    return this.stores.has(name)
  }
  async delete(name: string) {
    return this.stores.delete(name)
  }
  async keys() {
    return [...this.stores.keys()]
  }
  async match(req: unknown, opts?: { ignoreSearch?: boolean }) {
    for (const store of this.stores.values()) {
      const hit = await store.match(req, opts)
      if (hit) return hit
    }
    return undefined
  }
}

type Listener = (event: Record<string, unknown>) => void
type Answer = () => Response | Promise<Response>

/** public/sw.js, started in a worker scope of its own at /sw.js<search>. */
function startWorker(search = "", globals: Record<string, unknown> = {}) {
  const listeners = new Map<string, Listener[]>()
  const caches = new FakeCaches()
  let routes: Record<string, Answer> | null = { [at("/offline.html")]: () => html(OFFLINE_PAGE) }
  const net = vi.fn(async (url: string): Promise<Response> => {
    const answer = routes?.[url]
    if (!answer) throw new TypeError("Failed to fetch")
    return answer()
  })
  const scope: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    Request,
    Response,
    Headers,
    Promise,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    caches,
    fetch: (input: unknown) => net(keyOf(input)),
    location: new URL(`/sw.js${search}`, ORIGIN),
    importScripts: vi.fn(),
    skipWaiting: vi.fn(async () => {}),
    registration: { scope: `${ORIGIN}/`, navigationPreload: { enable: vi.fn(async () => {}) }, showNotification: vi.fn() },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null), get: vi.fn() },
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    ...globals,
  }
  scope.self = scope
  vm.createContext(scope)
  vm.runInContext(readFileSync(WORKER, "utf8"), scope, { filename: "sw.js" })

  /** Fires one event; resolves with what the worker answered (undefined: it left the request alone) once its work is done. */
  async function fire(type: string, fields: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = []
    let answered: Promise<Response> | undefined
    const event = {
      ...fields,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Response | Promise<Response>) => {
        answered = Promise.resolve(p)
      },
    }
    for (const fn of listeners.get(type) ?? []) fn(event)
    const response = answered ? await answered : undefined
    for (let seen = 0; seen < waits.length; seen = waits.length) await Promise.all(waits.slice(seen))
    return response
  }

  /** A request the way a page makes it: a navigation, or a file it loads. */
  const request = (path: string, init: { mode?: string; method?: string; headers?: Record<string, string>; destination?: string } = {}) => ({
    url: path.startsWith("http") ? path : at(path),
    method: init.method ?? "GET",
    mode: init.mode ?? "cors",
    destination: init.destination ?? (init.mode === "navigate" ? "document" : "script"),
    headers: new Headers(init.headers ?? (init.mode === "navigate" ? { accept: "text/html" } : {})),
  })
  const open = (path: string, preload?: Response) =>
    fire("fetch", { request: request(path, { mode: "navigate" }), preloadResponse: Promise.resolve(preload), clientId: "", resultingClientId: "c1" })
  const load = (path: string, init?: Parameters<typeof request>[1]) => fire("fetch", { request: request(path, init), clientId: "c1" })
  const tell = (data: unknown) => fire("message", { data })

  return {
    scope,
    listeners,
    caches,
    net,
    fire,
    open,
    load,
    tell,
    /** What the network answers from now on; anything else fails as if the network were gone. */
    online(answers: Record<string, Answer>) {
      routes = { [at("/offline.html")]: () => html(OFFLINE_PAGE), ...Object.fromEntries(Object.entries(answers).map(([p, a]) => [at(p), a])) }
    },
    offline() {
      routes = null
    },
    /** Installed and active, as the browser starts it. */
    async ready() {
      await fire("install")
      await fire("activate")
    },
  }
}

/** A worker installed, active and keeping the pages of a signed-in member. */
async function memberWorker(member = "sam") {
  const w = startWorker()
  await w.ready()
  await w.tell({ type: "onecamp-sw:keep", member, urls: [] })
  return w
}

afterEach(() => {
  vi.useRealTimers()
})

describe("the one service worker", () => {
  it("is public/sw.js, at the root, so its scope is the whole app", () => {
    expect(existsSync(WORKER), "public/sw.js").toBe(true)
  })

  it("leaves Firebase out when push isn't set up, and still answers every event it serves", () => {
    const w = startWorker()
    expect(w.scope.importScripts).not.toHaveBeenCalled()
    for (const type of ["install", "activate", "fetch", "message", "notificationclick"]) expect(w.listeners.get(type)?.length, type).toBe(1)
  })

  it("starts Firebase from the config in its own address, as the push worker did", () => {
    const firebase = { initializeApp: vi.fn(), messaging: vi.fn(() => ({ onBackgroundMessage: vi.fn() })) }
    const w = startWorker("?apiKey=k&authDomain=d&projectId=p&storageBucket=b&messagingSenderId=s&appId=a", { firebase })
    expect(w.scope.importScripts).toHaveBeenCalledTimes(2)
    expect(firebase.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "k", projectId: "p", messagingSenderId: "s", appId: "a" }))
  })

  it("keeps the offline page when it installs, takes over at once, and drops only its own older caches", async () => {
    const w = startWorker()
    await w.caches.open("onecamp-sw-pages-v0")
    await w.caches.open("someone-else")
    await w.ready()
    expect(w.scope.skipWaiting).toHaveBeenCalled()
    expect((w.scope.clients as { claim: () => void }).claim).toHaveBeenCalled()
    expect((w.scope.registration as { navigationPreload: { enable: () => void } }).navigationPreload.enable).toHaveBeenCalled()
    expect(await w.caches.has("onecamp-sw-pages-v0")).toBe(false)
    expect(await w.caches.has("someone-else")).toBe(true)
    expect(await w.caches.match(at("/offline.html"))).toBeDefined()
  })
})

describe("what it leaves to the network", () => {
  it("never touches the API, another origin, a write, a page's data request or a partial read", async () => {
    const w = await memberWorker()
    expect(await w.load("https://api.example.com/task/list")).toBeUndefined()
    expect(await w.load("/app/project/p1", { method: "POST" })).toBeUndefined()
    expect(await w.load("/app/project/p1?_rsc=x1", { headers: { RSC: "1" } })).toBeUndefined()
    expect(await w.load("/app/project/p1", { headers: { RSC: "1", "Next-Router-Prefetch": "1" } })).toBeUndefined()
    expect(await w.load("/api/health")).toBeUndefined()
    expect(await w.load("/build-id")).toBeUndefined()
    expect(await w.load("/_next/image?url=%2Fa.png&w=64&q=75")).toBeUndefined()
    expect(await w.load("/_next/static/media/clip.mp4", { headers: { Range: "bytes=0-" }, destination: "video" })).toBeUndefined()
  })
})

describe("files named by their hash", () => {
  it("come from the device after the first time", async () => {
    const w = await memberWorker()
    w.online({ "/_next/static/chunks/a1.js": () => script("a1") })
    expect(await (await w.load("/_next/static/chunks/a1.js"))?.text()).toBe("a1")
    w.offline()
    expect(await (await w.load("/_next/static/chunks/a1.js"))?.text()).toBe("a1")
    // A file never loaded fails as it would with no worker.
    await expect(w.load("/fonts/inter.woff2")).rejects.toThrow()
  })

  it("are kept over two generations: one still in use is carried forward, one unused goes", async () => {
    const w = await memberWorker()
    const statics = async () => (await w.caches.keys()).filter((n) => n.includes("static"))
    const files: Record<string, Answer> = {}
    for (let n = 0; n < 5000; n++) files[`/_next/static/chunks/f${n}.js`] = () => script(`f${n}`)
    w.online(files)
    await w.load("/_next/static/chunks/f0.js")
    await w.load("/_next/static/chunks/f1.js")
    const [first] = await statics()
    expect(first).toBeDefined()
    let i = 2
    // New files until the worker opens a second generation…
    while ((await statics()).length < 2 && i < 5000) await w.load(`/_next/static/chunks/f${i++}.js`)
    expect(await statics()).toHaveLength(2)
    // …f0 is used in it, f1 isn't…
    await w.load("/_next/static/chunks/f0.js")
    // …and more until the first generation goes.
    while ((await statics()).includes(first) && i < 5000) await w.load(`/_next/static/chunks/f${i++}.js`)
    expect(await statics()).not.toContain(first)
    expect((await statics()).length).toBeLessThanOrEqual(2)
    w.offline()
    expect(await (await w.load("/_next/static/chunks/f0.js"))?.text()).toBe("f0")
    await expect(w.load("/_next/static/chunks/f1.js")).rejects.toThrow()
    expect(await w.caches.match(at("/_next/static/chunks/f1.js"))).toBeUndefined()
  })
})

describe("the app's pages", () => {
  it("are kept only for a member: before the app says one is signed in, none is", async () => {
    const w = startWorker()
    await w.ready()
    w.online({ "/app/project/p1": () => html("p1") })
    expect(await (await w.open("/app/project/p1"))?.text()).toBe("p1")
    w.offline()
    expect(await (await w.open("/app/project/p1"))?.text()).toContain("data-offline-page")
  })

  it("open from the device when the network is gone, the query aside", async () => {
    const w = await memberWorker()
    w.online({ "/app/project/p1": () => html("p1") })
    expect(await (await w.open("/app/project/p1"))?.text()).toBe("p1")
    expect(await w.caches.has(pagesOf("sam"))).toBe(true)
    w.offline()
    expect(await (await w.open("/app/project/p1"))?.text()).toBe("p1")
    expect(await (await w.open("/app/project/p1?tab=board"))?.text()).toBe("p1")
  })

  it("take the navigation preload's answer when there is one", async () => {
    const w = await memberWorker()
    w.offline()
    expect(await (await w.open("/app/home", html("home")))?.text()).toBe("home")
    expect(w.net).not.toHaveBeenCalledWith(at("/app/home"))
    expect(await (await w.open("/app/home"))?.text()).toBe("home")
  })

  it("come from the network while it answers, and from the device when it hasn't in 4 seconds", async () => {
    const w = await memberWorker()
    w.online({ "/app/home": () => html("home") })
    await w.open("/app/home")
    w.online({ "/app/home": () => html("home, newer") })
    expect(await (await w.open("/app/home"))?.text()).toBe("home, newer")
    vi.useFakeTimers()
    // The network answers at 10 s: a worker that waited for it would answer "fresh".
    w.online({ "/app/home": () => new Promise<Response>((r) => setTimeout(() => r(html("fresh")), 10_000)) })
    const answer = w.open("/app/home")
    await vi.advanceTimersByTimeAsync(10_000)
    vi.useRealTimers()
    expect(await (await answer)?.text()).toBe("home, newer")
    // The late answer still replaces the kept page.
    w.offline()
    expect(await (await w.open("/app/home"))?.text()).toBe("fresh")
  })

  it("keep only a whole page of the signed-in app", async () => {
    const w = await memberWorker()
    w.online({
      "/app/broken": () => new Response("oops", { status: 500, headers: { "content-type": "text/html" } }),
      "/app/moved": () => new Response(null, { status: 307, headers: { location: "/" } }),
      "/app/meet/join/t1": () => html("join"),
      "/r/abc": () => html("public"),
      "/guest/d/t1": () => html("guest"),
      "/book/slot": () => html("book"),
      "/": () => html("sign in"),
    })
    for (const path of ["/app/broken", "/app/moved", "/app/meet/join/t1", "/r/abc", "/guest/d/t1", "/book/slot", "/"]) await w.open(path)
    w.offline()
    for (const path of ["/app/broken", "/app/moved", "/app/meet/join/t1", "/r/abc", "/guest/d/t1", "/book/slot"]) {
      expect(await (await w.open(path))?.text(), path).toContain("data-offline-page")
    }
  })

  it("never opened here give the offline page, which offers the last page kept", async () => {
    const w = await memberWorker()
    w.online({ "/app/project/p1": () => html("p1") })
    await w.open("/app/project/p1")
    w.offline()
    const page = await (await w.open("/app/project/p2"))?.text()
    expect(page).toContain("data-offline-page")
    expect(page).toContain('data-last-page="/app/project/p1"')
    expect(page).not.toContain("__ONECAMP_LAST_PAGE__")
  })

  it("the offline page offers no page when none is kept", async () => {
    const w = await memberWorker()
    w.offline()
    const page = await (await w.open("/app/project/p2"))?.text()
    expect(page).toContain('data-last-page=""')
  })

  it("the sign-in page and /app open the last page kept when the network is gone", async () => {
    const w = await memberWorker()
    w.online({ "/app/project/p1": () => html("p1"), "/": () => html("sign in") })
    expect(await (await w.open("/"))?.text()).toBe("sign in")
    await w.open("/app/project/p1")
    w.offline()
    for (const path of ["/", "/app", "/?utm_source=pwa"]) {
      const answer = await w.open(path)
      expect(answer?.status, path).toBe(302)
      expect(answer?.headers.get("location"), path).toBe(at("/app/project/p1"))
    }
  })

  it("keeps what loaded before the worker took over, from this origin only", async () => {
    const w = await memberWorker()
    w.online({ "/_next/static/chunks/early.js": () => script("early"), "/app/home": () => html("home") })
    await w.tell({ type: "onecamp-sw:keep", member: "sam", urls: [at("/app/home"), at("/_next/static/chunks/early.js"), "https://cdn.example.org/x.js", at("/api/me")] })
    expect(w.net).not.toHaveBeenCalledWith("https://cdn.example.org/x.js")
    expect(w.net).not.toHaveBeenCalledWith(at("/api/me"))
    w.offline()
    expect(await (await w.load("/_next/static/chunks/early.js"))?.text()).toBe("early")
    expect(await (await w.open("/app/home"))?.text()).toBe("home")
  })

  it("that aren't kept open public/offline.html, its link filled with the last page kept, or hidden with none", async () => {
    expect(OFFLINE_PAGE).toContain("<body data-offline-page data-last-page=\"__ONECAMP_LAST_PAGE__\">")
    const w = await memberWorker()
    w.offline()
    const none = await (await w.open("/app/project/p9"))!.text()
    expect(none).toContain('data-last-page=""')
    expect(none).not.toContain("__ONECAMP_LAST_PAGE__")
    w.online({ "/app/project/p1?tab=%3Cboard%3E": () => html("p1") })
    await w.open("/app/project/p1?tab=<board>")
    w.offline()
    const kept = await (await w.open("/app/project/p9"))!.text()
    expect(kept).toContain('data-last-page="/app/project/p1?tab=%3Cboard%3E"')
    expect(kept).toContain('href="/app/project/p1?tab=%3Cboard%3E">Open your last page</a>')
    expect(kept).toContain("You’re offline")
  })

  it("are kept apart for each member: another member signed in here never opens the last one's", async () => {
    const w = await memberWorker("sam")
    w.online({ "/app/project/p1": () => html("sam's p1") })
    await w.open("/app/project/p1")
    await w.tell({ type: "onecamp-sw:keep", member: "alex", urls: [] })
    expect(await w.caches.has(pagesOf("sam"))).toBe(false)
    w.offline()
    expect(await (await w.open("/app/project/p1"))?.text()).toContain("data-offline-page")
    expect(await (await w.open("/app/project/p1"))?.text()).not.toContain("sam's p1")
    expect((await w.open("/"))?.status).not.toBe(302)
    // alex's own pages are kept, under alex.
    w.online({ "/app/home": () => html("alex's home") })
    await w.open("/app/home")
    expect(await w.caches.has(pagesOf("alex"))).toBe(true)
  })

  it("are kept for no one when the app names no member", async () => {
    const w = startWorker()
    await w.ready()
    await w.tell({ type: "onecamp-sw:keep", urls: [] })
    w.online({ "/app/home": () => html("home") })
    await w.open("/app/home")
    const names = await w.caches.keys()
    expect(names.filter((n: string) => n.startsWith(PAGES_CACHE))).toEqual([])
  })

  it("all go when the member signs out, and none is kept after", async () => {
    const w = await memberWorker()
    w.online({ "/app/home": () => html("home") })
    await w.open("/app/home")
    await w.tell({ type: "onecamp-sw:forget" })
    await w.open("/app/home")
    w.offline()
    expect(await (await w.open("/app/home"))?.text()).toContain("data-offline-page")
    expect((await w.open("/"))?.status).not.toBe(302)
  })

  it("that load across a sign-out are kept for no one: the next member never opens them", async () => {
    const w = await memberWorker("sam")
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    w.online({
      "/app/project/p1": async () => {
        await held
        return html("sam's p1")
      },
    })
    const opening = w.open("/app/project/p1")
    // Sam signs out and Alex signs in while Sam's page is still on its way.
    await w.tell({ type: "onecamp-sw:forget" })
    await w.tell({ type: "onecamp-sw:keep", member: "alex", urls: [] })
    release()
    expect(await (await opening)?.text()).toBe("sam's p1")
    w.offline()
    expect(await (await w.open("/app/project/p1"))?.text()).toContain("data-offline-page")
  })

  it("named before the worker took over, and loading across a sign-out, are kept for no one", async () => {
    const w = await memberWorker("sam")
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    w.online({
      "/app/home": async () => {
        await held
        return html("sam's home")
      },
    })
    const keeping = w.tell({ type: "onecamp-sw:keep", member: "sam", urls: [at("/app/home")] })
    await w.tell({ type: "onecamp-sw:forget" })
    await w.tell({ type: "onecamp-sw:keep", member: "alex", urls: [] })
    release()
    await keeping
    w.offline()
    expect(await (await w.open("/app/home"))?.text()).toContain("data-offline-page")
  })
})

describe("push, in the same worker", () => {
  it("opens the notification's place", async () => {
    const w = await memberWorker()
    await w.fire("notificationclick", { notification: { close: vi.fn(), data: { type: "task", type_id: "t1" } } })
    expect((w.scope.clients as { openWindow: (u: string) => void }).openWindow).toHaveBeenCalledWith("/app/task/t1")
  })
})
