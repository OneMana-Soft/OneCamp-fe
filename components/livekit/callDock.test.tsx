// The dock, wired to the room (CALL-BUG-1, 13, 19, 21): a toggle that fails
// says why, every key a tooltip teaches works, Share says when it can't, and
// the microphone's menu offers speakers where the browser can pick one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

let speakers = false
vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  supportsAudioOutputSelection: () => speakers,
}))

const setActiveMediaDevice = vi.fn(() => Promise.resolve())
const lp = {
  setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
  setCameraEnabled: vi.fn(() => Promise.resolve()),
  setScreenShareEnabled: vi.fn(() => Promise.resolve()),
}
let micOn = false
let camOn = false
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useLocalParticipant: () => ({ localParticipant: lp, isMicrophoneEnabled: micOn, isCameraEnabled: camOn, isScreenShareEnabled: false }),
  useMediaDeviceSelect: ({ kind }: { kind: string }) => ({
    devices: kind === "audiooutput" ? [{ deviceId: "hp", label: "Headphones" }] : [{ deviceId: `${kind}-1`, label: `A ${kind}` }],
    activeDeviceId: "",
    setActiveMediaDevice,
  }),
}))

import { VideoControls } from "./VideoControls"
import { CALL_KEYS } from "./callKeys"

const mediaDevices = (withDisplay: boolean) =>
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: withDisplay ? { getDisplayMedia: () => Promise.resolve() } : {} })

beforeEach(() => {
  micOn = false
  camOn = false
  speakers = false
  mediaDevices(true)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("CALL-BUG-1: a toggle that fails says why", () => {
  it("toasts the call's refusal when someone who joined muted unmutes", async () => {
    lp.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error("failed to publish track, insufficient permissions"), { name: "PublishTrackError" }))
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unmute" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "This call didn't allow your microphone", variant: "destructive" })))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true)
  })

  it("toasts a camera another app holds", async () => {
    lp.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error("Could not start video source"), { name: "NotReadableError" }))
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn camera on" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your camera is in use" })))
  })
})

describe("CALL-BUG-13: every key a tooltip teaches works", () => {
  it("fires each row of the key table", async () => {
    const actions = { captions: vi.fn(), ai: vi.fn(), layout: vi.fn() }
    render(<VideoControls onDisconnect={() => {}} onToggleCaptions={actions.captions} onToggleAI={actions.ai} onLayoutChange={actions.layout} layout="grid" />)
    for (const row of CALL_KEYS) {
      await act(async () => {
        fireEvent.keyDown(window, { key: row.shift ? row.key.toUpperCase() : row.key, shiftKey: !!row.shift })
      })
    }
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
    expect(lp.setScreenShareEnabled).toHaveBeenCalledWith(true)
    expect(actions.captions).toHaveBeenCalledTimes(1)
    expect(actions.ai).toHaveBeenCalledTimes(1)
    expect(actions.layout).toHaveBeenCalledWith("speaker")
  })

  it("takes the tooltips' keys and the handler's from the one table", () => {
    // Two lists drifted: the tooltips taught six keys and the handler answered two.
    const src = readFileSync(resolve(__dirname, "VideoControls.tsx"), "utf8")
    expect(src).not.toMatch(/CONTROL_KEYS = \{/)
    expect(src).toMatch(/callKeyAction\(e\)/)
    expect(src).not.toMatch(/e\.key === "m"/)
  })
})

describe("CALL-BUG-19: Share says when this browser can't share a screen", () => {
  it("dims Share, says why, and never calls into a capture that isn't there", async () => {
    mediaDevices(false)
    render(<VideoControls onDisconnect={() => {}} />)
    const share = screen.getByRole("button", { name: "Share screen" })
    expect(share).toHaveAttribute("aria-disabled", "true")
    await act(async () => fireEvent.click(share))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Screen sharing isn't available in this browser" }))
    await act(async () => fireEvent.keyDown(window, { key: "S", shiftKey: true }))
    expect(lp.setScreenShareEnabled).not.toHaveBeenCalled()
  })

  it("says so in the phone's More menu too", () => {
    mediaDevices(false)
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const row = document.querySelector("[data-share-unavailable]")!
    expect(row).toHaveAttribute("data-disabled")
    expect(row.textContent).toContain("Not available in this browser")
  })
})

describe("CALL-BUG-21: a speaker choice beside the microphone, only where it can work", () => {
  it("lists speakers in the microphone's menu where the browser can pick an output", async () => {
    speakers = true
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone or speaker" }), { key: "Enter" })
    expect(screen.getByText("Speaker")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Headphones" })))
    expect(setActiveMediaDevice).toHaveBeenCalledWith("hp")
  })

  it("has no speaker list where it can't (Safari)", () => {
    speakers = false
    render(<VideoControls onDisconnect={() => {}} />)
    expect(screen.queryByRole("button", { name: "Choose a microphone or speaker" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone" }), { key: "Enter" })
    expect(screen.queryByText("Speaker")).toBeNull()
  })
})
