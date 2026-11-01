// A recording keeps playing past its link's five minutes (CALL-BUG-10), and
// one with nothing to play says so (CALL-BUG-16): failed, or empty because it
// captured nothing (V-32).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))
// The player itself reads the screen's size from the app's provider: a computer's here.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))

import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { readRecordingMedia, useRecordingPlayback } from "./useRecordingPlayback"
import { RecordingPlayerDialog, RecordingStageMessage } from "./RecordingPlayerDialog"
import { transcriptLayout } from "@/components/recording/recordingState"
import { stageFit } from "./recordingStage"

function Player({ path }: { path: string }) {
  const p = useRecordingPlayback(path, true)
  return (
    <>
      {p.videoProps.src ? <video data-testid="video" {...p.videoProps} /> : null}
      <button type="button" onClick={() => void p.seekTo(400)}>Jump</button>
      <span data-testid="failed">{String(p.playbackFailed)}</span>
    </>
  )
}

const play = vi.fn(() => Promise.resolve())
const load = vi.fn()
beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play })
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: load })
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** A video whose clock the test can set and read. */
function clock(video: HTMLElement) {
  let t = 0
  Object.defineProperty(video, "currentTime", { configurable: true, get: () => t, set: (v: number) => (t = v) })
  Object.defineProperty(video, "paused", { configurable: true, get: () => true })
  return { get: () => t, set: (v: number) => (t = v) }
}

const answer = (url: string, expiresIn = 300_000) => ({ data: { msg: "Got the url!", url, expires_at: Date.now() + expiresIn, status: "ready" } })

describe("CALL-BUG-10: playback outlives the link", () => {
  it("fetches a fresh link on a media error and carries on from the same moment, playing", async () => {
    get.mockResolvedValueOnce(answer("https://minio/a?sig=1")).mockResolvedValueOnce(answer("https://minio/a?sig=2"))
    render(<Player path="/ch/getRecordingURL/c1/EG_1" />)
    const video = await screen.findByTestId("video")
    expect(video).toHaveAttribute("src", "https://minio/a?sig=1")
    const t = clock(video)
    t.set(312)
    fireEvent.play(video)
    // Six minutes in, the next range request is refused: the link expired.
    await act(async () => fireEvent.error(video))
    await waitFor(() => expect(video).toHaveAttribute("src", "https://minio/a?sig=2"))
    expect(get).toHaveBeenCalledTimes(2)
    await act(async () => fireEvent.loadedMetadata(video))
    expect(t.get()).toBe(312)
    expect(play).toHaveBeenCalled()
  })

  it("does the same in the player itself: the dialog hands the fresh link's loadedmetadata to the playback", async () => {
    get.mockResolvedValueOnce(answer("https://minio/a?sig=1")).mockResolvedValueOnce(answer("https://minio/a?sig=2"))
    const data = { mediaPath: "/calendar/events/E1/call/artefacts/EG_1/recording", fileName: "Weekly design review recording" }
    render(
      <Provider store={configureStore({ reducer: { ui: (s = { recordingPlayer: { isOpen: true, data } }) => s } })}>
        <RecordingPlayerDialog />
      </Provider>,
    )
    const video = await waitFor(() => {
      const v = document.querySelector("video")
      if (!v) throw new Error("no video yet")
      return v
    })
    expect(video).toHaveAttribute("src", "https://minio/a?sig=1")
    const t = clock(video)
    t.set(312)
    fireEvent.play(video)
    await act(async () => fireEvent.error(video))
    await waitFor(() => expect(video).toHaveAttribute("src", "https://minio/a?sig=2"))
    // A new source starts from its beginning, as a browser's does.
    t.set(0)
    await act(async () => fireEvent.loadedMetadata(video))
    expect(t.get()).toBe(312)
    expect(play).toHaveBeenCalled()
  })

  it("takes a fresh link before seeking once the link is spent", async () => {
    get.mockResolvedValueOnce(answer("https://minio/a?sig=1", 30_000)).mockResolvedValueOnce(answer("https://minio/a?sig=2"))
    render(<Player path="/ch/getRecordingURL/c1/EG_1" />)
    const video = await screen.findByTestId("video")
    const t = clock(video)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Jump" })))
    await waitFor(() => expect(video).toHaveAttribute("src", "https://minio/a?sig=2"))
    await act(async () => fireEvent.loadedMetadata(video))
    expect(t.get()).toBe(400)
    expect(play).toHaveBeenCalled()
  })

  it("stops asking after fresh links keep failing, and says so", async () => {
    get.mockResolvedValue(answer("https://minio/a?sig=1"))
    render(<Player path="/ch/getRecordingURL/c1/EG_1" />)
    const video = await screen.findByTestId("video")
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.error(video))
    await waitFor(() => expect(screen.getByTestId("failed").textContent).toBe("true"))
    // The same link back: the element is told to load it again rather than waiting.
    expect(load).toHaveBeenCalled()
  })
})

