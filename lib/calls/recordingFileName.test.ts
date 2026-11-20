import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { playerTitle, recordingFileName } from "@/lib/calls/recordingFileName"

pinTestClock()

describe("a recording's download", () => {
  it("is named by when it started", () => {
    expect(recordingFileName(new Date(2026, 10, 6, 14, 5).toISOString())).toBe("Recording 2026-11-06 14.05.mp4")
    expect(recordingFileName("")).toBe("Recording.mp4")
  })
})

describe("the player's title (CR-330 F2)", () => {
  const at = new Date(2026, 10, 12, 5, 44).toISOString()
  it("is a recording's file, from its row or else its start, and plain Recording knowing neither", () => {
    expect(playerTitle({ fileName: "Recording 2026-11-12 05.44.mp4" })).toBe("Recording 2026-11-12 05.44.mp4")
    expect(playerTitle({ fileName: "", startedAt: at })).toBe("Recording 2026-11-12 05.44.mp4")
    expect(playerTitle({ startedAt: "" })).toBe("Recording")
  })
  it("names no file for a call nobody recorded: the call on its day", () => {
    expect(playerTitle({ fileName: "Recording.mp4", startedAt: at, transcriptOnly: true })).toBe("Call on 12 Nov 2026")
    expect(playerTitle({ transcriptOnly: true })).toBe("Call")
  })
  it("keeps the name its host gives a call nobody recorded: an event's call is its event's transcript (F3)", () => {
    expect(playerTitle({ fileName: "Weekly design review transcript", startedAt: at, transcriptOnly: true })).toBe("Weekly design review transcript")
    expect(playerTitle({ fileName: "Recording 2026-11-12 05.44.mp4", startedAt: at, transcriptOnly: true })).toBe("Call on 12 Nov 2026")
  })
})
