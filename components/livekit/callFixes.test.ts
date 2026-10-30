// The calls P0 fixes' pure parts (design/calls-vs-zoom/P0.md, 13 Oct): why a
// device failed, the call's keys, the call's state, the room's options, the
// AI answers' origin, and the recording link.
import { describe, expect, it } from "vitest"
import { AudioPresets } from "livekit-client"
import { CONNECT_FAILURE_TEXT, SCREEN_UNAVAILABLE, callMediaFailure, callsUnavailableHere, canShareScreen, connectFailureOf } from "./callErrors"
import { CALL_KEYS, CONTROL_KEYS, callKeyAction } from "./callKeys"
import {
  captionsConfirmText,
  captionsLabel,
  captionsWhereText,
  joinLanguage,
  peopleInCall,
  readCallMetadata,
  readRemovalPacket,
  removedText,
  speechLanguage,
} from "./callState"
import { callRoomOptions } from "./roomOptions"
import { acceptsAnswer } from "./useInCallAgent"
import { linkSpent, readRecordingMedia } from "@/components/dialog/useRecordingPlayback"
import { MODE_DESCRIPTION, agentStatus } from "@/components/admin/TranscriptionSettingsCard"
import { meetingUnavailable } from "./InstantMeetingView"

const err = (name: string, message = "") => Object.assign(new Error(message), { name })

describe("CALL-BUG-1: a device that won't turn on says why", () => {
  it("names the browser's refusal, a busy device, a missing one and the call's own refusal", () => {
    expect(callMediaFailure("microphone", err("NotAllowedError"))?.title).toBe("Your browser blocked the microphone")
    expect(callMediaFailure("camera", err("NotReadableError"))?.title).toBe("Your camera is in use")
    expect(callMediaFailure("microphone", err("NotFoundError"))?.title).toBe("No microphone was found")
    // What LiveKit 2.16 throws when the token leaves the source out.
    expect(callMediaFailure("microphone", err("PublishTrackError", "failed to publish track, insufficient permissions"))?.title).toBe("This call didn't allow your microphone")
    expect(callMediaFailure("camera", new Error("failed to publish track, insufficient permissions"))?.title).toBe("This call didn't allow your camera")
    expect(callMediaFailure("microphone", new Error("weird"))?.title).toBe("Couldn't turn on your microphone")
  })

  it("says nothing when the screen picker is closed, and why when the computer said no", () => {
    expect(callMediaFailure("screen", err("NotAllowedError", "Permission denied"))).toBeNull()
    expect(callMediaFailure("screen", err("NotAllowedError", "Permission denied by system"))?.title).toBe("Your computer blocked screen sharing")
    expect(callMediaFailure("screen", err("DeviceUnsupportedError"))?.title).toBe(SCREEN_UNAVAILABLE)
    // The Linux desktop app with no screencast portal.
    expect(callMediaFailure("screen", err("OverconstrainedError", "Invalid constraint"))?.title).toBe("Screen sharing isn't available on this computer")
  })
})

describe("CALL-BUG-19: Share is offered only where a screen can be captured", () => {
  it("reads the browser's own getDisplayMedia, not a stand-in on the instance", () => {
    const withIt = { getDisplayMedia() {} }
    expect(canShareScreen({ mediaDevices: {} }, withIt)).toBe(true)
    // A phone: the prototype has none, even if a shim put one on the instance.
    expect(canShareScreen({ mediaDevices: { getDisplayMedia() {} } }, {})).toBe(false)
    expect(canShareScreen({}, withIt)).toBe(false)
    expect(canShareScreen(undefined, withIt)).toBe(false)
  })
})

