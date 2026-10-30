import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CHUNK_HELD_POLL_MS, CHUNK_PROBE_MS, isChunkLoadError } from "./chunkRecovery"
import { holdReload, reloadForNewBuild } from "./newBuild"
import { CHUNK_RECOVERY_SCRIPT } from "./chunkRecoveryScript"

describe("chunk recovery", () => {
  it.each([
    { name: "ChunkLoadError", message: "Loading chunk 735 failed." },
    new Error("Failed to load chunk /_next/static/chunks/c74c6019fac0e2df.js from module 735393"),
    new Error("Loading CSS chunk 12 failed"),
  ])("recognises %o", (e) => expect(isChunkLoadError(e)).toBe(true))
  it("leaves other errors alone", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
  it("ships a script that parses", () => expect(() => new Function(CHUNK_RECOVERY_SCRIPT)).not.toThrow())

  it("without the early script (a page that never ran it), nothing reloads and nothing is held", async () => {
    expect(await reloadForNewBuild(new Error("Failed to load chunk /_next/static/chunks/a.js from module 1"))).toBe(false)
    expect(holdReload(() => true)).toBeTypeOf("function")
  })

  // V-64 (29 Oct): with no network but the device saying it was online, a
  // fresh doc's first tap asked for code that couldn't come, and the page
  // reloaded: the doc and every key typed after were gone. Only the server
  // saying the code is gone reloads now.
  describe("the early script, the page's one probe", () => {
    const reload = vi.fn()
    const probe = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
    const answer = (status: number) => probe.mockImplementation(async () => new Response(null, { status }))
    const listeners: Array<[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = []
    const fail = (el: HTMLElement) => {
      document.head.appendChild(el)
      el.dispatchEvent(new Event("error"))
    }
    const script = (src: string) => Object.assign(document.createElement("script"), { src })
    const unhandled = (reason: unknown) => {
      const e = new Event("unhandledrejection")
      Object.defineProperty(e, "reason", { value: reason })
      window.dispatchEvent(e)
    }
    const chunkError = (file: string) => new Error(`Failed to load chunk ${file} from module 301842`)

    beforeEach(() => {
      vi.stubGlobal("location", { reload })
      vi.stubGlobal("fetch", probe)
      // Its listeners, so each test's page is a fresh one.
      const add = window.addEventListener.bind(window)
      const spy = vi.spyOn(window, "addEventListener").mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
        listeners.push([type, fn, opts])
        add(type, fn, opts)
      })
      new Function(CHUNK_RECOVERY_SCRIPT)()
      spy.mockRestore()
    })
    afterEach(() => {
      for (const [type, fn, opts] of listeners.splice(0)) window.removeEventListener(type, fn, opts)
      delete window.__ocChunk
      reload.mockReset()
      probe.mockReset()
      sessionStorage.clear()
      document.head.innerHTML = ""
      vi.useRealTimers()
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
    })

    it.each([404, 410])("reloads once when the server answers %i for the code that failed, never for a font", async (status) => {
      answer(status)
      fail(Object.assign(document.createElement("link"), { rel: "preload", href: "/_next/static/media/a.woff2" }))
      fail(Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/_next/static/chunks/a.css" }))
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
      expect(probe).toHaveBeenCalledTimes(1)
      const [url, init] = probe.mock.calls[0]
      expect(url).toMatch(/\/_next\/static\/chunks\/a\.css$/)
      expect(init).toMatchObject({ method: "HEAD", cache: "no-store" })
      // A second within the guard: no loop.
      fail(script("/_next/static/chunks/b.js"))
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2))
      await new Promise((r) => setTimeout(r, 10))
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it("leaves the page as it is when the network doesn't answer, the server fails, or the file is there after all", async () => {
      for (const make of [
        () => probe.mockRejectedValueOnce(new TypeError("Failed to fetch")),
        () => probe.mockResolvedValueOnce(new Response(null, { status: 500 })),
        () => probe.mockResolvedValueOnce(new Response(null, { status: 200 })),
      ]) {
        make()
        expect(await reloadForNewBuild(chunkError("/_next/static/chunks/c.js"))).toBe(false)
      }
      expect(probe).toHaveBeenCalledTimes(3)
      expect(reload).not.toHaveBeenCalled()
    })

    it("reloads for a boot file that failed and is there after all, once the page is free; never offline, never after load", async () => {
      // A page still loading: its scripts and stylesheets are its boot files (CR-82's SF2).
      vi.spyOn(document, "readyState", "get").mockReturnValue("loading")
      const add = window.addEventListener.bind(window)
      vi.spyOn(window, "addEventListener").mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
        listeners.push([type, fn, opts])
        add(type, fn, opts)
      })
      new Function(CHUNK_RECOVERY_SCRIPT)()
      // The network still dead: the page stays (a reload would land on the browser's offline page).
      probe.mockRejectedValue(new TypeError("Failed to fetch"))
      fail(script("/_next/static/chunks/boot-a.js"))
      await vi.waitFor(() => expect(probe).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 10))
      expect(reload).not.toHaveBeenCalled()
      // Back: the file is there after all, so the failure was the network's. Held work waits, then it reloads.
      let typing = true
      const release = holdReload(() => typing)
      answer(200)
      fail(Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/_next/static/chunks/boot.css" }))
      await new Promise((r) => setTimeout(r, 30))
      expect(reload).not.toHaveBeenCalled()
      typing = false
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1), { timeout: 3_000 })
      release()
      // Once the page has loaded, a file that fails is a lazy piece's: only a gone build reloads.
      window.dispatchEvent(new Event("load"))
      sessionStorage.clear()
      fail(script("/_next/static/chunks/late.js"))
      await new Promise((r) => setTimeout(r, 30))
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it(`gives up after ${CHUNK_PROBE_MS} ms without an answer, and stays`, async () => {
      vi.useFakeTimers()
      let aborted = false
      probe.mockImplementation(
        (_url, init) =>
          new Promise((_, reject) =>
            init?.signal?.addEventListener("abort", () => {
              aborted = true
              reject(new DOMException("aborted", "AbortError"))
            }),
          ),
      )
      const asked = reloadForNewBuild(chunkError("/_next/static/chunks/slow.js"))
      await vi.advanceTimersByTimeAsync(CHUNK_PROBE_MS - 1)
      expect(aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await asked).toBe(false)
      expect(aborted).toBe(true)
      expect(reload).not.toHaveBeenCalled()
    })

    it("never asks while the device says it is offline", async () => {
      answer(404)
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
      fail(script("/_next/static/chunks/d.js"))
      unhandled(chunkError("/_next/static/chunks/d.js"))
      expect(await reloadForNewBuild(chunkError("/_next/static/chunks/d.js"))).toBe(false)
      expect(probe).not.toHaveBeenCalled()
      expect(reload).not.toHaveBeenCalled()
    })

    it("asks for the file a chunk error names, the app's catches and the errors nobody caught alike, once at a time", async () => {
      answer(404)
      expect(await reloadForNewBuild(new Error("Cannot read properties of undefined"))).toBe(false)
      expect(await reloadForNewBuild(new Error("Loading chunk 735 failed."))).toBe(false)
      expect(probe).not.toHaveBeenCalled()
      unhandled(chunkError("/_next/static/immutable/chunks/2usdb19hdnjea.js"))
      unhandled(chunkError("/_next/static/immutable/chunks/2usdb19hdnjea.js"))
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
      expect(probe).toHaveBeenCalledTimes(1)
      expect(probe.mock.calls[0][0]).toBe("/_next/static/immutable/chunks/2usdb19hdnjea.js")
      sessionStorage.clear()
      reload.mockReset()
      expect(await reloadForNewBuild(chunkError("/_next/static/chunks/e.js"))).toBe(true)
      expect(probe.mock.calls[1][0]).toBe("/_next/static/chunks/e.js")
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it("waits while the page holds work a reload would lose, and reloads once it's let go", async () => {
      vi.useFakeTimers()
      answer(404)
      let unsent = true
      const release = holdReload(() => unsent)
      expect(await reloadForNewBuild(chunkError("/_next/static/chunks/f.js"))).toBe(false)
      await vi.advanceTimersByTimeAsync(CHUNK_HELD_POLL_MS * 3)
      expect(reload).not.toHaveBeenCalled()
      unsent = false
      await vi.advanceTimersByTimeAsync(CHUNK_HELD_POLL_MS)
      expect(reload).toHaveBeenCalledTimes(1)
      // Let go of, a hold no longer counts.
      sessionStorage.clear()
      unsent = true
      release()
      expect(await reloadForNewBuild(chunkError("/_next/static/chunks/g.js"))).toBe(true)
      expect(reload).toHaveBeenCalledTimes(2)
    })
  })
})
