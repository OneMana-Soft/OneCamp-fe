// One peer connection or two (zoom-10): a second connection's DTLS handshake
// was a second of every join (perf-mobile.md §1: the first remote picture at
// 1362 ms with two, 366 ms with one). livekit-client 2.16 joins on one when
// asked and never falls back, and a LiveKit server older than v1.9.4 can't
// take that join, so the call asks the server first: one that answers on
// /rtc/v1/validate (v1.10.0 and later; every compose ships v1.11.0) takes
// it; anything else, or no answer within a second, gets two, as before.
// Asked once per server per page, while the green room is open.
//
// Only in Chromium browsers, measured on 18 Oct 2026 against LiveKit 1.11.0
// (calls-vs-zoom/perf-data/onepc-2026-10-18.json, join to the first decoded
// remote frame, medians): Chromium 405 ms with one against 1235 with two;
// Firefox 1344 against 1354, no gain; WebKit 3430 against 2870, slower.
// Firefox and Safari, and every browser on an iPhone or iPad, keep two.

const asked = new Map<string, Promise<boolean>>()

/** The server's HTTP address for a LiveKit URL (ws:// or wss://), or null. Pure. */
export function httpOf(serverUrl: string): string | null {
  try {
    const u = new URL(serverUrl)
    if (u.protocol === "ws:") u.protocol = "http:"
    else if (u.protocol === "wss:") u.protocol = "https:"
    else if (u.protocol !== "http:" && u.protocol !== "https:") return null
    u.pathname = u.pathname.replace(/\/+$/, "")
    u.search = ""
    u.hash = ""
    return u.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

interface BrowserHints {
  userAgent: string
  userAgentData?: { brands?: { brand: string }[] }
}

/** Whether this is a Chromium browser (Chrome, Edge, Opera, Brave; on a computer or Android). Pure. */
export function chromiumBrowser(nav: BrowserHints | undefined = typeof navigator === "undefined" ? undefined : (navigator as unknown as BrowserHints)): boolean {
  if (!nav) return false
  const brands = nav.userAgentData?.brands
  if (brands?.length) return brands.some((b) => b.brand === "Chromium")
  const ua = nav.userAgent
  // Every browser on an iPhone or iPad is WebKit, whatever it is called.
  if (/iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(ua)) return false
  return /Chrome\/\d+/.test(ua) && !/Firefox\//.test(ua)
}

/**
 * Whether this call joins on one peer connection: a Chromium browser, and a
 * LiveKit server that takes it. A 404 on /rtc/v1/validate is an older server;
 * any other answer is a newer one (it says 401 to a call without a token). A
 * failure or a slow answer is no.
 */
export function onePeerConnection(serverUrl: string, opts: { timeoutMs?: number; chromium?: boolean } = {}): Promise<boolean> {
  const { timeoutMs = 1000, chromium = chromiumBrowser() } = opts
  const http = httpOf(serverUrl)
  if (!chromium || !http || typeof fetch === "undefined") return Promise.resolve(false)
  let p = asked.get(http)
  if (!p) {
    p = (async () => {
      const stop = typeof AbortController !== "undefined" ? new AbortController() : null
      const timer = setTimeout(() => stop?.abort(), timeoutMs)
      try {
        const res = await fetch(`${http}/rtc/v1/validate`, { method: "GET", cache: "no-store", credentials: "omit", signal: stop?.signal })
        return res.status !== 404
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    })()
    asked.set(http, p)
  }
  return p
}

/** Forgets what servers said, for tests. */
export function forgetOnePeerConnection(): void {
  asked.clear()
}
