import { afterEach, describe, expect, it, vi } from "vitest"
import { chromiumBrowser, forgetOnePeerConnection, httpOf, onePeerConnection } from "./onePeerConnection"

// One peer connection only where this workspace's LiveKit takes it: asked on
// /rtc/v1/validate, which LiveKit v1.10 and later answer and older ones 404.

afterEach(() => {
  forgetOnePeerConnection()
  vi.unstubAllGlobals()
})

describe("which LiveKit takes one peer connection", () => {
  it("finds the server's address from the call's", () => {
    expect(httpOf("wss://livekit.example.com")).toBe("https://livekit.example.com")
    expect(httpOf("ws://127.0.0.1:7880/")).toBe("http://127.0.0.1:7880")
    expect(httpOf("wss://example.com/livekit/")).toBe("https://example.com/livekit")
    expect(httpOf("not a url")).toBeNull()
    expect(httpOf("ftp://example.com")).toBeNull()
  })

  it("is a server that answers the new path, with anything but a 404", async () => {
    const fetch = vi.fn(async () => new Response("missing token", { status: 401 }))
    vi.stubGlobal("fetch", fetch)
    expect(await onePeerConnection("wss://lk.example.com", { chromium: true })).toBe(true)
    expect(fetch).toHaveBeenCalledWith("https://lk.example.com/rtc/v1/validate", expect.objectContaining({ method: "GET", credentials: "omit" }))
  })

  it("isn't an older server, one that can't be reached, or one too slow to say", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("404 page not found", { status: 404 })))
    expect(await onePeerConnection("wss://old.example.com", { chromium: true })).toBe(false)
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))))
    expect(await onePeerConnection("wss://down.example.com", { chromium: true })).toBe(false)
    vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))))
    expect(await onePeerConnection("wss://slow.example.com", { chromium: true, timeoutMs: 20 })).toBe(false)
  })

  it("asks each server once a page", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }))
    vi.stubGlobal("fetch", fetch)
    await Promise.all([onePeerConnection("wss://lk.example.com", { chromium: true }), onePeerConnection("wss://lk.example.com/", { chromium: true })])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // Measured on 18 Oct 2026 (perf-data/onepc-2026-10-18.json): one connection
  // is three times faster in Chromium, no faster in Firefox, slower in WebKit.
  it("is only Chromium's: Firefox, Safari and anything on an iPhone keep two, and aren't asked", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }))
    vi.stubGlobal("fetch", fetch)
    expect(await onePeerConnection("wss://lk.example.com", { chromium: false })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    expect(chromiumBrowser({ userAgent: chrome })).toBe(true)
    expect(chromiumBrowser({ userAgent: `${chrome} Edg/141.0.0.0` })).toBe(true)
    expect(chromiumBrowser({ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0" })).toBe(false)
    expect(chromiumBrowser({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15" })).toBe(false)
    expect(chromiumBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1" })).toBe(false)
    expect(chromiumBrowser({ userAgent: "anything", userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }] } })).toBe(true)
    expect(chromiumBrowser(undefined)).toBe(false)
  })
})
