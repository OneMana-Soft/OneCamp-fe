// The green room listens to the microphone 30 times a second for its meters,
// and every sample drew the whole green room again: its preview, its dock,
// its column and its tooltips (CALLS-11 counted about 3,600 renders opening it
// from Home, with Mic and Video, the dock's icons, among the most drawn). Only
// the meters draw a sample now, and the room itself only when "you're muted"
// should show or go.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FakeLocalVideoTrack, fakeMedia } from "@/lib/testing/fakeMedia"

vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  // LiveKit's track over the camera the green room opened.
  LocalVideoTrack: (await import("@/lib/testing/fakeMedia")).FakeLocalVideoTrack,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

// The dock's buttons, counted: they draw each time the green room does. They
// are wrapped where PreJoin takes them from, ./DockButton (VideoControls
// passes the same ones on).
const dock = vi.hoisted(() => ({ draws: 0 }))
vi.mock("./DockButton", async (orig) => {
  const real = await orig<typeof import("./DockButton")>()
  return {
    ...real,
    DockButton: (props: Parameters<typeof real.DockButton>[0]) => {
      dock.draws++
      return <real.DockButton {...props} />
    },
  }
})

import { PreJoin } from "./PreJoin"

// Backgrounds and sound is a chunk of its own (next/dynamic), and the room has
// settled once it is in. Its first load is a cold transform: on a loaded
// machine it ran the first test past findByRole's second before a draw was
// counted (sweep s6, 29 Oct). So it loads here, before any test's clock runs.
beforeAll(() => import("@/components/call/effects/GreenRoomEffects"), 60_000)

// A microphone whose loudness the test sets, read through an analyser as the room reads it.
let loudness = 0
const frames: FrameRequestCallback[] = []
let clock = 0

