// CALL-BUG-24: a refusing speech recogniser was restarted every 100 ms for
// the whole call, about 500 times a minute and a quarter of the main thread.
// A refusal is final now, and captions say why; a passing fault backs off.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

const room = { name: "ch-1", state: "connected", metadata: "", on: vi.fn(), off: vi.fn() }
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => room,
  useLocalParticipant: () => ({ localParticipant: { identity: "sam", name: "Sam", isMicrophoneEnabled: true, publishData: vi.fn(() => Promise.resolve()) } }),
}))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_CALLS: "calls", useFeatureState: () => "available", useClientConfig: () => ({ transcription_mode: "frontend" }) }))
vi.mock("@/services/transcriptService", () => ({ persistTranscriptLine: vi.fn(() => Promise.resolve()), reportTranscriptionCapability: vi.fn(() => Promise.resolve()) }))

class FakeRecognition {
  static made: FakeRecognition[] = []
  lang = ""
  continuous = false
  interimResults = false
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn()
  constructor() {
    FakeRecognition.made.push(this)
  }
  /** The browser reports an error, then ends the session. */
  fails(error: string) {
    this.onerror?.({ error })
    this.onend?.()
  }
}

import { FrontendTranscriber, RECOGNISER_REFUSALS, nextRecogniserStart, type TranscriberState } from "./FrontendTranscriber"

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecognition.made = []
  ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function mount(onStatus?: (s: TranscriberState) => void) {
  await act(async () => {
    render(<FrontendTranscriber onTranscript={() => {}} onStatus={onStatus} active persist language="en-GB" />)
  })
  // The on-device question is answered (no: this fake has none), then it starts.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  const r = FakeRecognition.made[0]
  expect(r.start).toHaveBeenCalledTimes(1)
  return r
}

describe("CALL-BUG-24: the recogniser's restarts", () => {
  it("never restarts after a refusal, and captions say why", async () => {
    const statuses: TranscriberState[] = []
    const r = await mount((s) => statuses.push(s))
    await act(async () => r.fails("service-not-allowed"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(r.start).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toEqual({ status: "error", error: "service-not-allowed" })
  })

  it("backs off after a network error: 1 s, then 2 s", async () => {
    const r = await mount()
    await act(async () => r.fails("network"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(r.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(r.start).toHaveBeenCalledTimes(2)
    await act(async () => r.fails("network"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999)
    })
    expect(r.start).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(r.start).toHaveBeenCalledTimes(3)
  })

  it("restarts a healthy session at once when Chrome ends it after a pause", async () => {
    const r = await mount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    await act(async () => r.onend?.())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(r.start).toHaveBeenCalledTimes(2)
  })

  it("names its refusals and its delays", () => {
    for (const e of ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]) expect(RECOGNISER_REFUSALS.has(e)).toBe(true)
    expect(nextRecogniserStart("not-allowed", 1)).toBeNull()
    expect(nextRecogniserStart("network", 1)).toBe(1000)
    expect(nextRecogniserStart("network", 3)).toBe(4000)
    expect(nextRecogniserStart("network", 12)).toBe(30_000)
    expect(nextRecogniserStart(null, 0)).toBe(100)
    expect(nextRecogniserStart(null, 2)).toBe(100)
    expect(nextRecogniserStart(null, 4)).toBe(1600)
  })
})

// QA F-21: the on-device question was asked on every join, captions on or
// off, and a Chromium that exposes SpeechRecognition.available without its
// on-device service ends the page for it. It is asked only while captions are
// on here.
describe("the on-device question", () => {
  const available = vi.fn(async () => "unavailable")
  beforeEach(() => {
    ;(FakeRecognition as unknown as { available: typeof available }).available = available
    available.mockClear()
  })
  afterEach(() => {
    delete (FakeRecognition as unknown as { available?: unknown }).available
  })

  it("isn't asked while captions are off", async () => {
    await act(async () => {
      render(<FrontendTranscriber onTranscript={() => {}} active={false} persist language="en-GB" />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(available).not.toHaveBeenCalled()
  })

  it("is asked once captions are on, for the call's language", async () => {
    await mount()
    expect(available).toHaveBeenCalledWith({ langs: ["en-GB"], processLocally: true })
  })
})

