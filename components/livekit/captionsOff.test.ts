import { describe, expect, it } from "vitest"
import { captionsOffLabel, captionsOffSaid, captionsRefusal } from "./captionsOff"
import { captionsAction } from "./VideoControls"

// zoom-09 C2: in server mode with no transcriber running, captions are off and
// the Captions control says why in one plain line. Only a workspace admin is
// pointed at the card that starts it; transcription_disabled keeps its words.

describe("why captions can't come on (zoom-09 C2)", () => {
  it("tells a member the transcriber isn't running and to ask an admin", () => {
    expect(captionsOffSaid("transcriber_not_running", false)).toEqual({
      title: "Captions are off: this workspace's transcriber isn't running. Ask an admin to start it.",
    })
  })

  it("gives an admin the link to Admin > Transcription", () => {
    expect(captionsOffSaid("transcriber_not_running", true)).toEqual({
      title: "Captions are off: this workspace's transcriber isn't running.",
      link: { href: "/app/admin?tab=transcription", label: "Start it in Admin > Transcription" },
    })
  })

  it("says nothing new when captions can come on, or are turned off for the workspace", () => {
    expect(captionsOffSaid("", false)).toBeNull()
    expect(captionsOffSaid(undefined, true)).toBeNull()
    expect(captionsOffSaid("transcription_disabled", true)).toBeNull()
  })

  it("labels the Captions control with why, not with an offer to turn them on", () => {
    const why = captionsOffLabel("transcriber_not_running")
    expect(why).toBe("Captions are off: this workspace's transcriber isn't running.")
    expect(captionsAction({ captionsOff: true, captionsWhy: why })).toBe(why)
    expect(captionsAction({ captionsOff: true, captionsWhy: captionsOffLabel("") })).toBe("Turn on captions")
    expect(captionsAction({ captionsOff: false, captionsWhy: why, showCaptions: true })).toBe("Hide captions")
  })

  it("puts the server's refusal in the same words, and keeps today's for a workspace with transcription off", () => {
    expect(captionsRefusal("transcriber_not_running", false)).toBe(
      "Captions are off: this workspace's transcriber isn't running. Ask an admin to start it.",
    )
    expect(captionsRefusal("transcriber_not_running", true)).toBe(
      "Captions are off: this workspace's transcriber isn't running. Start it in Admin > Transcription.",
    )
    expect(captionsRefusal("transcription_disabled", false)).toBe(
      "Captions are turned off for this workspace. An admin can turn them on under Call transcription.",
    )
    expect(captionsRefusal("something_else", false)).toBeUndefined()
  })
})
