import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Track } from "livekit-client"
import { personHue } from "@/lib/utils/getAvatarColor"

vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  // The camera never answers: the preview's in-between state.
  createLocalVideoTrack: vi.fn(() => new Promise(() => {})),
}))
let muted = true
vi.mock("@livekit/components-react", () => ({
  useIsMuted: () => muted,
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn(), setScreenShareEnabled: vi.fn() },
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
    isScreenShareEnabled: false,
  }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
// The call asks its LiveKit whether it takes one peer connection (lib/calls/onePeerConnection): two, here.
vi.mock("@/lib/calls/onePeerConnection", () => ({ onePeerConnection: async () => false }))
// The effects draw on a canvas and run MediaPipe, neither of which jsdom has: what they answer, here.
vi.mock("@/lib/calls/processors/backdrops", () => ({ backdropUrl: async (id: string) => `blob:${id}` }))
vi.mock("@/lib/calls/processors/background", () => ({ backgroundUnavailable: async () => null, applyBackground: async () => undefined }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => false }))

import { PreJoin, previewMessage } from "@/components/livekit/PreJoin"
import { CallRemoved, CameraOffFace, CaptionsOverlay, GREEN_ROOM_GROUND, LivePill, NamePlate, RecordingPill, StageFace, cameraIsOff } from "@/components/livekit/CallStage"
import { CallDock, CONTROL_LABELS, VideoControls } from "@/components/livekit/VideoControls"
import { whoIsHere } from "@/components/livekit/PreJoin"
import { ParticipantKind } from "livekit-client"
import { CallEndScreen } from "@/components/livekit/CallEndScreen"

afterEach(() => {
  cleanup()
  muted = true
})

