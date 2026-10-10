import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Track } from "livekit-client"
import { hueFor } from "@/lib/campHue"

vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  // The camera never answers: the preview's in-between state.
  createLocalVideoTrack: vi.fn(() => new Promise(() => {})),
}))
let muted = true
vi.mock("@livekit/components-react", () => ({
  useIsMuted: () => muted,
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn(), setScreenShareEnabled: vi.fn() },
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
    isScreenShareEnabled: false,
  }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => false }))

import { PreJoin, previewMessage } from "@/components/livekit/PreJoin"
import { CameraOffFace, CaptionsOverlay, RecordingIndicator, cameraIsOff } from "@/components/livekit/CallStage"
import { VideoControls } from "@/components/livekit/VideoControls"

afterEach(() => {
  cleanup()
  muted = true
})

describe("the pre-join screen", () => {
  // "Call in #engineering" arrived after the card had drawn, and the card is
  // centred, so the whole screen moved down.
  it("keeps the place's line open before the place arrives", () => {
    const { container, rerender } = render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    const line = container.querySelector("[data-call-place]")!
    expect(line.textContent).toBe(" ")
    rerender(<PreJoin onJoin={() => {}} username="Sam Rivera" place="in #engineering" />)
    expect(container.querySelector("[data-call-place]")!.textContent).toBe("Call in #engineering")
  })

  it("says the camera is starting while it starts, not that it is off", () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    expect(screen.getByRole("status").textContent).toBe("Starting your camera…")
    expect(previewMessage({ videoEnabled: false, hasTrack: false, problem: null })).toBe("Camera is off")
  })

  it("labels the guest's name field above it", () => {
    render(<PreJoin onJoin={() => {}} username="" nameEditable />)
    expect(screen.getByLabelText("Your name")).toBeTruthy()
  })
})

describe("the call stage", () => {
  const person = (identity: string, name: string) => ({ identity, name }) as never

  it("shows a camera that is off as the person, in their own colour", () => {
    expect(cameraIsOff({ source: Track.Source.Camera, publication: undefined }, false)).toBe(true)
    expect(cameraIsOff({ source: Track.Source.ScreenShare, publication: undefined }, true)).toBe(false)
    const { container } = render(<CameraOffFace trackRef={{ participant: person("maya", "Maya Chen"), source: Track.Source.Camera } as never} />)
    expect(container.querySelector("[data-camera-off]")?.getAttribute("data-hue")).toBe(hueFor("maya"))
    expect(screen.getByText("Maya Chen")).toBeTruthy()
  })

  it("shows nothing over a camera that is on", () => {
    muted = false
    const { container } = render(<CameraOffFace trackRef={{ participant: person("maya", "Maya Chen"), source: Track.Source.Camera, publication: {} } as never} />)
    expect(container.querySelector("[data-camera-off]")).toBeNull()
  })

  it("says who is recording, as a status, without a pulse", () => {
    render(<RecordingIndicator by="Maya Chen" />)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("Recording, started by Maya Chen")
    expect(status.innerHTML).not.toContain("animate-pulse")
  })

  it("reads captions out as they change, each name in sentence case in its own colour", () => {
    const { container } = render(<CaptionsOverlay idleMessage="Listening for speech…" entries={[{ identity: "maya", name: "Maya Chen", text: "Shipping today" }]} />)
    expect(container.firstElementChild?.getAttribute("aria-live")).toBe("polite")
    const name = screen.getByText("Maya Chen")
    expect(name.className).not.toContain("uppercase")
    expect(name.className).toContain("text-hue-ink")
  })
})

describe("the call controls", () => {
  it("use the pre-join screen's words, a captions glyph, and a Leave that says so", () => {
    render(<VideoControls onDisconnect={() => {}} onToggleCaptions={() => {}} onToggleRecording={() => {}} isRecording />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Turn camera off" })).toBeTruthy()
    expect(screen.queryByText("CC")).toBeNull()
    expect(screen.getByRole("button", { name: "Leave call" }).textContent).toContain("Leave")
    expect(screen.getByRole("button", { name: "Stop recording" }).className).not.toContain("animate-pulse")
  })

  it("sit on a solid surface, not frosted glass", () => {
    render(<VideoControls onDisconnect={() => {}} />)
    expect(screen.getByRole("toolbar", { name: "Call controls" }).className).not.toMatch(/backdrop-blur|bg-black/)
  })
})

describe("the guest meeting page", () => {
  // Leaving by mistake was a dead end: "You can close this tab".
  it("offers a way back in after leaving", () => {
    const src = readFileSync(resolve(__dirname, "../../app/guest/m/[token]/page.tsx"), "utf8")
    expect(src).toMatch(/onClick=\{\(\) => setPhase\("prejoin"\)\}>\s*Join again/)
  })
})

describe("the call stage's frame", () => {
  // QA_BACKLOG "Tab consistency": Calls, Speaker vs Grid.
  it("is one frame for speaker and grid, clear of the dock", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const src = readFileSync(resolve(__dirname, "VideoConference.tsx"), "utf8")
    expect(src.match(/STAGE_FRAME\)/g)?.length).toBe(2)
    expect(src).not.toMatch(/p-2 pb-24 gap-2"|pb-20 @3xl:pb-24/)
    const { STAGE_FRAME } = await import("@/components/livekit/VideoConference")
    expect(STAGE_FRAME.split(" ")).toEqual(expect.arrayContaining(["pb-24", "@3xl:pb-24", "p-2", "@3xl:p-4"]))
  })
})
