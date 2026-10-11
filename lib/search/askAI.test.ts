import { describe, expect, it, vi } from "vitest"

import { askAIHref, takeAskParam } from "@/lib/search/askAI"

function fakeWindow(href: string) {
  const replaceState = vi.fn()
  return { win: { location: { href } as Location, history: { state: null, replaceState } as unknown as History }, replaceState }
}

describe("asking OneCamp AI from a link", () => {
  it("round-trips the question through the address", () => {
    const { win } = fakeWindow(`https://x.test${askAIHref("where are we on the launch?")}`)
    expect(takeAskParam(win)).toBe("where are we on the launch?")
  })

  it("takes the question out of the address, keeping anything else, so a reload asks nothing", () => {
    const { win, replaceState } = fakeWindow("https://x.test/app/ai?ask=hi%20there&from=search#top")
    expect(takeAskParam(win)).toBe("hi there")
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app/ai?from=search#top")
  })

  it("asks nothing when there is no question", () => {
    const { win, replaceState } = fakeWindow("https://x.test/app/ai")
    expect(takeAskParam(win)).toBeUndefined()
    expect(replaceState).not.toHaveBeenCalled()
    expect(takeAskParam(fakeWindow("https://x.test/app/ai?ask=%20%20").win)).toBeUndefined()
  })
})