describe("the pre-join screen", () => {
  // Media Processors (#55): backgrounds and sound on the preview, before Join.
  it("offers backgrounds and sound on the preview, and opens them there", async () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    // A piece of its own, loaded beside the preview (a still button holds its place).
    const entry = await screen.findByRole("button", { name: "Backgrounds and sound" }, { timeout: 5000 })
    expect(entry.closest("[data-prejoin-controls]")).toBeTruthy()
    expect(entry.getAttribute("aria-expanded")).toBe("false")
    await act(async () => fireEvent.click(entry))
    expect(entry.getAttribute("aria-expanded")).toBe("true")
    // The picker loads when first opened.
    expect(await screen.findByRole("radiogroup", { name: "Background" }, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "Noise reduction" })).toBeTruthy()
  })

  // "Call in #engineering" arrived after the card had drawn, and the card is
  // centred, so the whole screen moved down.
  it("keeps the place's line open before the place arrives", () => {
    const { container, rerender } = render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    const line = container.querySelector("[data-call-place]")!
    expect(line.textContent).toBe(" ")
    rerender(<PreJoin onJoin={() => {}} username="Sam Rivera" place="in #engineering" />)
    expect(container.querySelector("[data-call-place]")!.textContent).toBe("Call in #engineering")
  })

  // F-54: a meeting that can't be opened was dark whatever the theme. Only
  // what stands in for the stage once a call is over keeps the stage's dark.
  it("sits a meeting that can't be opened on the green room's ground, and keeps the dark for a call that's over", () => {
    const { container: unavailable } = render(<CallRemoved kind="unavailable" title="We couldn't find this meeting" detail="" />)
    const ground = unavailable.querySelector('[data-call-notice="unavailable"]')!
    expect(ground.className).not.toMatch(/(^|\s)dark(\s|$)/)
    for (const cls of GREEN_ROOM_GROUND.split(" ")) expect(ground.classList.contains(cls)).toBe(true)
    const { container: removed } = render(<CallRemoved kind="removed" title="You were removed" detail="" />)
    expect(removed.querySelector('[data-call-notice="removed"]')!.classList.contains("dark")).toBe(true)
    const { container: green } = render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    for (const cls of GREEN_ROOM_GROUND.split(" ")) expect(green.querySelector("[data-prejoin]")!.classList.contains(cls)).toBe(true)
  })

  // "Call in #engineering" was ink-3, which holds 3:1 and is for timestamps
  // and idle icons (design v3, §3.3); over the phone's glow it read as pale grey.
  it("writes the place in the ink for words", () => {
    const { container } = render(<PreJoin onJoin={() => {}} username="Sam Rivera" place="in #engineering" />)
    const line = container.querySelector("[data-call-place]")!
    expect(line.className).toMatch(/\btext-ink-2\b/)
    expect(line.className).not.toMatch(/\btext-ink-[34]\b/)
  })

  // The three device names floated right-aligned at three places, each after
  // whatever its row ended with.
  it("lines its devices up on one grid, the names starting together", () => {
    const { container } = render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    const rows = Array.from(container.querySelectorAll("[data-device-row]"))
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.className)).size).toBe(1)
    expect(rows[0].className).toMatch(/\bgrid\b/)
    for (const select of Array.from(container.querySelectorAll("[data-devices] select"))) expect(select.className).toContain("text-left")
    expect(container.querySelector("[data-devices]")!.textContent).not.toContain("▾")
  })

  it("says the camera is starting while it starts, not that it is off", () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    expect(screen.getByRole("status").textContent).toBe("Starting your camera…")
    expect(previewMessage({ videoEnabled: false, hasTrack: false, problem: null })).toBe("Camera is off")
  })

  it("labels the guest's name field above it, and keeps Join closed until it has a name", () => {
    render(<PreJoin onJoin={() => {}} username="" nameEditable />)
    expect(screen.getByLabelText("Your name")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Join now" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("uses the dock's words for its two controls", () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" />)
    expect(screen.getByRole("button", { name: CONTROL_LABELS.mute })).toBeTruthy()
    expect(screen.getByRole("button", { name: CONTROL_LABELS.cameraOff })).toBeTruthy()
  })

  it("says who is in the call from the room's list, and never guesses", () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" inCall={[{ id: "maya", name: "Maya Chen" }, { id: "jonas", name: "Jonas Weber" }]} recordingBy="Sam" />)
    expect(screen.getByText("Maya and Jonas are in the call")).toBeTruthy()
    // CALL-BUG-12: said before Join, not after it.
    const notice = screen.getByText("This call is being recorded by Sam. Joining puts you in the recording.")
    const join = screen.getByRole("button", { name: "Join now" })
    expect(notice.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(whoIsHere([])).toBe("No one's here yet. You'll be the first.")
    expect(whoIsHere(undefined)).toBeNull()
    expect(whoIsHere(undefined, true)).toBe("Someone is in the call")
    expect(whoIsHere([{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }])).toBe("A, B and 1 other are in the call")
  })

  it("holds Join's place while joining, and says why joining failed", () => {
    render(<PreJoin onJoin={() => {}} username="Sam Rivera" joining joinError="the room is full" />)
    expect(screen.getByRole("button", { name: /Joining/ })).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("Couldn't join: the room is full")
  })
})

