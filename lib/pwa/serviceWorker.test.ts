import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The app's side of the one service worker (public/sw.js, asana-12): one
 * address for push and for the pages kept offline, so neither registration
 * swaps the other's script; what loaded before the worker took over is kept;
 * and a session's end lets every kept page go.
 */

const CONFIG = { apiKey: "k", authDomain: "d", projectId: "p", storageBucket: "b", messagingSenderId: "s", appId: "a" }

async function load(configured: boolean) {
  vi.resetModules()
  vi.doMock("@/lib/push/firebaseConfig", () => ({ firebaseConfig: configured ? CONFIG : {}, isFirebaseConfigured: configured }))
  return import("@/lib/pwa/serviceWorker")
}

type Fake = {
  register: ReturnType<typeof vi.fn>
  controller: { postMessage: ReturnType<typeof vi.fn> } | null
  ready: Promise<unknown>
  getRegistration: ReturnType<typeof vi.fn>
}
const active = { postMessage: vi.fn() }
let worker: Fake | undefined
const deleted: string[] = []

beforeEach(() => {
  active.postMessage.mockClear()
  deleted.length = 0
  const registration = { active, installing: null, waiting: null }
  worker = {
    register: vi.fn(async () => registration),
    controller: null,
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
  }
  Object.defineProperty(navigator, "serviceWorker", { value: worker, configurable: true })
  // Two members' kept pages (one left from before), the files, and an unrelated cache of the page's own.
  const names = ["onecamp-sw-pages-v1:sam", "onecamp-sw-pages-v1:alex", "onecamp-sw-pages-v1", "onecamp-sw-static-v1-0", "other"]
  Object.defineProperty(window, "caches", {
    value: { keys: vi.fn(async () => names), delete: vi.fn(async (name: string) => deleted.push(name) > 0) },
    configurable: true,
  })
})

afterEach(() => {
  vi.doUnmock("@/lib/push/firebaseConfig")
  Reflect.deleteProperty(navigator, "serviceWorker")
  Reflect.deleteProperty(window, "caches")
})

describe("the worker's address", () => {
  it("is /sw.js at the root when push isn't set up", async () => {
    const { workerUrl } = await load(false)
    expect(workerUrl()).toBe("/sw.js")
  })

  it("carries push's config when it is, so the worker can start Firebase", async () => {
    const { workerUrl } = await load(true)
    const url = new URL(workerUrl(), "https://camp.example.com")
    expect(url.pathname).toBe("/sw.js")
    expect(Object.fromEntries(url.searchParams)).toEqual(CONFIG)
  })

  it("is the one push registers too: the old push worker's address is gone from the app", () => {
    const firebase = readFileSync(resolve(__dirname, "../firebase.ts"), "utf8")
    expect(firebase).toContain('from "@/lib/pwa/serviceWorker"')
    expect(firebase).not.toMatch(/messaging-sw\.js/)
  })
})

describe("registering", () => {
  it("is one registration at the root, checked against the server on every update", async () => {
    const { registerAppWorker, workerUrl } = await load(true)
    await registerAppWorker()
    expect(worker!.register).toHaveBeenCalledTimes(1)
    expect(worker!.register).toHaveBeenCalledWith(workerUrl(), { scope: "/", updateViaCache: "none" })
  })

  it("does nothing where the browser has no service workers", async () => {
    Reflect.deleteProperty(navigator, "serviceWorker")
    const { registerAppWorker } = await load(false)
    await expect(registerAppWorker()).resolves.toBeUndefined()
  })
})

describe("keeping what loaded before the worker took over", () => {
  it("names the page and this origin's files to the worker, nothing else", async () => {
    const { keepWhatLoaded } = await load(false)
    const origin = window.location.origin
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${origin}/_next/static/chunks/a1.js` },
      { name: `${origin}/_next/static/css/b2.css` },
      { name: `${origin}/fonts/inter.woff2` },
      { name: `${origin}/api/health` },
      { name: "https://api.example.com/task/list" },
      { name: "https://cdn.example.org/_next/static/chunks/x.js" },
    ] as unknown as PerformanceEntryList)
    await keepWhatLoaded("sam")
    expect(active.postMessage).toHaveBeenCalledWith({
      type: "onecamp-sw:keep",
      member: "sam",
      urls: [window.location.href, `${origin}/_next/static/chunks/a1.js`, `${origin}/_next/static/css/b2.css`, `${origin}/fonts/inter.woff2`],
    })
  })
})

describe("a session's end", () => {
  // Every member's kept pages, and nothing else.
  const everyMembersPages = ["onecamp-sw-pages-v1:sam", "onecamp-sw-pages-v1:alex", "onecamp-sw-pages-v1"]

  it("lets every member's kept pages go, with or without a worker running", async () => {
    const { forgetKeptPages } = await load(false)
    worker!.controller = { postMessage: vi.fn() }
    await forgetKeptPages()
    expect(deleted.sort()).toEqual([...everyMembersPages].sort())
    expect(worker!.controller.postMessage).toHaveBeenCalledWith({ type: "onecamp-sw:forget" })
    Reflect.deleteProperty(navigator, "serviceWorker")
    deleted.length = 0
    await forgetKeptPages()
    expect(deleted.sort()).toEqual([...everyMembersPages].sort())
  })

  it("reaches the worker running the site even on a page it doesn't control, and each worker once", async () => {
    const { forgetKeptPages } = await load(false)
    // A page loaded past the worker (a hard reload) has no controller: the running worker still hears it,
    // so it keeps nothing more under the member who left.
    await forgetKeptPages()
    expect(active.postMessage).toHaveBeenCalledWith({ type: "onecamp-sw:forget" })
    // The page's own worker is the running one: it hears it once.
    active.postMessage.mockClear()
    worker!.controller = active
    await forgetKeptPages()
    expect(active.postMessage).toHaveBeenCalledTimes(1)
    // No registration to ask (storage blocked): the pages still go.
    worker!.controller = null
    deleted.length = 0
    worker!.getRegistration.mockRejectedValueOnce(new DOMException("blocked", "SecurityError"))
    await forgetKeptPages()
    expect(deleted.sort()).toEqual([...everyMembersPages].sort())
  })

  it("is when the Offline Store lets go of the member's things", async () => {
    await load(false)
    const { wipeOfflineStore } = await import("@/lib/offline/wipe")
    await wipeOfflineStore()
    expect(deleted.sort()).toEqual([...everyMembersPages].sort())
  })

  it("comes with every sign-out, and takes the kept profile with it", async () => {
    await load(false)
    const { endSession } = await import("@/lib/sessionEnd")
    const { keptProfile, localStorageProvider } = await import("@/lib/swrCache")
    const kept = { v: 3, member: "sam", profile: { data: { data: { user_uuid: "sam" } } }, entries: [] }
    localStorage.setItem("onecamp:member", "1")
    localStorage.setItem("onecamp-app-cache", JSON.stringify(kept))
    localStorageProvider()
    const unanswered = Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" })
    expect(keptProfile(unanswered)).toEqual(kept.profile.data)
    await endSession()
    await vi.waitFor(() => expect(deleted.sort()).toEqual([...everyMembersPages].sort()))
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
    localStorage.setItem("onecamp:member", "1")
    expect(keptProfile(unanswered)).toBeUndefined()
  })

  it("names each member's pages apart", async () => {
    const { pagesOf } = await load(false)
    expect(pagesOf("sam")).not.toBe(pagesOf("alex"))
    expect(pagesOf("a:b/c")).toBe("onecamp-sw-pages-v1:a%3Ab%2Fc")
  })
})
