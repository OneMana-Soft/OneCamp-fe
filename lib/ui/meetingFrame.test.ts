import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useMeetingFrame } from "./meetingFrame"

const PHONE = { isMobile: true, isDesktop: false }
const COMPUTER = { isMobile: false, isDesktop: true }
// useMedia's first render, before it has read the window.
const UNKNOWN = { isMobile: false, isDesktop: false }

type Props = { media: typeof PHONE; meeting: boolean }
const frame = (initialProps: Props) => renderHook(({ media, meeting }: Props) => useMeetingFrame(media, meeting), { initialProps })

describe("the frame the shell draws a call's page in", () => {
  it("follows the width on any other page", () => {
    const { result, rerender } = frame({ media: COMPUTER, meeting: false })
    expect(result.current).toBe(false)
    rerender({ media: PHONE, meeting: false })
    expect(result.current).toBe(true)
    rerender({ media: COMPUTER, meeting: false })
    expect(result.current).toBe(false)
  })

  it("keeps the frame a call's page opened in, whatever the width does, until the page is left", () => {
    const { result, rerender } = frame({ media: UNKNOWN, meeting: true })
    // Not yet known: nothing is held.
    expect(result.current).toBe(false)
    rerender({ media: PHONE, meeting: true })
    expect(result.current).toBe(true)
    // A phone turned, or a window widened: still the phone's frame.
    rerender({ media: COMPUTER, meeting: true })
    expect(result.current).toBe(true)
    rerender({ media: PHONE, meeting: true })
    expect(result.current).toBe(true)
    rerender({ media: COMPUTER, meeting: true })
    expect(result.current).toBe(true)
    // Left: the width again.
    rerender({ media: COMPUTER, meeting: false })
    expect(result.current).toBe(false)
    // The next call's page opens in the frame of its own width, and keeps it.
    rerender({ media: COMPUTER, meeting: true })
    expect(result.current).toBe(false)
    rerender({ media: PHONE, meeting: true })
    expect(result.current).toBe(false)
  })
})
