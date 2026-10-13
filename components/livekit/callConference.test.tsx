// The call screen against a stand-in room (the real one needs a media
// server): captions are one switch for the call, announced to everyone with
// where speech goes, and nothing is recognised until then (CALL-BUG-2);
// removal says why (CALL-BUG-11); Record is offered only where it works
// (CALL-BUG-9); the green room's choice and the room's options reach LiveKit
// (CALL-BUG-1, 20).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { AudioPresets, ConnectionState, DisconnectReason } from "livekit-client"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
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
const removeFromCall = vi.fn(() => Promise.resolve())
vi.mock("@/services/callService", () => ({ setCallTranscription: (...a: unknown[]) => setCallTranscription(...(a as [])), removeFromCall: (...a: unknown[]) => removeFromCall(...(a as [])) }))
const persistTranscriptLine = vi.fn(() => Promise.resolve())
vi.mock("@/services/transcriptService", () => ({ persistTranscriptLine: (...a: unknown[]) => persistTranscriptLine(...(a as [])), reportTranscriptionCapability: vi.fn(() => Promise.resolve()) }))
vi.mock("@/lib/utils/streamFetch", () => ({ authedStreamFetch: vi.fn() }))

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
  isMicrophoneEnabled: true,
  setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
  setCameraEnabled: vi.fn(() => Promise.resolve()),
  setScreenShareEnabled: vi.fn(() => Promise.resolve()),
  publishData: vi.fn(() => Promise.resolve()),
  videoTrackPublications: new Map(),
  audioTrackPublications: new Map(),
}
let room = makeRoom("ch-1")
let liveKitProps: Record<string, unknown> = {}
vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: (props: { children: ReactNode }) => {
    liveKitProps = props
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
}))

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

import { VideoConference } from "./VideoConference"

const metadata = (o: object) => JSON.stringify(o)
const on = { on: true, by: "Maya Chen", byId: "maya", since: 1, where: "browser", kept: true }

beforeEach(() => {
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
  <VideoConference token="t" serverUrl="ws://lk" isAdmin={false} transcriptionConfig={{ mode: "frontend" }} {...props} />
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
    expect(screen.getByRole("button", { name: /Captions on · Maya/ })).toBeInTheDocument()
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

  it("doesn't show the turner the notice they've already read", async () => {
    room.metadata = metadata({ transcription: { ...on, byId: "sam", by: "Sam Rivera" } })
    await act(async () => render(call()))
    expect(screen.queryByText(/turned on captions/)).toBeNull()
    expect(screen.getByRole("button", { name: /Captions on · Sam/ })).toBeInTheDocument()
  })
})

describe("CALL-BUG-12: the call says it is recorded, and who started it", () => {
  it("shows the recording in the call", async () => {
    room.metadata = metadata({ isRecording: true, recordingStartedBy: "Maya Chen" })
    await act(async () => render(call()))
    expect(document.querySelector("[data-recording-pill]")!.textContent).toContain("Recording · started by Maya Chen")
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

  it("says why the chosen microphone didn't start", async () => {
    lp.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }))
    await act(async () => render(call({ audio: true, video: false })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your browser blocked the microphone" })))
  })

  it("asks for adaptive stream, dynacast and speech audio", async () => {
    await act(async () => render(call()))
    expect(liveKitProps.options).toMatchObject({ adaptiveStream: true, dynacast: true, singlePeerConnection: false, publishDefaults: { audioPreset: AudioPresets.speech } })
  })
})
