// The call screen against a stand-in room (the real one needs a media
// server): captions are one switch for the call, announced to everyone with
// where speech goes, and nothing is recognised until then (CALL-BUG-2);
// removal says why (CALL-BUG-11); Record is offered only where it works
// (CALL-BUG-9); the green room's choice and the room's options reach LiveKit
// (CALL-BUG-1, 20).
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { AudioPresets, ConnectionState, DisconnectReason, Track } from "livekit-client"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
// What the call says to a screen reader, through the app's one live region.
const announce = vi.fn()
vi.mock("@/lib/ui/announce", () => ({ announce: (t: string) => announce(t) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
// The call asks its LiveKit whether it takes one peer connection (lib/calls/onePeerConnection): two, here.
let onePcAnswer = false
vi.mock("@/lib/calls/onePeerConnection", () => ({ onePeerConnection: async () => onePcAnswer }))
let config: Record<string, unknown> = { transcription_mode: "frontend" }
vi.mock("@/hooks/useClientConfig", () => ({
  FEATURE_AI: "ai",
  FEATURE_CALLS: "calls",
  useFeature: () => false,
  useFeatureState: () => "available",
  useClientConfig: () => config,
}))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const setCallTranscription = vi.fn(() => Promise.resolve(undefined))
const actInCall = vi.fn(() => Promise.resolve({ affected: 1 }))
vi.mock("@/services/callService", () => ({ setCallTranscription: (...a: unknown[]) => setCallTranscription(...(a as [])), actInCall: (...a: unknown[]) => actInCall(...(a as [])) }))
const persistTranscriptLine = vi.fn(() => Promise.resolve())
vi.mock("@/services/transcriptService", () => ({ persistTranscriptLine: (...a: unknown[]) => persistTranscriptLine(...(a as [])), reportTranscriptionCapability: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: vi.fn() }))
const readCallThread = vi.fn()
vi.mock("@/services/callThreadService", () => ({ readCallThread: (...a: unknown[]) => readCallThread(...a), writeInCallThread: vi.fn() }))

type Handler = (...args: unknown[]) => void
function makeRoom(name: string) {
  const handlers = new Map<string, Set<Handler>>()
  return {
    name,
    metadata: "",
    state: "connected",
    localParticipant: lp,
    on(event: string, fn: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
      return this
    },
    off(event: string, fn: Handler) {
      handlers.get(event)?.delete(fn)
      return this
    },
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((fn) => fn(...args))
    },
    disconnect: vi.fn(),
  }
}
const lp = {
  identity: "sam",
  name: "Sam Rivera",
  // What the server told the room about Sam (Call Control's attributes).
  attributes: {} as Record<string, string>,
  // What the call server lets Sam publish (LiveKit's permission): none told, everything.
  permissions: undefined as { canPublish: boolean; canPublishSources: number[] } | undefined,
  on: vi.fn(() => lp),
  off: vi.fn(() => lp),
  isMicrophoneEnabled: true,
  setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
  setCameraEnabled: vi.fn(() => Promise.resolve()),
  publishTrack: vi.fn(() => Promise.resolve()),
  setScreenShareEnabled: vi.fn(() => Promise.resolve()),
  publishData: vi.fn(() => Promise.resolve()),
  videoTrackPublications: new Map(),
  audioTrackPublications: new Map(),
}
let room = makeRoom("ch-1")
let liveKitProps: Record<string, unknown> = {}
// Every set of options LiveKit's room was given: a change makes the room anew.
const optionsSeen: string[] = []
vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: (props: { children: ReactNode; options?: unknown }) => {
    liveKitProps = props
    const o = JSON.stringify(props.options)
    if (optionsSeen.at(-1) !== o) optionsSeen.push(o)
    return <div>{props.children}</div>
  },
  GridLayout: () => null,
  RoomAudioRenderer: () => null,
  LayoutContextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTracks: () => [],
  useLocalParticipant: () => ({ localParticipant: lp, isMicrophoneEnabled: true, isCameraEnabled: false, isScreenShareEnabled: false }),
  useRoomContext: () => room,
  useConnectionState: () => ConnectionState.Connected,
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
  useParticipants: () => participants,
}))
// Who LiveKit says is in the room.
let participants: unknown[] = []

// The browser's recogniser, watched.
class FakeRecognition {
  static made: FakeRecognition[] = []
  lang = ""
  continuous = false
  interimResults = false
  processLocally?: boolean
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn()
  constructor() {
    FakeRecognition.made.push(this)
  }
}

// Call Quality Telemetry's runner (A5, #56), loaded once someone is in the call.
const stopQuality = vi.fn()
const watchQuality = vi.fn((..._a: unknown[]) => stopQuality)
vi.mock("./callQuality", () => ({ watchQuality: (...a: unknown[]) => watchQuality(...a) }))
// LiveKit's tracks over what the green room handed over (greenRoomLiveKit), as plain stand-ins.
vi.mock("./greenRoomLiveKit", () => ({
  liveKitCamera: (track: MediaStreamTrack) => ({ wraps: track, stop: () => track.stop() }),
  liveKitMic: (track: MediaStreamTrack) => ({ wraps: track, stop: () => track.stop() }),
}))

