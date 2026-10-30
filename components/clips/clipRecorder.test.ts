import { describe, expect, it } from "vitest"
import { clipDoneLine } from "./ClipRecorder"

// A finished clip's size reads as every file's does (lib/utils/format's
// formatFileSizeForAttachment): it said "0.3 MB" for a 300 KB clip, and
// "2.0 MB" where its file's card says "2 MB".
describe("a finished clip's line", () => {
  it("says how long it runs and its size, as the app writes a file's", () => {
    expect(clipDoneLine(12, 300 * 1024)).toBe("00:12 · 300 KB")
    expect(clipDoneLine(95, 2 * 1024 * 1024)).toBe("01:35 · 2 MB")
    expect(clipDoneLine(61, 2.5 * 1024 * 1024)).toBe("01:01 · 2.5 MB")
  })
})