describe("CALL-BUG-13: one key table drives the handlers and the tooltips", () => {
  it("teaches exactly the keys it answers", () => {
    expect(CONTROL_KEYS).toEqual({ mic: "M", camera: "V", share: "⇧S", captions: "C", ai: "J", layout: "L", hand: "H" })
    for (const row of CALL_KEYS) {
      expect(callKeyAction({ key: row.shift ? row.key.toUpperCase() : row.key, shiftKey: !!row.shift, metaKey: false, ctrlKey: false, altKey: false, repeat: false })).toBe(row.action)
    }
  })

  it("never fires while typing, with a modifier, on repeat, or with the wrong shift", () => {
    const base = { key: "m", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, repeat: false }
    const input = document.createElement("input")
    expect(callKeyAction({ ...base, target: input })).toBeNull()
    const editor = document.createElement("div")
    Object.defineProperty(editor, "isContentEditable", { value: true })
    expect(callKeyAction({ ...base, target: editor })).toBeNull()
    expect(callKeyAction({ ...base, metaKey: true })).toBeNull()
    expect(callKeyAction({ ...base, repeat: true })).toBeNull()
    expect(callKeyAction({ ...base, key: "M", shiftKey: true })).toBeNull()
    expect(callKeyAction({ ...base, key: "s" })).toBeNull()
    expect(callKeyAction({ ...base, key: "M" })).toBe("mic")
    // The green room answers only its two.
    expect(callKeyAction({ ...base, key: "l" }, ["mic", "camera"])).toBeNull()
  })
})

describe("CALL-BUG-2: captions are one switch for the call, said with where speech goes", () => {
  it("reads the server's switch, and nothing on a guess", () => {
    const meta = readCallMetadata(
      JSON.stringify({ isRecording: true, recordingStartedBy: "Maya Chen", egressID: "EG_1", transcription: { on: true, by: "Maya Chen", byId: "0x1", since: 5, where: "browser", kept: true } }),
    )
    expect(meta.recording).toEqual({ on: true, by: "Maya Chen", egressId: "EG_1" })
    expect(meta.transcription).toMatchObject({ on: true, by: "Maya Chen", byId: "0x1", since: 5, where: "browser", kept: true })
    expect(readCallMetadata('{"isRecording": false}').transcription.on).toBe(false)
    expect(readCallMetadata("not json").transcription.on).toBe(false)
    expect(readCallMetadata(JSON.stringify({ transcription: { on: "yes" } })).transcription.on).toBe(false)
    expect(readCallMetadata(JSON.stringify({ transcription: { on: false, by: "Jonas" } })).transcription).toMatchObject({ on: false, by: "Jonas" })
  })

  it("names Google and Microsoft in browser mode, and says whether the words are kept", () => {
    expect(captionsWhereText({ where: "browser", kept: true })).toBe(
      "What you say goes to your browser's speech service (Google in Chrome, Microsoft in Edge). The text is kept as this call's transcript.",
    )
    expect(captionsWhereText({ where: "browser", kept: false })).toContain("The text isn't kept after the call.")
    expect(captionsWhereText({ where: "server" })).toContain("this workspace's own server")
    expect(captionsWhereText({ where: "deepgram" })).toContain("Deepgram")
    expect(captionsWhereText({ where: "custom" })).toContain("speech-to-text service this workspace set up")
    expect(captionsConfirmText({ where: "browser", kept: true })).toContain("(Google in Chrome, Microsoft in Edge)")
    expect(captionsConfirmText({ where: "browser", kept: true })).toContain("Everyone in the call is told")
    // Kept as a transcript, the pill says so (calls audit); shown only, captions.
    expect(captionsLabel({ by: "Maya Chen" })).toBe("Transcript on · Maya")
    expect(captionsLabel({ by: "Maya Chen", kept: false })).toBe("Captions on · Maya")
    expect(captionsLabel({ kept: false })).toBe("Captions on")
  })

  it("recognises the workspace's language, else the person's, never a fixed en-US", () => {
    expect(speechLanguage("de-DE", { languages: ["hi-IN"], language: "hi-IN" })).toBe("de-DE")
    expect(speechLanguage("", { languages: ["hi-IN", "en-GB"], language: "hi-IN" })).toBe("hi-IN")
    expect(speechLanguage(undefined, { language: "fr-FR" })).toBe("fr-FR")
    expect(speechLanguage(undefined, {})).toBeUndefined()
    expect(joinLanguage({ languages: ["x".repeat(50)] })).toHaveLength(35)
  })

  it("tells the admin plainly where Browser mode's audio goes", () => {
    expect(MODE_DESCRIPTION.frontend).toContain("Chrome sends the audio to Google, and Edge to Microsoft")
    expect(MODE_DESCRIPTION.frontend).not.toMatch(/^Free/)
  })
})

describe("CALL-BUG-12: who is in the call, before joining", () => {
  it("names a guest by their name, not the server's Guest: prefix", () => {
    expect(peopleInCall([{ id: "g", name: "Guest: Priya" }, { id: "m", name: "Maya Chen" }])).toEqual([
      { id: "g", name: "Priya" },
      { id: "m", name: "Maya Chen" },
    ])
    expect(peopleInCall(undefined)).toBeUndefined()
  })
})