import { VideoConference } from "./VideoConference"

const metadata = (o: object) => JSON.stringify(o)
const on = { on: true, by: "Maya Chen", byId: "maya", since: 1, where: "browser", kept: true }

beforeEach(() => {
  participants = []
  lp.attributes = {}
  lp.permissions = undefined
  room = makeRoom("ch-1")
  config = { transcription_mode: "frontend" }
  FakeRecognition.made = []
  ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const call = (props: Partial<Parameters<typeof VideoConference>[0]> = {}) => (
  <VideoConference token="t" serverUrl="ws://lk" isAdmin={false} lobby={undefined} transcriptionConfig={{ mode: "frontend" }} {...props} />
)
const recognition = () => FakeRecognition.made[0]

describe("CALL-BUG-2: nothing is recognised until captions are deliberately on", () => {
  it("never starts the browser's recogniser while captions are off, microphone on or not", async () => {
    await act(async () => render(call()))
    expect(recognition()).toBeTruthy()
    expect(recognition().start).not.toHaveBeenCalled()
    expect(screen.queryByText(/turned on captions/)).toBeNull()
  })

  it("tells a member who turned them on and where their speech goes, then listens, in the workspace's language", async () => {
    room.metadata = metadata({ transcription: on })
    await act(async () => render(call({ transcriptionConfig: { mode: "frontend", language: "de-DE" } })))
    const notice = screen.getByText("Maya Chen turned on captions").closest("[data-captions-notice]")!
    expect(notice.textContent).toContain("your browser's speech service (Google in Chrome, Microsoft in Edge)")
    expect(screen.getByRole("button", { name: /Transcript on · Maya/ })).toBeInTheDocument()
    await waitFor(() => expect(recognition().start).toHaveBeenCalled())
    expect(recognition().lang).toBe("de-DE")
  })

  it("tells a guest too, who never runs a recogniser and never reads the workspace's settings", async () => {
    room = makeRoom("meet-1")
    room.metadata = metadata({ transcription: { ...on, kept: false } })
    await act(async () => render(call({ guest: true, transcriptionConfig: undefined })))
    expect(screen.getByText("Maya Chen turned on captions").closest("[data-captions-notice]")!.textContent).toContain("The text isn't kept after the call.")
    expect(screen.queryByRole("button", { name: "Stop captioning me" })).toBeNull()
    expect(FakeRecognition.made).toHaveLength(0)
  })

  it("lets a member stop their own voice being captioned", async () => {
    room.metadata = metadata({ transcription: on })
    await act(async () => render(call()))
    await waitFor(() => expect(recognition().start).toHaveBeenCalledTimes(1))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stop captioning me" })))
    expect(recognition().stop).toHaveBeenCalled()
  })

  it("keeps a line only in a call that keeps a transcript", async () => {
    room.metadata = metadata({ transcription: on })
    await act(async () => render(call()))
    await waitFor(() => expect(recognition().start).toHaveBeenCalled())
    const final = Object.assign([{ transcript: "ship it on Friday" }], { isFinal: true })
    await act(async () => recognition().onresult?.({ resultIndex: 0, results: [final] }))
    expect(persistTranscriptLine).toHaveBeenCalledWith(expect.objectContaining({ room_name: "ch-1", text: "ship it on Friday" }))

    cleanup()
    vi.clearAllMocks()
    FakeRecognition.made = []
    room = makeRoom("meet-2")
    room.metadata = metadata({ transcription: { ...on, kept: false } })
    await act(async () => render(call()))
    await waitFor(() => expect(recognition().start).toHaveBeenCalled())
    await act(async () => recognition().onresult?.({ resultIndex: 0, results: [final] }))
    expect(persistTranscriptLine).not.toHaveBeenCalled()
  })

  it("asks the person turning captions on first, naming where everyone's speech goes", async () => {
    await act(async () => render(call()))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn on captions" })))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Turn on captions for everyone?" }))
    const asked = confirm.mock.calls[0][0] as { description: string; onConfirm: () => Promise<unknown> }
    expect(asked.description).toContain("(Google in Chrome, Microsoft in Edge)")
    expect(setCallTranscription).not.toHaveBeenCalled()
    await act(async () => {
      await asked.onConfirm()
    })
    expect(setCallTranscription).toHaveBeenCalledWith("ch-1", true)
  })

  // V-30: LiveKit names the room only from the join's answer, so a call still
  // connecting has none, and the server answered "Say which call.".
  const confirmWhileConnecting = async () => {
    room = makeRoom("")
    room.state = "connecting"
    await act(async () => render(call()))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn on captions" })))
    // Wrapped, so awaiting this doesn't wait for the confirmation to finish.
    return { sent: (confirm.mock.calls[0][0] as { onConfirm: () => Promise<unknown> }).onConfirm() }
  }

  it("turns captions on once the call connects, when they're confirmed while it still connects", async () => {
    const { sent } = await confirmWhileConnecting()
    await act(async () => {})
    expect(setCallTranscription).not.toHaveBeenCalled()
    room.name = "ch-1"
    room.state = "connected"
    await act(async () => {
      room.emit("connected")
      await sent
    })
    expect(setCallTranscription).toHaveBeenCalledWith("ch-1", true)
  })

  it("says the call isn't connected yet, and sends nothing, when it ends before it connects", async () => {
    const sent = (await confirmWhileConnecting()).sent.catch((e: Error) => e.message)
    await act(async () => {
      room.emit("disconnected")
    })
    expect(await sent).toBe("You aren't connected to the call yet. Try again in a moment.")
    expect(setCallTranscription).not.toHaveBeenCalled()
  })

  it("doesn't show the turner the notice they've already read", async () => {
    room.metadata = metadata({ transcription: { ...on, byId: "sam", by: "Sam Rivera" } })
    await act(async () => render(call()))
    expect(screen.queryByText(/turned on captions/)).toBeNull()
    expect(screen.getByRole("button", { name: /Transcript on · Sam/ })).toBeInTheDocument()
  })
})