describe("CALL-BUG-16: a recording with nothing to play says so", () => {
  it("says a failed recording couldn't be saved, instead of a black frame", () => {
    render(<RecordingStageMessage media={{ status: "failed" }} loadError={false} playbackFailed={false} onRetry={() => {}} />)
    expect(screen.getByText("This recording couldn't be saved")).toBeInTheDocument()
    expect(document.querySelector("video")).toBeNull()
  })

  it("says one still being recorded, and one that won't play", () => {
    const { rerender } = render(<RecordingStageMessage media={{ status: "recording" }} loadError={false} playbackFailed={false} onRetry={() => {}} />)
    expect(screen.getByText("Still recording")).toBeInTheDocument()
    rerender(<RecordingStageMessage media={{ status: "ready", url: "u" }} loadError={false} playbackFailed onRetry={() => {}} />)
    expect(screen.getByText("This recording can't be played")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})

// V-32: a recording stopped before any camera, microphone or screen came through
// (LiveKit aborts it: "Start signal not received") captured nothing. The server
// says "empty", and that isn't a failure.
describe("V-32: a recording that captured nothing says so, calmly", () => {
  it("reads the server's empty answer, with no link", () => {
    expect(readRecordingMedia({ status: "empty" })).toEqual({ url: undefined, status: "empty", expiresAt: undefined })
    expect(readRecordingMedia({ data: { status: "empty", url: "https://x/y.mp4" } }).url).toBeUndefined()
  })

  // DB-28's should-fix: with nothing to play and nothing to read, the stage says why on its own. A failed recording
  // whose call was transcribed keeps its words; one that plays, is on its way or was only transcribed keeps the panel.
  const answered = (lines: number) => ({ source: true, answered: true, lines, failed: false })
  it("keeps no Transcript panel beside nothing to play and nothing to read", () => {
    expect(transcriptLayout("empty", answered(0))).toBe("none")
    expect(transcriptLayout("failed", answered(0))).toBe("none")
    expect(transcriptLayout("failed", answered(2))).toBe("panel")
    expect(transcriptLayout("empty", answered(1))).toBe("panel")
    for (const status of ["ready", "recording", "transcript_only", undefined]) {
      expect(transcriptLayout(status, answered(0))).toBe("panel")
      expect(transcriptLayout(status, { source: true, answered: false, lines: 0, failed: false })).toBe("panel")
    }
  })

  // DB-29's must: which of the two isn't known until the transcript answers, so the sheet waits and lays out once.
  // A read that failed keeps the panel, which says so with Try again: the words of a failed recording mustn't vanish.
  it("waits for the transcript's answer before laying out nothing to play, and keeps the panel for a failed read", () => {
    expect(transcriptLayout("failed", { source: true, answered: false, lines: 0, failed: false })).toBe("wait")
    expect(transcriptLayout("empty", { source: true, answered: false, lines: 0, failed: false })).toBe("wait")
    expect(transcriptLayout("failed", { source: true, answered: true, lines: 0, failed: true })).toBe("panel")
    expect(transcriptLayout("empty", { source: true, answered: true, lines: 0, failed: true })).toBe("panel")
  })

  // meet-02 (calls head C): an event's player opens by its play path with no transcript route, so it can't read the
  // call's words. It keeps no Transcript panel rather than say "No transcript available" beside a call whose row says
  // "Transcript, 120 lines".
  it("keeps no Transcript panel when it has no transcript to read", () => {
    for (const status of ["ready", "recording", "failed", "empty", undefined]) {
      expect(transcriptLayout(status, { source: false, answered: true, lines: 0, failed: false })).toBe("none")
    }
  })

  it("says nothing was recorded, not that it couldn't be saved", () => {
    render(<RecordingStageMessage media={readRecordingMedia({ status: "empty" })} loadError={false} playbackFailed={false} onRetry={() => {}} />)
    const stage = screen.getByRole("status")
    expect(stage.getAttribute("data-recording-state")).toBe("empty")
    expect(screen.getByText("Nothing was recorded")).toBeInTheDocument()
    expect(stage.textContent).toContain("No camera, microphone or screen came through before it stopped")
    expect(screen.queryByText("This recording couldn't be saved")).toBeNull()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    expect(document.querySelector("video")).toBeNull()
  })
})

describe("meet-02 LIVE (DESIGN-BUILD-64's MUST 1): the player's stage is its picture's box", () => {
  it("sizes the stage to the picture in the sheet, and on a phone above the words", () => {
    expect(stageFit({ fullScreen: false, phone: false, words: true })).toBe("picture")
    expect(stageFit({ fullScreen: false, phone: false, words: false })).toBe("picture")
    // A phone's player is always full screen: the words under the picture fill what's left.
    expect(stageFit({ fullScreen: true, phone: true, words: true })).toBe("picture")
  })

  it("lets the stage fill a full screen: a wide screen's Full screen, or a phone with no words to show", () => {
    expect(stageFit({ fullScreen: true, phone: false, words: true })).toBe("screen")
    expect(stageFit({ fullScreen: true, phone: false, words: false })).toBe("screen")
    expect(stageFit({ fullScreen: true, phone: true, words: false })).toBe("screen")
  })
})
