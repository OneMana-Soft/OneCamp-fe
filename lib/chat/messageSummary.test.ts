import { describe, expect, it } from "vitest"
import { messageSummary, SUMMARY_CHARS } from "./messageSummary"
import { clockTime } from "@/lib/utils/date/clock"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SD-53, SD-54: a message row is labelled, and a live one announced, by who
// wrote it, when, and what it says, as Slack's message summary.
describe("a message's summary", () => {
  const maya = { user_name: "Maya Chen" }
  const at = "2026-10-14T09:42:00Z"

  it("says who, when and what, without markup", () => {
    expect(messageSummary({ from: maya, at, html: '<p>Final hero is <strong>in</strong>, <span data-type="mention" data-label="Sam">@Sam</span></p>' }))
      .toBe(`Maya Chen, ${clockTime(at)}: Final hero is in, @Sam`)
  })

  it("reads at most 160 characters", () => {
    const said = messageSummary({ from: maya, html: `<p>${"a".repeat(400)}</p>` })
    expect(said).toBe(`Maya Chen: ${"a".repeat(SUMMARY_CHARS - 1)}…`)
  })

  it("counts files, alone or after the words", () => {
    expect(messageSummary({ from: maya, files: 2 })).toBe("Maya Chen: 2 files")
    expect(messageSummary({ from: maya, html: "<p>Logos</p>", files: 1 })).toBe("Maya Chen: Logos, 1 file")
  })

  it("names a bot by its own name, and someone unknown as someone", () => {
    expect(messageSummary({ from: { user_name: "onecamp-ai", user_full_name: "OneCamp AI", is_bot: true }, html: "<p>Done</p>" })).toBe("OneCamp AI: Done")
    expect(messageSummary({ html: "<p>hi</p>" })).toBe("Someone: hi")
  })
})
