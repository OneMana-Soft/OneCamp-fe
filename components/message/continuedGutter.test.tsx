import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ContinuedGutter } from "./continuedGutter"
import { chatClock } from "@/lib/chat/clock"

// Design v3 chat, C08: the gutter time of a continued message is the reader's
// own clock at 11px tabular, right-aligned to the 36px column, shown with the
// row's hover or focus. The widest form ("12:59 PM") runs left into the row's
// 20px margin, so the column never widens and the text never moves.
describe("ContinuedGutter", () => {
  it("shows the reader's clock on hover and keeps the author and full time for a screen reader", () => {
    const { container } = render(<ContinuedGutter createdAt="2026-10-10T15:04:00" authorName="Maya Chen" />)
    const time = container.querySelector("time")!
    expect(time.textContent).toBe(chatClock("2026-10-10T15:04:00"))
    expect(time.className).toContain("opacity-0")
    expect(time.className).toContain("group-hover/row:opacity-100")
    expect(time.className).toContain("tabular-nums")
    expect(time.className).toContain("text-3xs")
    // One line, held to the column's right edge, so the overflow runs left.
    expect(time.className).toContain("whitespace-nowrap")
    expect(time.className).toContain("absolute right-0")
    expect(time.parentElement!.className).toContain("w-9")
    expect(time.getAttribute("title")).toBe("Saturday 10 October 2026, 3:04 PM")
    expect(container.querySelector(".sr-only")?.textContent).toBe("Maya Chen, Saturday 10 October 2026, 3:04 PM")
  })

  it("shows the pending clock while sending and the alert when not sent", () => {
    const sending = render(<ContinuedGutter createdAt="2026-10-10T15:04:00" authorName="Maya" sending />)
    expect(sending.container.querySelector("[data-sending-note]")).toBeTruthy()
    expect(sending.container.querySelector("time")).toBeNull()
    const failed = render(<ContinuedGutter createdAt="2026-10-10T15:04:00" authorName="Maya" failed />)
    expect(failed.container.querySelector("[data-failed-mark]")).toBeTruthy()
  })
})