describe("CALL-BUG-4: the agent's state in words", () => {
  it("says Running or Not running", () => {
    expect(agentStatus({ running: true })?.label).toBe("Running")
    expect(agentStatus({ running: false })?.label).toBe("Not running")
    expect(agentStatus(undefined)).toBeNull()
  })
})

describe("CALL-BUG-11: only the server can say someone was removed", () => {
  const packet = (o: object) => new TextEncoder().encode(JSON.stringify(o))
  it("believes the server, never a participant", () => {
    expect(readRemovalPacket(packet({ v: 1, t: "removed", by: "Maya Chen", reason: "host" }), undefined)).toEqual({ reason: "host", by: "Maya Chen" })
    expect(readRemovalPacket(packet({ v: 1, t: "removed", by: "Maya Chen", reason: "host" }), { identity: "jonas" })).toBeNull()
    expect(readRemovalPacket(packet({ t: "other" }), undefined)).toBeNull()
    expect(readRemovalPacket(packet({ t: "removed", reason: "made-up" }), undefined)).toEqual({ reason: "unknown", by: undefined })
    // Put out because it couldn't be checked (fail closed, 21 Oct).
    expect(readRemovalPacket(packet({ v: 1, t: "removed", reason: "unconfirmed" }), undefined)).toEqual({ reason: "unconfirmed", by: undefined })
  })

  it("tells a member they can't come back, and never tells a guest so", () => {
    expect(removedText({ reason: "host", by: "Maya Chen" }).detail).toBe("Maya Chen removed you, so you can't rejoin this call.")
    expect(removedText({ reason: "host", by: "Maya Chen" }, true).detail).toBe("Maya Chen removed you from this meeting.")
    expect(removedText({ reason: "link_revoked" }).title).toBe("Your invite was turned off")
    expect(removedText({ reason: "not_member" }).detail).toContain("no longer a member")
    expect(removedText(null).title).toBe("You were removed from the call")
    // Never "removed you" for a check that couldn't answer: they can come back.
    expect(removedText({ reason: "unconfirmed" })).toEqual({ title: "You left the call", detail: "We couldn't confirm you can be in this call just now. Join again in a moment." })
    expect(removedText({ reason: "unconfirmed" }, true).detail).toBe("We couldn't confirm you can be in this meeting just now. Join again in a moment.")
  })
})

describe("CALL-BUG-20 and 21: the room's options", () => {
  it("asks for the layer each tile needs, encodes only what is watched, and sends speech", () => {
    const o = callRoomOptions({}, false)
    expect(o.adaptiveStream).toBe(true)
    expect(o.dynacast).toBe(true)
    expect(o.publishDefaults?.audioPreset).toEqual(AudioPresets.speech)
    // Two peer connections unless the server said it takes one (lib/calls/onePeerConnection).
    expect(o.singlePeerConnection).toBe(false)
    expect(callRoomOptions({}, false, true).singlePeerConnection).toBe(true)
    // LiveKit's own capture defaults stay underneath: nothing turns voice isolation off.
    expect(o.audioCaptureDefaults).not.toHaveProperty("voiceIsolation")
    expect(o.audioCaptureDefaults).not.toHaveProperty("noiseSuppression")
  })

  it("opens the green room's devices, and plays through its speaker where the browser can", () => {
    const prefs = { audioinput: "mic-2", videoinput: "cam-2", audiooutput: "headphones" }
    expect(callRoomOptions(prefs, true)).toMatchObject({
      audioCaptureDefaults: { deviceId: "mic-2" },
      videoCaptureDefaults: { deviceId: "cam-2" },
      audioOutput: { deviceId: "headphones" },
    })
    // Safari can't choose an output: no stand-in that would fail.
    expect(callRoomOptions(prefs, false)).not.toHaveProperty("audioOutput")
    expect(callRoomOptions({}, true)).not.toHaveProperty("audioOutput")
  })
})