describe("calls audit: a caption is drawn under the name of whoever sent it", () => {
  it("shows a forged line under the sender's name, not the one it claims", async () => {
    room.metadata = metadata({ transcription: on })
    await act(async () => render(call()))
    const forged = new TextEncoder().encode(JSON.stringify({ participantIdentity: "maya", participantName: "Maya Chen", text: "I approve the budget", isFinal: true, id: "f1" }))
    await act(async () => room.emit("dataReceived", forged, { identity: "jonas", name: "Jonas Weber" }, undefined, "lk.transcription"))
    const captions = document.querySelector("[data-captions]")!
    expect(captions.textContent).toContain("Jonas Weber")
    expect(captions.textContent).toContain("I approve the budget")
    expect(captions.textContent).not.toContain("Maya Chen")
  })
})

describe("CALL-BUG-12: the call says it is recorded, and who started it", () => {
  it("shows the recording in the call", async () => {
    room.metadata = metadata({ isRecording: true, recordingStartedBy: "Maya Chen" })
    await act(async () => render(call()))
    expect(document.querySelector("[data-recording-pill]")!.textContent).toContain("Recording · started by Maya Chen")
  })

  // The room connects after the call mounts, and a join brings what the call
  // already holds with no change event: someone who joins a recorded, locked
  // call is told at once, not at the next change.
  it("shows a recording and a lock already there to someone who joins", async () => {
    await act(async () => render(call()))
    expect(document.querySelector("[data-recording-pill]")).toBeNull()
    room.metadata = metadata({ isRecording: true, recordingStartedBy: "Maya Chen", locked: { by: "Maya", since: 1 } })
    await act(async () => void room.emit("connected"))
    expect(document.querySelector("[data-recording-pill]")?.textContent).toContain("Recording · started by Maya Chen")
    expect(document.querySelector("[data-locked-pill]")?.textContent).toContain("Locked · by Maya")
  })
})

describe("CALL-BUG-11: someone removed is told why", () => {
  it("carries the server's reason to the page when the call drops them", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    const packet = new TextEncoder().encode(JSON.stringify({ v: 1, t: "removed", by: "Maya Chen", reason: "host" }))
    // A participant can't say it.
    await act(async () => room.emit("dataReceived", packet, { identity: "jonas" }, undefined, "oc.call"))
    await act(async () => (liveKitProps.onDisconnected as (r: DisconnectReason) => void)(DisconnectReason.PARTICIPANT_REMOVED))
    expect(onDisconnect).toHaveBeenLastCalledWith({ removed: { reason: "unknown" } })
  })

  it("believes the server's packet", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    const packet = new TextEncoder().encode(JSON.stringify({ v: 1, t: "removed", by: "Maya Chen", reason: "host" }))
    await act(async () => room.emit("dataReceived", packet, undefined, undefined, "oc.call"))
    await act(async () => (liveKitProps.onDisconnected as (r: DisconnectReason) => void)(DisconnectReason.PARTICIPANT_REMOVED))
    expect(onDisconnect).toHaveBeenLastCalledWith({ removed: { reason: "host", by: "Maya Chen" } })
  })
})

