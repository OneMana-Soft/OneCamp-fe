import { describe, expect, it } from "vitest"

import { isAppleTouch } from "@/lib/platform"

// iOS and iPadOS, where every browser is WebKit: an iPad in its desktop mode
// says it is a Mac, and has touch points, as no Mac does.
const UA = {
  iPhoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iPhoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  iPadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  windowsChromeTouch: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
}

describe("isAppleTouch", () => {
  it("is an iPhone or an iPad, whatever its browser, and an iPad that says it is a Mac", () => {
    expect(isAppleTouch({ userAgent: UA.iPhoneSafari, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleTouch({ userAgent: UA.iPhoneChrome, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleTouch({ userAgent: UA.iPadDesktop, maxTouchPoints: 5 })).toBe(true)
  })

  it("is never a Mac, an Android phone or a touch laptop's Chrome", () => {
    expect(isAppleTouch({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false)
    expect(isAppleTouch({ userAgent: UA.androidChrome, maxTouchPoints: 5 })).toBe(false)
    expect(isAppleTouch({ userAgent: UA.samsung, maxTouchPoints: 5 })).toBe(false)
    expect(isAppleTouch({ userAgent: UA.windowsChromeTouch, maxTouchPoints: 10 })).toBe(false)
    expect(isAppleTouch(undefined)).toBe(false)
  })
})