describe("CALL-BUG-14: an answer comes from the server, for the person who asked", () => {
  it("fills only the matching question, never your own, never for someone else", () => {
    const item = { id: "q1", mine: false, askerId: "maya" }
    expect(acceptsAnswer(item, "q1", "maya")).toBe(true)
    expect(acceptsAnswer(item, "q1", "jonas")).toBe(false)
    expect(acceptsAnswer(item, "q2", "maya")).toBe(false)
    expect(acceptsAnswer({ ...item, mine: true }, "q1", "maya")).toBe(false)
    expect(acceptsAnswer({ id: "q1", mine: false }, "q1", undefined)).toBe(false)
  })
})

describe("CALL-BUG-10 and 16: the recording's link and state", () => {
  it("reads every answer shape, and the states with nothing to play", () => {
    expect(readRecordingMedia({ url: "u", expires_at: 10, status: "ready" })).toEqual({ url: "u", status: "ready", expiresAt: 10 })
    expect(readRecordingMedia({ data: { url: "u" } })).toEqual({ url: "u", status: "ready", expiresAt: undefined })
    expect(readRecordingMedia({ data: "u" }).url).toBe("u")
    expect(readRecordingMedia({ status: "failed" })).toEqual({ url: undefined, status: "failed", expiresAt: undefined })
    expect(readRecordingMedia({ status: "transcript_only" }).status).toBe("transcript_only")
    expect(readRecordingMedia({ status: "recording", url: "stale" }).url).toBeUndefined()
    expect(readRecordingMedia({ url: "u", expires_at: "2026-10-13T12:00:00Z" }).expiresAt).toBe(Date.parse("2026-10-13T12:00:00Z"))
  })

  it("treats a link as spent a minute early", () => {
    expect(linkSpent({ expiresAt: 100_000 }, 30_000)).toBe(false)
    expect(linkSpent({ expiresAt: 100_000 }, 40_000)).toBe(true)
    expect(linkSpent({}, 1e15)).toBe(false)
    expect(linkSpent(null)).toBe(false)
  })
})

describe("CALL-BUG-23: why a call never connected, by what can be done", () => {
  const conn = (message: string, reason?: number, status?: number) => Object.assign(new Error(message), { name: "ConnectionError", reason, status })
  it("tells the network from permission from the server", () => {
    expect(connectFailureOf(conn("could not establish signal connection: invalid token", 0, 401))).toBe("permission")
    expect(connectFailureOf(conn("could not establish signal connection", 1))).toBe("network")
    expect(connectFailureOf(conn("could not establish pc connection", 2))).toBe("network")
    expect(connectFailureOf(conn("room connection has timed out (signal)", 1))).toBe("network")
    expect(connectFailureOf(conn("internal error", 2, 500))).toBe("server")
    expect(connectFailureOf(null, 3 /* SERVER_SHUTDOWN */)).toBe("server")
    expect(connectFailureOf(null, 7 /* JOIN_FAILURE */)).toBe("network")
    expect(connectFailureOf(undefined)).toBe("network")
  })

  it("says each in plain words", () => {
    expect(CONNECT_FAILURE_TEXT.network).toContain("Check your connection")
    expect(CONNECT_FAILURE_TEXT.permission).toContain("didn't accept")
    expect(CONNECT_FAILURE_TEXT.server).toContain("had a problem")
  })
})

describe("the Linux desktop app, which has no WebRTC", () => {
  it("is told apart from a browser, and from a desktop app that can call", () => {
    expect(callsUnavailableHere({ __TAURI__: {} })).toContain("Your browser can")
    expect(callsUnavailableHere({ __TAURI__: {}, RTCPeerConnection: function () {} })).toBeNull()
    expect(callsUnavailableHere({})).toBeNull()
    expect(callsUnavailableHere(undefined)).toBeNull()
  })
})

describe("CALL-BUG-17: an instant meeting that can't open says why", () => {
  it("knows someone else's meeting from one that has ended", () => {
    expect(meetingUnavailable(403, "not_host")?.title).toBe("This meeting is someone else's")
    expect(meetingUnavailable(404, "")?.title).toBe("This meeting has ended")
    expect(meetingUnavailable(500, "")).toBeNull()
  })

  // F-54: an id no meeting ever had was "This meeting has ended" too.
  it("knows a meeting that never was from one that has ended", () => {
    expect(meetingUnavailable(404, "no_meeting")?.title).toBe("We couldn't find this meeting")
    expect(meetingUnavailable(404, "ended")?.title).toBe("This meeting has ended")
  })
})
