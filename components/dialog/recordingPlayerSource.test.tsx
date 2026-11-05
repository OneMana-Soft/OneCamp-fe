// meet-02 (calls head C): the recording player opened by an event's play path with no transcript path (a call that kept
// no words) can't read any. It keeps no Transcript panel, and a phone's Download, which sits in that panel's head, moves
// to the sheet's head. A channel's recording, read with its transcript route, keeps both as they were. Head C2: given
// the event's transcript path, it reads the call's words there.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

const media = vi.hoisted(() => ({ isMobile: true, status: "ready", transcript: undefined as unknown, asked: [] as string[] }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: media.isMobile }) }))
// The transcript route's answer: none yet, unless a test gives one. Every URL asked is kept ("" asks nothing).
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    media.asked.push(url)
    return { data: url ? media.transcript : undefined, isLoading: false, isError: false, mutate: vi.fn() }
  },
}))
vi.mock("@/components/dialog/useRecordingPlayback", async (real) => ({
  ...(await real<typeof import("@/components/dialog/useRecordingPlayback")>()),
  useRecordingPlayback: () => ({
    media: { status: media.status, url: "https://media.test/r.mp4" },
    loadError: false,
    playbackFailed: false,
    videoRef: { current: null },
    videoProps: { onTimeUpdate: () => {}, onLoadedMetadata: () => {} },
    seekTo: vi.fn(),
    freshUrl: vi.fn(),
    retry: vi.fn(),
    reload: vi.fn(),
  }),
}))

import { RecordingPlayerDialog } from "./RecordingPlayerDialog"

const open = (data: Record<string, unknown>) =>
  render(
    <Provider store={configureStore({ reducer: { ui: (s = { recordingPlayer: { isOpen: true, data } }) => s } })}>
      <RecordingPlayerDialog />
    </Provider>,
  )

// An event's call, played by the event's own route (eventInfoPanel), and a channel's, with its transcript route.
const EVENT = { mediaPath: "/calendar/events/E1/call/artefacts/EG_1/recording", fileName: "Weekly design review recording" }
const CHANNEL = { egressId: "EG_1", mediaGetUrl: "/ch/getRecordingURL/c1", transcriptGetUrl: "/ch/getTranscript/c1", fileName: "Recording.mp4" }
const panel = () => document.querySelector("[data-transcript]")

afterEach(() => {
  cleanup()
  media.isMobile = true
  media.status = "ready"
  media.transcript = undefined
  media.asked.length = 0
})

describe("meet-02: a recording player with no transcript to read", () => {
  it("keeps no Transcript panel, so it never says there are no words", () => {
    open(EVENT)
    expect(panel()).toBeNull()
    expect(screen.queryByText("No transcript available")).toBeNull()
    // and asks no route for words it has no way to read
    expect(media.asked.filter(Boolean)).toEqual([])
  })

  it("puts a phone's Download in the sheet's head, as the panel that held it isn't there", () => {
    open(EVENT)
    const download = screen.getAllByRole("button", { name: "Download recording" })
    expect(download).toHaveLength(1)
    expect(download[0].closest("[data-transcript]")).toBeNull()
  })

  it("keeps a channel's recording's panel, and puts the phone's Download in the sheet's head beside Close, as at 1280 (V-189)", () => {
    open(CHANNEL)
    expect(panel()).not.toBeNull()
    const download = screen.getAllByRole("button", { name: "Download recording" })
    expect(download).toHaveLength(1)
    expect(download[0].closest("[data-transcript]")).toBeNull()
    // The head's own Close (the dialog's built-in one is hidden by the sheet).
    expect(screen.getAllByRole("button", { name: "Close" }).some((c) => download[0].parentElement?.contains(c))).toBe(true)
  })

  it("gives a desktop no icon Download: the sheet's head has its own from md up", () => {
    media.isMobile = false
    open(EVENT)
    expect(screen.queryByRole("button", { name: "Download recording" })).toBeNull()
  })
})

// Head C2 (meet-02 WIN): an event's call opened with its transcript path reads its words by the event's own route
// (whoever may read the event), page by page, beside its recording, or alone for a call that wasn't recorded.
describe("meet-02: an event's call read by its transcript path", () => {
  const TRANSCRIPT = "/calendar/events/E1/call/artefacts/EG_1/transcript"
  const words = { data: { recording_transcript: [{ transcript_from: { user_uuid: "u1", user_name: "maya", user_full_name: "Maya Chen" }, transcript_text: "Let's start with the launch.", transcript_timestamp: 0, transcript_offset_ms: 0 }], transcript_count: 1 }, pageCount: 1 }

  it("reads its first page there and keeps the Transcript panel beside the recording", () => {
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    expect(media.asked.filter(Boolean)).toContain(`${TRANSCRIPT}?pageIndex=0&pageSize=20`)
    expect(media.asked.filter((u) => u && !u.startsWith(TRANSCRIPT))).toEqual([])
    expect(panel()).not.toBeNull()
    expect(screen.queryByText("No transcript available")).toBeNull()
  })

  it("reads a call that wasn't recorded as its transcript alone", () => {
    media.status = "transcript_only"
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, fileName: "Weekly design review transcript", home: "event" })
    expect(media.asked.filter(Boolean)).toContain(`${TRANSCRIPT}?pageIndex=0&pageSize=20`)
    expect(screen.getByText("Transcript · this call wasn't recorded")).toBeTruthy()
    expect(document.querySelector("video")).toBeNull()
  })
})