beforeEach(() => {
  loudness = 0
  frames.length = 0
  clock = 0
  dock.draws = 0
  FakeLocalVideoTrack.made = []
  fakeMedia("tracks")
  class FakeAudioContext {
    createAnalyser() {
      // A steady signal of this loudness: the room's RMS reads it as `loudness`.
      return { fftSize: 512, getFloatTimeDomainData: (buf: Float32Array) => buf.fill(loudness / 2) }
    }
    createMediaStreamSource() {
      return { connect: () => {} }
    }
    close() {
      return Promise.resolve()
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext)
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal("cancelAnimationFrame", () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** `n` animation frames, 34 ms apart: each one a sample the meters read. */
async function frames34(n: number, level: () => number) {
  for (let i = 0; i < n; i++) {
    loudness = level()
    clock += 34
    const due = frames.splice(0)
    await act(async () => due.forEach((cb) => cb(clock)))
  }
}

async function greenRoom() {
  render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
  // The camera and the microphone open, and LiveKit takes the camera.
  await waitFor(() => expect(frames.length, "the meter is sampling").toBeGreaterThan(0))
  await waitFor(() => expect(FakeLocalVideoTrack.made.at(-1)?.shownIn.length, "the preview shows LiveKit's camera").toBe(1))
  // Its dock button's first draw would count as noise: the room has settled
  // once Backgrounds and sound is in (loaded before the tests, above).
  await screen.findByRole("button", { name: "Backgrounds and sound" })
}

describe("the green room's microphone meter", () => {
  it("draws the room once, not with every sample of a quiet room's noise", async () => {
    await greenRoom()
    const before = dock.draws
    // A second of room noise, under the speaking threshold, never the same twice.
    let i = 0
    await frames34(30, () => (++i % 2 ? 0.006 : 0.012))
    expect(dock.draws - before, "the dock's buttons drew again with the noise").toBe(0)
  })

  it("still moves the meters when someone speaks", async () => {
    await greenRoom()
    await frames34(6, () => 0.3)
    const meters = Array.from(document.querySelectorAll("[data-mic-meter]"))
    expect(meters.length).toBeGreaterThan(0)
    for (const meter of meters) expect(Number(meter.getAttribute("data-bars")), "a meter lights bars for a voice").toBeGreaterThan(0)
    await frames34(20, () => 0)
    for (const meter of meters) expect(Number(meter.getAttribute("data-bars")), "and lets them fall in silence").toBe(0)
  })

  it("says you're muted when you speak muted, and draws the room only to say it", async () => {
    await greenRoom()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mute" })))
    expect(screen.queryByText(/You're muted/)).toBeNull()
    const before = dock.draws
    await frames34(10, () => 0.3)
    expect(screen.getByText(/You're muted/)).toBeInTheDocument()
    const once = dock.draws - before
    expect(once, "the room drew to show the line").toBeGreaterThan(0)
    await frames34(10, () => 0.31)
    expect(dock.draws - before, "and not again while the voice goes on").toBe(once)
  })
})

// Join hands the camera and microphone to the call (greenRoomHandOver): from
// then the call stops them, so the green room going leaves them open. A join
// that never got a call gives them back, and they stop with the room again.
describe("the green room's camera and microphone at Join", () => {
  const open = async (joining: boolean, onJoin = vi.fn()) => {
    const view = render(<PreJoin onJoin={onJoin} username="Sam Rivera" joining={joining} />)
    await waitFor(() => expect(FakeLocalVideoTrack.made.at(-1)?.shownIn.length, "the preview shows LiveKit's camera").toBe(1))
    await waitFor(() => expect(frames.length, "the meter is sampling").toBeGreaterThan(0))
    return { view, onJoin }
  }
  const asked = () => (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.results
  const given = async () => {
    const streams = (await Promise.all(asked().map((r) => r.value))) as MediaStream[]
    return streams.flatMap((s) => s.getTracks())
  }

  it("hands the call the open camera, LiveKit's track over it and the microphone", async () => {
    const { onJoin } = await open(false)
    fireEvent.click(screen.getByRole("button", { name: "Join now" }))
    const [camera, mic] = ["video", "audio"].map(async (kind) => (await given()).find((t) => t.kind === kind))
    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({
        audioEnabled: true,
        videoEnabled: true,
        tracks: expect.objectContaining({
          camera: expect.objectContaining({ track: await camera, liveKit: FakeLocalVideoTrack.made.at(-1) }),
          mic: expect.objectContaining({ track: await mic }),
        }),
      }),
    )
  })

  it("leaves what it handed over open as it goes, and stops it all when nothing was handed over", async () => {
    const first = await open(false)
    fireEvent.click(screen.getByRole("button", { name: "Join now" }))
    first.view.rerender(<PreJoin onJoin={first.onJoin} username="Sam Rivera" joining />)
    // The call asks whether this green room is still here to take them back (greenRoomOpen).
    const { tracks } = first.onJoin.mock.calls[0][0] as { tracks: { greenRoomOpen?: () => boolean } }
    expect(tracks.greenRoomOpen?.(), "the green room is open").toBe(true)
    first.view.unmount()
    expect(tracks.greenRoomOpen?.(), "the green room has gone").toBe(false)
    for (const t of await given()) expect(t.stop, `the ${t.kind} stays open for the call`).not.toHaveBeenCalled()

    cleanup()
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockClear()
    const second = await open(false)
    second.view.unmount()
    for (const t of await given()) expect(t.stop, `the ${t.kind} stops with the room`).toHaveBeenCalled()
  })

  it("takes them back when the join gets no call, and stops them as it goes", async () => {
    const { view, onJoin } = await open(false)
    fireEvent.click(screen.getByRole("button", { name: "Join now" }))
    view.rerender(<PreJoin onJoin={onJoin} username="Sam Rivera" joining />)
    // The server didn't answer: still the green room, joining no more.
    view.rerender(<PreJoin onJoin={onJoin} username="Sam Rivera" joining={false} />)
    view.unmount()
    for (const t of await given()) expect(t.stop, `the ${t.kind} is the green room's again`).toHaveBeenCalled()
  })
})
