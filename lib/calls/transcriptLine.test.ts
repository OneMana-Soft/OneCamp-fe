import { describe, expect, it } from "vitest"
import { lineAt, lineStartSeconds } from "@/lib/calls/transcriptLine"

describe("where a transcript's line sits in its call", () => {
  it("takes the line's own offset, skew-free, before rebuilding one from two clocks", () => {
    expect(lineStartSeconds({ transcript_offset_ms: 12_500, transcript_timestamp: 0 }, 0)).toBe(12.5)
    // A legacy line: its time (seconds or ms) less the recording's start.
    expect(lineStartSeconds({ transcript_timestamp: 1_700_000_030 }, 1_700_000_000_000)).toBe(30)
    expect(lineStartSeconds({ transcript_timestamp: 1_700_000_030_000 }, 1_700_000_000_000)).toBe(30)
  })

  it("never puts a line before the start", () => {
    expect(lineStartSeconds({ transcript_timestamp: 1_700_000_000 }, 1_700_000_005_000)).toBe(0)
    expect(lineStartSeconds({ transcript_timestamp: Number.NaN }, 0)).toBe(0)
  })

  it("finds the line at or before a moment", () => {
    const starts = [0, 4, 9.5, 20]
    expect(lineAt(starts, 9.5)).toBe(2)
    expect(lineAt(starts, 12)).toBe(2)
    expect(lineAt(starts, 3.9)).toBe(0)
    expect(lineAt(starts, 600)).toBe(3)
    expect(lineAt([], 5)).toBe(-1)
  })
})