describe("CALL-BUG-23: a call that never connects says why", () => {
  const fail = (props: Record<string, unknown>) => props as { onError: (e: Error) => void; onDisconnected: (r?: DisconnectReason) => void; onConnected: () => void }
  it("reports a refused connection as permission, once", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    const lk = fail(liveKitProps)
    // LiveKit's order: the disconnect first, then the connect's error.
    await act(async () => lk.onDisconnected(DisconnectReason.JOIN_FAILURE))
    await act(async () => lk.onError(Object.assign(new Error("invalid authorization token"), { name: "ConnectionError", reason: 0, status: 401 })))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect).toHaveBeenCalledWith({ failed: "permission" })
  })

  it("reports an unreachable server or a failed ICE as the network, and a server fault as the server", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    await act(async () => fail(liveKitProps).onDisconnected(DisconnectReason.JOIN_FAILURE))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    expect(onDisconnect).toHaveBeenLastCalledWith({ failed: "network" })
    cleanup()
    const second = vi.fn()
    await act(async () => render(call({ onDisconnect: second })))
    await act(async () => fail(liveKitProps).onError(Object.assign(new Error("internal error"), { name: "ConnectionError", reason: 2, status: 500 })))
    expect(second).toHaveBeenLastCalledWith({ failed: "server" })
  })

  it("says nothing more after the person left while it was still connecting", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave call" })))
    await act(async () => fail(liveKitProps).onError(Object.assign(new Error("Client initiated disconnect"), { name: "ConnectionError", reason: 3 })))
    await act(async () => fail(liveKitProps).onError(Object.assign(new Error("could not establish signal connection"), { name: "ConnectionError", reason: 1 })))
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect.mock.calls[0][0]).toBeUndefined()
  })

  it("treats a drop after connecting as leaving, and says it connected", async () => {
    const onDisconnect = vi.fn()
    const onConnected = vi.fn()
    await act(async () => render(call({ onDisconnect, onConnected })))
    await act(async () => fail(liveKitProps).onConnected())
    expect(onConnected).toHaveBeenCalled()
    await act(async () => fail(liveKitProps).onDisconnected(DisconnectReason.SIGNAL_CLOSE))
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect.mock.calls[0][0]).toBeUndefined()
  })
})

describe("CALL-BUG-9: Record only where it works", () => {
  it("has no Record where the page can't record, even for the host", async () => {
    await act(async () => render(call({ isAdmin: true })))
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull()
  })

  it("says why a recording didn't start", async () => {
    const toggleRecording = vi.fn(() => Promise.reject(Object.assign(new Error("x"), { response: { status: 409, data: { msg: "A recording is already running." } } })))
    await act(async () => render(call({ isAdmin: true, toggleRecording })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Record" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't start the recording", description: "A recording is already running." })))
  })
})

describe("CALL-BUG-1 and 20: what LiveKit is given", () => {
  it("joins muted when the green room said so, and turns on only what was chosen", async () => {
    await act(async () => render(call({ audio: false, video: true })))
    expect(liveKitProps.audio).toBe(false)
    expect(liveKitProps.video).toBe(false)
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
  })

  // The green room's camera and microphone, handed over at Join (greenRoomHandOver).
  const handed = () => {
    const open = (kind: string) => ({ kind, readyState: "live", stop: vi.fn(function (this: { readyState: string }) { this.readyState = "ended" }) })
    const camera = open("video")
    const mic = open("audio")
    return { camera, mic, tracks: { camera: { track: camera as unknown as MediaStreamTrack, constraints: {} }, mic: { track: mic as unknown as MediaStreamTrack, constraints: {} } } }
  }

  it("sends the camera and microphone the green room handed over, and opens nothing itself", async () => {
    const { camera, mic, tracks } = handed()
    await act(async () => render(call({ audio: true, video: true, tracks })))
    expect(lp.publishTrack).toHaveBeenCalledWith({ wraps: mic, stop: expect.any(Function) }, { source: Track.Source.Microphone })
    expect(lp.publishTrack).toHaveBeenCalledWith({ wraps: camera, stop: expect.any(Function) }, { source: Track.Source.Camera })
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).not.toHaveBeenCalled()
    expect(camera.stop).not.toHaveBeenCalled()
    expect(mic.stop).not.toHaveBeenCalled()
  })

  it("opens its own when what was handed over has stopped, and stops what it won't send", async () => {
    const { camera, mic, tracks } = handed()
    camera.readyState = "ended"
    // Muted in the green room: the microphone handed over isn't sent, and its light goes out.
    await act(async () => render(call({ audio: false, video: true, tracks })))
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
    expect(lp.publishTrack).not.toHaveBeenCalled()
    expect(mic.stop).toHaveBeenCalled()
  })

  it("stops a handed-over track the call couldn't send, and says why", async () => {
    const { camera, tracks } = handed()
    lp.publishTrack.mockRejectedValueOnce(Object.assign(new Error("Could not publish"), { name: "NotReadableError" }))
    await act(async () => render(call({ audio: false, video: true, tracks })))
    await waitFor(() => expect(camera.stop).toHaveBeenCalled())
    await waitFor(() => expect(toast).toHaveBeenCalled())
  })

  it("says why the chosen microphone didn't start", async () => {
    lp.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }))
    await act(async () => render(call({ audio: true, video: false })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your browser blocked the microphone" })))
  })

  it("asks for adaptive stream, dynacast and speech audio", async () => {
    await act(async () => render(call()))
    expect(liveKitProps.options).toMatchObject({ adaptiveStream: true, dynacast: true, singlePeerConnection: false, publishDefaults: { audioPreset: AudioPresets.speech } })
  })

  // A change of options makes LiveKit's room anew: a room already connecting
  // would join and leave before the new one joined. The room waits for the
  // server's answer on one peer connection, then is made once.
  it("gives LiveKit's room its options once, settled before it connects", async () => {
    optionsSeen.length = 0
    onePcAnswer = true
    try {
      await act(async () => render(call()))
      expect(optionsSeen).toHaveLength(1)
      expect(liveKitProps.options).toMatchObject({ singlePeerConnection: true })
    } finally {
      onePcAnswer = false
    }
  })
})

