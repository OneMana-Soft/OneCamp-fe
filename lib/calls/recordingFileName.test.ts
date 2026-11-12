import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { recordingFileName } from "@/lib/calls/recordingFileName"

pinTestClock()

describe("a recording's download", () => {
  it("is named by when it started", () => {
    expect(recordingFileName(new Date(2026, 10, 6, 14, 5).toISOString())).toBe("Recording 2026-11-06 14.05.mp4")
    expect(recordingFileName("")).toBe("Recording.mp4")
  })
})