describe("the call stage", () => {
  const person = (identity: string, name: string) => ({ identity, name }) as never

  it("shows a camera that is off as the person, in their own colour", () => {
    expect(cameraIsOff({ source: Track.Source.Camera, publication: undefined }, false)).toBe(true)
    expect(cameraIsOff({ source: Track.Source.ScreenShare, publication: undefined }, true)).toBe(false)
    const { container } = render(<CameraOffFace trackRef={{ participant: person("maya", "Maya Chen"), source: Track.Source.Camera } as never} />)
    // One colour per person (app/personHue.test.ts): by the name, not the call identity.
    expect(container.querySelector("[data-camera-off]")?.getAttribute("data-hue")).toBe(personHue("Maya Chen"))
    expect(screen.getByText("Maya Chen")).toBeTruthy()
  })

  it("shows nothing over a camera that is on", () => {
    muted = false
    const { container } = render(<CameraOffFace trackRef={{ participant: person("maya", "Maya Chen"), source: Track.Source.Camera, publication: {} } as never} />)
    expect(container.querySelector("[data-camera-off]")).toBeNull()
  })

  it("says who is recording, as a status, without a pulse", () => {
    render(<RecordingPill by="Maya Chen" />)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("Recording · started by Maya Chen")
    expect(status.innerHTML).not.toContain("animate-pulse")
  })

  it("draws an agent as its square, never initials", () => {
    const { container } = render(<StageFace identity="rc" name="Release Captain" agent />)
    expect(container.querySelector("[data-stage-agent] [data-agent-avatar]")).toBeTruthy()
    expect(container.textContent).not.toContain("RC")
    const { container: person } = render(<CameraOffFace trackRef={{ participant: { identity: "rc", name: "Release Captain", kind: ParticipantKind.AGENT }, source: Track.Source.Camera } as never} />)
    expect(person.querySelector("[data-hue=agent]")).toBeTruthy()
  })

  it("plates a guest by name with a Guest tag, and says muted in a glyph", () => {
    render(<NamePlate name="Priya" guest muted />)
    expect(screen.getByText("Guest")).toBeTruthy()
    expect(screen.getByLabelText("Muted")).toBeTruthy()
  })

  it("has a Live pill that stands still where asked", () => {
    const { container } = render(<LivePill pulse={false} />)
    expect(container.textContent).toBe("Live")
  })

  it("reads captions out as they change, each name in sentence case in its own colour", () => {
    const { container } = render(<CaptionsOverlay idleMessage="Listening for speech…" entries={[{ identity: "maya", name: "Maya Chen", text: "Shipping today" }]} />)
    expect(container.firstElementChild?.getAttribute("aria-live")).toBe("polite")
    const name = screen.getByText("Maya Chen")
    expect(name.className).not.toContain("uppercase")
    expect(name.className).toContain("text-hue-ink")
  })
})

const dock = (over: Partial<Parameters<typeof CallDock>[0]> = {}) => (
  <CallDock
    micOn
    cameraOn
    onToggleMic={() => {}}
    onToggleCamera={() => {}}
    onToggleShare={() => {}}
    onDisconnect={() => {}}
    onToggleCaptions={() => {}}
    onChatToggle={() => {}}
    onLayoutChange={() => {}}
    layout="grid"
    {...over}
  />
)