// Step 3, part 2: the dock's People, React and Chat, in a call.
describe("who is in the call, reactions and the conversation", () => {
  const maya = { identity: "maya", name: "Maya Chen", isLocal: false, isMicrophoneEnabled: false, isCameraEnabled: true }
  const bot = { identity: "transcriber-bot", name: "Transcriber", isLocal: false, isMicrophoneEnabled: true, isCameraEnabled: false, kind: 4 }

  it("counts the people on People, never the agent, and lists them beside the stage", async () => {
    participants = [{ ...lp, isLocal: true }, maya, bot]
    await act(async () => render(call()))
    const people = screen.getByRole("button", { name: "People, 2" })
    await act(async () => fireEvent.click(people))
    // The panel loads when People is first opened.
    const panel = await screen.findByRole("complementary", { name: "People" }, { timeout: 5000 })
    expect(panel.textContent).toContain("Maya Chen")
    expect(panel.textContent).not.toContain("Transcriber")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close People" })))
    expect(screen.queryByRole("complementary", { name: "People" })).toBeNull()
  })

  it("floats a reaction someone sent, and sends yours to everyone", async () => {
    await act(async () => render(call()))
    const { encodeSignal, CALL_SIGNAL_TOPIC } = await import("@/lib/calls/signals")
    await act(async () => room.emit("dataReceived", encodeSignal("reaction", { emoji: "🎉" }), { identity: "maya", name: "Maya Chen" }, undefined, CALL_SIGNAL_TOPIC))
    expect(screen.getByRole("log", { name: "Reactions" }).textContent).toContain("Maya Chen")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "React" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Thumbs up" })))
    expect(lp.publishData).toHaveBeenCalledWith(encodeSignal("reaction", { emoji: "👍" }), { reliable: false, topic: CALL_SIGNAL_TOPIC })
  })

  it("offers Chat only where the call has a conversation", async () => {
    await act(async () => render(call()))
    expect(screen.queryByRole("button", { name: "Chat" })).toBeNull()
    cleanup()
    const chat = vi.fn()
    await act(async () => render(call({ onChatToggle: chat, isChatOpen: true })))
    const button = screen.getByRole("button", { name: "Chat" })
    expect(button.getAttribute("aria-pressed")).toBe("true")
    await act(async () => fireEvent.click(button))
    expect(chat).toHaveBeenCalled()
  })
})

