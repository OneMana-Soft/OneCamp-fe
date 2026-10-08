import { describe, expect, it } from "vitest"
import { CLIP_MAX_SECONDS, clipFileName, extensionOf, pickMimeType, secondsLeft, stopReason } from "@/lib/clips/clip"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"

describe("a clip", () => {
  it("records in the first container the browser has", () => {
    const chrome = (t: string) => t.startsWith("video/webm") || t.startsWith("audio/webm")
    expect(pickMimeType("video", chrome)).toBe("video/webm;codecs=vp9,opus")
    expect(pickMimeType("voice", chrome)).toBe("audio/webm;codecs=opus")
    const safari = (t: string) => t === "video/mp4" || t === "audio/mp4"
    expect(pickMimeType("screen", safari)).toBe("video/mp4")
    expect(pickMimeType("voice", safari)).toBe("audio/mp4")
    expect(pickMimeType("video", () => false)).toBeUndefined()
    expect(pickMimeType("video", () => { throw new Error("old browser") })).toBeUndefined()
  })

  it("is named for its kind and when, with the right extension", () => {
    const at = new Date(2026, 9, 8, 22, 5)
    expect(clipFileName("voice", "audio/webm;codecs=opus", at)).toBe("Voice clip 2026-10-08 22.05.weba")
    expect(clipFileName("video", "video/webm;codecs=vp9,opus", at)).toBe("Video clip 2026-10-08 22.05.webm")
    // Filed as what it is: a voice clip plays as audio, a video clip as video.
    expect(getAttachmentType("Voice clip 2026-10-08 22.05.weba")).toBe("audio")
    expect(getAttachmentType("Video clip 2026-10-08 22.05.webm")).toBe("video")
    expect(getAttachmentType("Voice clip 2026-10-08 22.05.m4a")).toBe("audio")
    expect(clipFileName("screen", "video/mp4", at)).toBe("Screen clip 2026-10-08 22.05.mp4")
    expect(extensionOf("audio/mp4")).toBe("m4a")
    expect(extensionOf("audio/ogg;codecs=opus")).toBe("ogg")
  })

  it("stops at five minutes, or just short of the upload limit", () => {
    expect(stopReason(CLIP_MAX_SECONDS, 0, undefined)).toBe("time")
    expect(stopReason(10, 9_500_000, 10_000_000)).toBe("size")
    expect(stopReason(10, 9_000_000, 10_000_000)).toBeNull()
    expect(stopReason(10, 9_500_000, undefined)).toBeNull()
  })

  it("says about how long is left, by time or by size", () => {
    expect(secondsLeft(0, 0, 10_000_000)).toBe(CLIP_MAX_SECONDS)
    // 1 MB in 10 s: 9.4 MB of room minus 1 MB is about 84 s more.
    expect(Math.round(secondsLeft(10, 1_000_000, 10_000_000))).toBe(84)
    // A small voice clip: time runs out first.
    expect(secondsLeft(60, 480_000, 10_000_000)).toBe(CLIP_MAX_SECONDS - 60)
  })
})
