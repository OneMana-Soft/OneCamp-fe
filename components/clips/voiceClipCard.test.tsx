import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useFetch", () => ({ useMediaFetch: () => ({ data: { url: "https://files.example/clip.weba" } }) }))
const { VoiceClipCard, isVoiceClip, waveformOf } = await import("./VoiceClipCard")

// Design v3 chat, C57: a voice clip recorded here plays in place, a 44px
// player with a 48-bar waveform, instead of a file to download.
afterEach(cleanup)

describe("a voice clip", () => {
  it("is told apart by the name the recorder gives it, and only for audio", () => {
    expect(isVoiceClip({ attachment_file_name: "Voice clip 2026-10-08 22.15.weba", attachment_raw_type: "audio/webm" })).toBe(true)
    expect(isVoiceClip({ attachment_file_name: "Video clip 2026-10-08 22.15.webm", attachment_raw_type: "video/webm" })).toBe(false)
    expect(isVoiceClip({ attachment_file_name: "Voice clip 2026-10-08 22.15.pdf", attachment_raw_type: "application/pdf" })).toBe(false)
    expect(isVoiceClip({ attachment_file_name: "notes.weba", attachment_raw_type: "audio/webm" })).toBe(false)
  })

  it("has one shape per clip: 48 bars between 20 and 100%", () => {
    const a = waveformOf("clip-1")
    expect(a).toHaveLength(48)
    expect(waveformOf("clip-1")).toEqual(a)
    expect(waveformOf("clip-2")).not.toEqual(a)
    for (const h of a) {
      expect(h).toBeGreaterThanOrEqual(20)
      expect(h).toBeLessThanOrEqual(100)
    }
  })

  it("plays in a 44px card with its waveform and a named play button", () => {
    const { container } = render(
      <VoiceClipCard
        attachment={{ attachment_uuid: "c1", attachment_file_name: "Voice clip 2026-10-08 22.15.weba", attachment_type: "document", attachment_size: 1, attachment_created_at: "", attachment_raw_type: "audio/webm", attachment_duration: 67 }}
        mediaGetUrl="/ch/getFile/c1"
      />,
    )
    const card = container.querySelector("[data-voice-clip]")!
    expect(card.className).toContain("h-11")
    expect(card.className).toContain("bg-raised")
    expect(container.querySelectorAll("[data-waveform] > span")).toHaveLength(48)
    expect(screen.getByRole("button", { name: /^Play Voice clip/ })).toBeTruthy()
    expect(card.textContent).toContain("1:07")
  })
})