describe("the dock (C7)", () => {
  it("groups You, Share, Together and Leave, with dividers between", () => {
    const { container } = render(dock({ onToggleRecording: () => {} }))
    const order = Array.from(container.querySelectorAll("[data-call-dock] button[aria-label], [data-dock-divider]")).map((el) =>
      el.hasAttribute("data-dock-divider") ? "|" : el.getAttribute("aria-label"),
    )
    expect(order.join(" ")).toBe("Mute Turn camera off | Share screen Show captions | Chat Switch to speaker view Record More call options | Leave call")
  })

  it("says off with a shape as well as a colour, and aria-pressed", () => {
    render(dock({ micOn: false, cameraOn: false }))
    const mic = screen.getByRole("button", { name: "Unmute" })
    expect(mic.getAttribute("aria-pressed")).toBe("false")
    expect(mic.className).toContain("rounded-[22px]")
    expect(screen.getByRole("button", { name: "Turn camera on" }).className).toContain("rounded-[22px]")
    expect(screen.queryByText("CC")).toBeNull()
  })

  it("ends with Leave, the only danger fill", () => {
    const { container } = render(dock())
    const buttons = Array.from(container.querySelectorAll("[data-call-dock] button"))
    expect(buttons.at(-1)?.getAttribute("aria-label")).toBe("Leave call")
    expect(buttons.filter((b) => /#D1293D/.test(b.className))).toHaveLength(1)
  })

  it("hides Record from someone who may not record", () => {
    render(dock())
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull()
  })

  it("shows recording as a steady dot and the time, never a pulse", () => {
    render(dock({ onToggleRecording: () => {}, isRecording: true, recordingSince: Date.now() - 64_000 }))
    const rec = screen.getByRole("button", { name: "Stop recording" })
    expect(rec.textContent).toMatch(/1:0\d/)
    expect(rec.innerHTML).not.toContain("animate-pulse")
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

describe("the screens that stand in for the stage", () => {
  // On a call's own page, Connecting and "You left the call" sized to their
  // content: a dark strip at the top of a white window. They fill it now, the
  // way the green room does, and fill their pane beside other work.
  it("fill the window on the call's page and the pane beside other work, as the green room does", async () => {
    const { CallConnecting, CallLeft, callScreenHeight } = await import("@/components/livekit/CallStage")
    expect(callScreenHeight()).toBe("min-h-dvh")
    expect(callScreenHeight(true)).toBe("min-h-full")
    const screens = [
      [(e?: boolean) => <CallConnecting place="in #engineering" embedded={e} />, "[data-call-connecting]"],
      [(e?: boolean) => <CallLeft minutes={3} onRejoin={() => {}} embedded={e} />, "[data-call-left]"],
      [(e?: boolean) => <PreJoin onJoin={() => {}} username="Sam Rivera" embedded={e} />, "[data-prejoin]"],
    ] as const
    for (const [draw, sel] of screens) {
      const page = render(draw())
      expect(page.container.querySelector(sel)!.className).toContain("min-h-dvh")
      page.unmount()
      const pane = render(draw(true))
      const cls = pane.container.querySelector(sel)!.className
      expect(cls).toContain("min-h-full")
      expect(cls).not.toContain("min-h-dvh")
      pane.unmount()
    }
  })
})

describe("the guest meeting page", () => {
  // Leaving by mistake was a dead end: "You can close this tab".
  it("offers a way back in after leaving", () => {
    // The end screens are one component now (CallEndScreen), the guest's included.
    const src = readFileSync(resolve(__dirname, "CallEndScreen.tsx"), "utf8")
    expect(src).toMatch(/onClick=\{call\.reset\}>Join again/)
  })
})

describe("the call stage's frame", () => {
  // QA_BACKLOG "Tab consistency": Calls, Speaker vs Grid.
  it("is one frame for speaker and grid, clear of the pills and the dock", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const src = readFileSync(resolve(__dirname, "VideoConference.tsx"), "utf8")
    expect(src.match(/STAGE_FRAME\)/g)?.length).toBe(2)
    const { STAGE_FRAME } = await import("@/components/livekit/VideoConference")
    expect(STAGE_FRAME.split(" ")).toEqual(expect.arrayContaining(["px-3", "pt-12", "pb-24", "@3xl:pb-[84px]"]))
    // Importing the stage pulls in LiveKit; give it time on a loaded machine.
  }, 20_000)

  // LiveKit's theme sets system-ui on everything under data-lk-theme: the
  // call was the one place in the app not drawn in Inter.
  it("is drawn in the app's face, handed to LiveKit through its own variable", async () => {
    const src = readFileSync(resolve(__dirname, "VideoConference.tsx"), "utf8")
    const root = src.slice(src.lastIndexOf("<div", src.indexOf('data-lk-theme="default"')), src.indexOf('data-lk-theme="default"'))
    expect(root).toContain("${STAGE_TYPE}")
    const { STAGE_TYPE } = await import("@/components/livekit/VideoConference")
    expect(STAGE_TYPE).toBe("[--lk-font-family:var(--font-sans)]")
  }, 20_000)
})

// Put out because whether they may be in the call couldn't be checked as they
// connected (fail closed, 21 Oct): the one removal they can come straight back
// from, so it offers Join again and never says someone removed them.
describe("a removal that couldn't be checked", () => {
  afterEach(() => cleanup())
  const ended = (reason: string, reset = vi.fn()) =>
    ({ phase: "removed", end: { removed: { reason } }, minutes: 0, retry: vi.fn(), reset }) as unknown as Parameters<typeof CallEndScreen>[0]["call"]

  it("offers Join again to a member and a guest", () => {
    const reset = vi.fn()
    render(<CallEndScreen call={ended("unconfirmed", reset)} />)
    expect(screen.getByText("We couldn't confirm you can be in this call just now. Join again in a moment.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Join again" }))
    expect(reset).toHaveBeenCalled()
    cleanup()
    render(<CallEndScreen call={ended("unconfirmed")} guest noun="meeting" />)
    expect(screen.getByRole("button", { name: "Join again" })).toBeTruthy()
    expect(screen.queryByText(/You can close this tab/)).toBeNull()
  })

  it("offers no way back from a host's removal", () => {
    render(<CallEndScreen call={ended("host")} />)
    expect(screen.queryByRole("button", { name: "Join again" })).toBeNull()
  })
})