// Follow-up 1: an event's recording is deleted from its event's "Recordings & notes" (its
// organiser, or a guest the organiser lets change it), never from a channel's or a chat's.
describe("a recording with nothing to play says where it can be deleted", () => {
  it("an event's, from its event's Recordings & notes", () => {
    media.status = "failed"
    open({ ...EVENT, home: "event" })
    expect(screen.getByText(/It can be deleted from its event's Recordings & notes\.$/)).toBeTruthy()
    expect(screen.queryByText(/channel's or chat's/)).toBeNull()
  })

  it("a channel's or a chat's, from its recordings, as it said before", () => {
    media.status = "empty"
    // Its transcript route has answered, with no words: the stage says why on its own.
    media.transcript = { data: { recording_transcript: [], transcript_count: 0 }, pageCount: 0 }
    open(CHANNEL)
    expect(screen.getByText(/It can be deleted from its channel's or chat's recordings\.$/)).toBeTruthy()
  })
})

describe("meet-02 LIVE (DESIGN-BUILD-64's MUST 1): the stage is its picture's box", () => {
  const TRANSCRIPT = "/calendar/events/E1/call/artefacts/EG_1/transcript"
  const words = { data: { recording_transcript: [{ transcript_from: { user_uuid: "u1", user_name: "maya", user_full_name: "Maya Chen" }, transcript_text: "Let's start with the launch.", transcript_timestamp: 0, transcript_offset_ms: 0 }], transcript_count: 1 }, pageCount: 1 }
  const stage = () => document.querySelector<HTMLElement>("[data-stage]")
  /** The video says its size, as it does once its first bytes are read. */
  const sized = (width: number, height: number) => {
    const video = document.querySelector("video")!
    Object.defineProperty(video, "videoWidth", { value: width, configurable: true })
    Object.defineProperty(video, "videoHeight", { value: height, configurable: true })
    fireEvent.loadedMetadata(video)
  }

  it("takes a 16:9 picture's shape until the recording says its own, then that, beside the words", () => {
    media.isMobile = false
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    expect(stage()?.dataset.stage).toBe("picture")
    expect(stage()?.style.aspectRatio).toBe("16 / 9")
    sized(1440, 1080)
    expect(stage()?.style.aspectRatio).toBe("1440 / 1080")
    expect(panel()).not.toBeNull()
  })

  it("keeps 16:9 for a recording with no picture: a 0 x 0 size says no shape of its own", () => {
    media.isMobile = false
    open({ ...EVENT, home: "event" })
    sized(0, 0)
    expect(stage()?.style.aspectRatio).toBe("16 / 9")
  })

  it("keeps a words-only sheet's height, where a recorded call's stage sizes the sheet", () => {
    media.isMobile = false
    media.status = "transcript_only"
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    expect(screen.getByRole("dialog").className).toContain("h-[85vh]")
    cleanup()
    media.status = "ready"
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    expect(screen.getByRole("dialog").className).not.toContain("h-[85vh]")
  })

  it("takes each recording's shape anew: the last one's doesn't carry over", () => {
    media.isMobile = false
    media.transcript = words
    const first = { ...EVENT, transcriptPath: TRANSCRIPT, home: "event" }
    const store = configureStore({
      reducer: { ui: (s = { recordingPlayer: { isOpen: true, data: first } }, a: { type: string; data?: unknown }) => (a.type === "next" ? { recordingPlayer: { isOpen: true, data: a.data as typeof first } } : s) },
    })
    render(
      <Provider store={store}>
        <RecordingPlayerDialog />
      </Provider>,
    )
    sized(1440, 1080)
    expect(stage()?.style.aspectRatio).toBe("1440 / 1080")
    act(() => void store.dispatch({ type: "next", data: { ...first, mediaPath: "/calendar/events/E1/call/artefacts/EG_2/recording" } }))
    expect(stage()?.style.aspectRatio).toBe("16 / 9")
  })

  it("fills the screen on a wide screen's Full screen, and goes back to the picture's box after", () => {
    media.isMobile = false
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }))
    expect(stage()?.dataset.stage).toBe("screen")
    expect(stage()?.style.aspectRatio).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }))
    expect(stage()?.dataset.stage).toBe("picture")
  })

  it("keeps a phone's picture above its words, and lets it fill a phone's screen with no words to show", () => {
    media.transcript = words
    open({ ...EVENT, transcriptPath: TRANSCRIPT, home: "event" })
    expect(stage()?.dataset.stage).toBe("picture")
    cleanup()
    open(EVENT)
    expect(panel()).toBeNull()
    expect(stage()?.dataset.stage).toBe("screen")
  })
})