// CALLS-3b: a conversation's call has its chat, the thread of the call's
// message, for everyone in the call; the dock's Chat opens it, and a member
// has the conversation one tap away from it. A meeting keeps Chat as it was.
describe("the call's chat", () => {
  const channelRoom = "4f0c2a1e-3b7d-4c55-9a51-0d8b1f6a2c33"
  // No dates: the chat's times aren't what these tests are about.
  const thread = { post: { id: "p1", author: "Maya Chen", text: "Maya Chen started a call", created_at: "" }, replies: [], can_reply: true, latest: "l1" }

  it("opens from the dock for a member, with the conversation one tap away", async () => {
    room = makeRoom(channelRoom)
    readCallThread.mockResolvedValue({ kind: "thread", thread })
    const conversation = vi.fn()
    await act(async () => render(call({ sessionId: "s1", onChatToggle: conversation, isChatOpen: false })))
    const button = screen.getByRole("button", { name: "Chat" })
    expect(button.getAttribute("aria-pressed")).toBe("false")
    await act(async () => fireEvent.click(button))
    const panel = await screen.findByRole("complementary", { name: "Chat" }, { timeout: 5000 })
    expect(readCallThread).toHaveBeenCalledWith({ sessionId: "s1" }, undefined)
    expect(screen.getByRole("button", { name: "Chat" }).getAttribute("aria-pressed")).toBe("true")
    expect(conversation).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Open conversation" })))
    expect(conversation).toHaveBeenCalled()
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Close chat" })))
    expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull()
  })

  it("opens for a guest in a conversation's call, asked by their call token, with nothing of the conversation", async () => {
    room = makeRoom(channelRoom)
    readCallThread.mockResolvedValue({ kind: "thread", thread })
    await act(async () => render(call({ guest: true })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Chat" })))
    const panel = await screen.findByRole("complementary", { name: "Chat" }, { timeout: 5000 })
    expect(readCallThread).toHaveBeenCalledWith({ callToken: "t" }, undefined)
    expect(within(panel).queryByRole("button", { name: "Open conversation" })).toBeNull()
  })

  it("leaves a meeting's Chat to the conversation, as before", async () => {
    room = makeRoom("meet-1")
    const conversation = vi.fn()
    await act(async () => render(call({ sessionId: "s1", onChatToggle: conversation })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Chat" })))
    expect(conversation).toHaveBeenCalled()
    expect(readCallThread).not.toHaveBeenCalled()
  })
})

// Call Control: the people running a call run it, and everyone hears what
// was done to them in words, from the server only.
describe("running a call", () => {
  const host = { "oc.role": "host", "oc.can": "mute,mute_all,ask_unmute,remove,lock,end,cohost,spotlight,mute_on_entry" }
  const server = (o: object) => new TextEncoder().encode(JSON.stringify({ v: 1, ...o }))

  it("lets a host end the call for everyone from Leave, asked first", async () => {
    lp.attributes = host
    await act(async () => render(call({ sessionId: "s1" })))
    expect(screen.queryByRole("button", { name: "Leave call" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "Leave or end the call" }), { key: "Enter" })
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "End call for everyone" })))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "End the call for everyone?", destructive: true }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(actInCall).toHaveBeenCalledWith("s1", expect.objectContaining({ action: "end" }))
  })

  it("leaves at once for someone who runs nothing, and for a guest", async () => {
    await act(async () => render(call({ sessionId: "s1" })))
    expect(screen.getByRole("button", { name: "Leave call" })).toBeTruthy()
    cleanup()
    lp.attributes = host
    await act(async () => render(call({ guest: true })))
    expect(screen.getByRole("button", { name: "Leave call" })).toBeTruthy()
  })

  it("says who muted you, and only when the server says it", async () => {
    await act(async () => render(call({ sessionId: "s1" })))
    await act(async () => room.emit("dataReceived", server({ t: "muted", by: "Maya", source: "microphone" }), { identity: "jonas" }, undefined, "oc.call"))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Maya muted you" }))
    await act(async () => room.emit("dataReceived", server({ t: "muted", by: "Maya", source: "microphone" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Maya muted you" }))
  })

  it("asks you to unmute and leaves your microphone to you", async () => {
    await act(async () => render(call({ sessionId: "s1", audio: false })))
    await act(async () => room.emit("dataReceived", server({ t: "ask_unmute", by: "Maya" }), undefined, undefined, "oc.call"))
    // The notice with Unmute loads with the first ask (unmuteToast).
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Maya asks you to unmute" })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("says the call is locked on the stage, and by whom", async () => {
    room.metadata = metadata({ locked: { by: "Maya", since: 1 } })
    await act(async () => render(call()))
    expect(document.querySelector("[data-locked-pill]")!.textContent).toContain("Locked · by Maya")
  })

  it("has people join muted where the hosts asked, and tells them", async () => {
    room.metadata = metadata({ muteOnEntry: true })
    await act(async () => render(call({ audio: true, video: true })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "You joined muted" }))
  })

  it("lets a host join with their microphone on where the hosts asked for muted", async () => {
    room.metadata = metadata({ muteOnEntry: true })
    lp.attributes = host
    await act(async () => render(call({ audio: true })))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true)
  })

  // LiveKit's TrackSource numbers: camera 1, microphone 2, screen 3, the screen's sound 4.
  it("leaves out at joining what the call holds, and says why once", async () => {
    lp.permissions = { canPublish: true, canPublishSources: [1, 3, 4] }
    room.metadata = metadata({ muteOnEntry: true, held: ["microphone"] })
    await act(async () => render(call({ audio: true, video: true })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "You joined muted", description: expect.stringContaining("turned off microphones") }))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("everyone join muted") }))
  })

  it("joins with the microphone and camera off when the call holds both", async () => {
    lp.permissions = { canPublish: true, canPublishSources: [3, 4] }
    await act(async () => render(call({ audio: true, video: true })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "You joined with your microphone and camera off" }))
  })

  it("says what the people running the call turned off or let you do, only when the server says it", async () => {
    await act(async () => render(call({ sessionId: "s1" })))
    await act(async () => room.emit("dataReceived", server({ t: "held", by: "Maya", source: "chat" }), { identity: "jonas" }, undefined, "oc.call"))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Maya turned off chat for everyone" }))
    await act(async () => room.emit("dataReceived", server({ t: "held", by: "Maya", source: "chat" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Maya turned off chat for everyone", description: "You can still read it." }))
    await act(async () => room.emit("dataReceived", server({ t: "allowed", by: "Maya", source: "microphone" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Maya let you talk" }))
  })

  it("tells a co-host, and someone let through, what a hold changed and nothing to do about it: it doesn't hold them", async () => {
    lp.attributes = { "oc.role": "cohost", "oc.can": "mute,hold" }
    await act(async () => render(call({ sessionId: "s1" })))
    await act(async () => room.emit("dataReceived", server({ t: "held", by: "Maya", source: "microphone" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Maya turned off microphones for everyone", description: undefined }))
    lp.attributes = { "oc.role": "participant", "oc.allowed": "chat" }
    await act(async () => room.emit("dataReceived", server({ t: "held", by: "Maya", source: "chat" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Maya turned off chat for everyone", description: undefined }))
  })

  it("ends the call on everyone's screen with who ended it", async () => {
    const onDisconnect = vi.fn()
    await act(async () => render(call({ onDisconnect })))
    await act(async () => (liveKitProps.onConnected as () => void)())
    await act(async () => room.emit("dataReceived", server({ t: "ended", by: "Maya" }), undefined, undefined, "oc.call"))
    await act(async () => (liveKitProps.onDisconnected as (r: DisconnectReason) => void)(DisconnectReason.ROOM_DELETED))
    expect(onDisconnect).toHaveBeenLastCalledWith({ removed: { reason: "ended", by: "Maya" } })
  })

  // meet-18 (CODE-REVIEWER-46 MF2 and SF1): a knock is said once, through
  // the call's one voice in the knock bar's words, and only to whoever may let
  // people in.
  // Knocked just now: a fixed date here would put every case in this file on a clock it never set (app/testClock).
  const gia = { ticket: "t1", name: "Gia Rossi", knocked_at: new Date().toISOString() }
  const knocksSaid = () => announce.mock.calls.map(([t]) => String(t)).filter((t) => t.includes("join"))
  const knock = async (props: Partial<Parameters<typeof VideoConference>[0]>) => {
    const { rerender } = await act(async () => render(call({ ...props, lobby: [] })))
    await act(async () => void rerender(call({ ...props, lobby: [gia] })))
  }

  it("says a knock once, in the knock bar's words, through the call's one voice", async () => {
    lp.attributes = { ...host, "oc.can": `${host["oc.can"]},admit` }
    await knock({ sessionId: "s1" })
    // The bar loads with the first knock.
    await screen.findByText("Gia Rossi is waiting to join", undefined, { timeout: 5_000 })
    const voices = [...document.querySelectorAll("[aria-live]")].filter((n) => n.textContent?.includes("join"))
    expect(voices.map((n) => n.textContent), "a live region of the call's own").toEqual([])
    // Knocks are gathered over two seconds, then said.
    await waitFor(() => expect(knocksSaid()).toEqual(["Gia Rossi is waiting to join"]), { timeout: 5_000 })
  })

  it("says no knock to someone who may not let people in, nor to a guest", async () => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers())
    await knock({ sessionId: "s1" })
    await act(async () => void vi.advanceTimersByTime(3_000))
    cleanup()
    await knock({ guest: true })
    await act(async () => void vi.advanceTimersByTime(3_000))
    expect(knocksSaid()).toEqual([])
  })
})

describe("calls A5: the call's quality, sent as the person themselves", () => {
  it("watches a member's call by their session, and stops when they leave", async () => {
    const { unmount } = await act(async () => render(call({ sessionId: "s1" })))
    await vi.waitFor(() => expect(watchQuality).toHaveBeenCalledTimes(1))
    expect(watchQuality.mock.calls[0][1]).toEqual({ sessionId: "s1" })
    unmount()
    expect(stopQuality).toHaveBeenCalledTimes(1)
  })

  it("watches a guest's by their call token, and nobody's the server can't tell", async () => {
    await act(async () => render(call({ guest: true })))
    await vi.waitFor(() => expect(watchQuality).toHaveBeenCalledTimes(1))
    expect(watchQuality.mock.calls[0][1]).toEqual({ callToken: "t" })
    cleanup()
    watchQuality.mockClear()
    // Nobody the server can tell: no watch. The same call then learns its
    // session, and the one watch that starts is that one's.
    const { rerender } = await act(async () => render(call()))
    await act(async () => rerender(call({ sessionId: "s2" })))
    await vi.waitFor(() => expect(watchQuality).toHaveBeenCalled())
    expect(watchQuality.mock.calls.map((c) => c[1])).toEqual([{ sessionId: "s2" }])
  })
})

// Calls package B: the board on the stage. The picker and the stage stand in
// here (their own tests: boardPicker.test.tsx, callBoardStage.test.tsx); this
// is the call's wiring: present through the server, the stage as the room's
// metadata says, and the notices from the server only.
vi.mock("@/components/board/boardPicker", () => ({
  default: ({ onPick, onNew, onClose }: { onPick: (board: string) => void; onNew: () => void; onClose: () => void }) => (
    <>
      <button type="button" onClick={() => (onPick("b1"), onClose())}>
        Pick Launch plan
      </button>
      <button type="button" onClick={() => (onNew(), onClose())}>
        New board
      </button>
    </>
  ),
}))
vi.mock("./CallBoardStage", () => ({
  default: ({ board, presenter }: { board: { uuid: string }; presenter: string }) => <div data-board-stage={board.uuid}>{presenter}</div>,
}))
vi.mock("./CallGuestBoardStage", () => ({
  default: ({ board, presenter, callToken }: { board: { uuid: string }; presenter: string; callToken: string }) => (
    <div data-guest-board-stage={board.uuid} data-call-token={callToken}>
      {presenter}
    </div>
  ),
}))

describe("the board on the stage", () => {
  const server = (o: object) => new TextEncoder().encode(JSON.stringify({ v: 1, ...o }))
  const onStage = (by: string) => metadata({ board: { uuid: "b1", by, draw: "everyone", guests: false } })
  const maya = { identity: "maya", name: "Maya Chen", isLocal: false, isMicrophoneEnabled: false, isCameraEnabled: true }
  const openShare = () => fireEvent.keyDown(screen.getByRole("button", { name: "Share" }), { key: "Enter" })

  it("lets a member present the board they pick, through the server", async () => {
    await act(async () => render(call({ sessionId: "s1" })))
    openShare()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Present a board/ }))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Pick Launch plan" })))
    expect(actInCall).toHaveBeenCalledWith("s1", expect.objectContaining({ action: "present_board", board: "b1" }))
  })

  it("lets a member make a new board for the call, through the server", async () => {
    await act(async () => render(call({ sessionId: "s1" })))
    openShare()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Present a board/ }))
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "New board" })))
    expect(actInCall).toHaveBeenCalledWith("s1", expect.objectContaining({ action: "new_board" }))
  })

  it("gives a guest no board to present: their Share shares the screen", async () => {
    await act(async () => render(call({ guest: true })))
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull()
    expect(screen.getByRole("button", { name: "Share screen" })).toBeTruthy()
  })

  it("puts the board the call names on everyone's stage, named for its presenter, and takes it down with it", async () => {
    participants = [{ ...lp, isLocal: true }, maya]
    room.metadata = onStage("maya")
    await act(async () => render(call({ sessionId: "s1" })))
    expect((await screen.findByText("Maya Chen")).closest("[data-board-stage]")).toHaveAttribute("data-board-stage", "b1")
    room.metadata = metadata({})
    await act(async () => room.emit("roomMetadataChanged", room.metadata))
    expect(document.querySelector("[data-board-stage]")).toBeNull()
  })

  it("shows a guest the board the call names, opened with their own call token", async () => {
    participants = [{ ...lp, isLocal: true }, maya]
    room.metadata = onStage("maya")
    await act(async () => render(call({ guest: true })))
    const stage = (await screen.findByText("Maya Chen")).closest("[data-guest-board-stage]")
    expect(stage).toHaveAttribute("data-guest-board-stage", "b1")
    expect(stage).toHaveAttribute("data-call-token", "t")
    expect(document.querySelector("[data-board-stage]")).toBeNull()
  })

  it("lets its presenter take it down from Share", async () => {
    room.metadata = onStage("sam")
    await act(async () => render(call({ sessionId: "s1" })))
    openShare()
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Stop presenting" })))
    expect(actInCall).toHaveBeenCalledWith("s1", expect.objectContaining({ action: "stop_board" }))
  })

  it("says why a board left the stage, to its presenter in their own words, and only from the server", async () => {
    room.metadata = onStage("sam")
    await act(async () => render(call({ sessionId: "s1" })))
    const held = server({ t: "board_stopped", by: "Sam Rivera", reason: "share_held" })
    await act(async () => room.emit("dataReceived", held, { identity: "jonas" }, undefined, "oc.call"))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Your board left the stage: hosts turned off sharing" }))
    room.metadata = metadata({})
    await act(async () => room.emit("roomMetadataChanged", room.metadata))
    await act(async () => room.emit("dataReceived", held, undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your board left the stage: hosts turned off sharing" }))
  })

  it("tells everyone else whose board left, and why", async () => {
    participants = [{ ...lp, isLocal: true }, maya]
    room.metadata = onStage("maya")
    await act(async () => render(call({ sessionId: "s1" })))
    await act(async () => room.emit("dataReceived", server({ t: "board_stopped", by: "Maya Chen", reason: "share_held" }), undefined, undefined, "oc.call"))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Hosts turned off sharing, so Maya Chen's board left the stage" }))
  })
})
