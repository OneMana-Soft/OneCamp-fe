// The dock, wired to the room (CALL-BUG-1, 13, 19, 21): a toggle that fails
// says why, every key a tooltip teaches works, Share says when it can't, and
// the microphone's menu offers speakers where the browser can pick one.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

/** The device in use, by kind. */
let activeIds: Record<string, string> = {}
let speakers = false
vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  supportsAudioOutputSelection: () => speakers,
}))

const setActiveMediaDevice = vi.fn(() => Promise.resolve())
const lp = {
  setMicrophoneEnabled: vi.fn<(on: boolean) => Promise<void>>(() => Promise.resolve()),
  setCameraEnabled: vi.fn(() => Promise.resolve()),
  setScreenShareEnabled: vi.fn(() => Promise.resolve()),
}
// One room for the file: the dock publishes its microphone switch for it.
const room = { disconnect: vi.fn() }
let micOn = false
let camOn = false
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => room,
  useLocalParticipant: () => ({ localParticipant: lp, isMicrophoneEnabled: micOn, isCameraEnabled: camOn, isScreenShareEnabled: false }),
  useMediaDeviceSelect: ({ kind }: { kind: string }) => ({
    devices:
      kind === "audiooutput"
        ? [{ deviceId: "hp", label: "Headphones" }]
        : [
            { deviceId: `${kind}-1`, label: `A ${kind}` },
            { deviceId: `${kind}-2`, label: `Another ${kind}` },
          ],
    activeDeviceId: activeIds[kind] ?? "",
    setActiveMediaDevice,
  }),
}))

import { VideoControls } from "./VideoControls"
import { publishedSwitch } from "@/lib/calls/deviceSwitch"
import { CALL_KEYS } from "./callKeys"
import type { CallHold } from "@/lib/calls/holds"

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
    expect(src).toMatch(/callKeyAction\(e[,)]/)
    expect(src).not.toMatch(/e\.key === "m"/)
  })
})

// meet-18: Meet's and Zoom's keys, push to talk, and the call's keys in the app's list.
describe("the call's keys, as Meet and Zoom have them", () => {
  beforeEach(() => localStorage.clear())

  it("answers Meet's Ctrl+D and Zoom's Alt+V off a Mac, kept from the browser", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    let e = new KeyboardEvent("keydown", { key: "d", code: "KeyD", ctrlKey: true, cancelable: true })
    await act(async () => void window.dispatchEvent(e))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    expect(e.defaultPrevented).toBe(true)
    e = new KeyboardEvent("keydown", { key: "v", code: "KeyV", altKey: true, cancelable: true })
    await act(async () => void window.dispatchEvent(e))
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
  })

  it("opens the microphone while Space is held, muted, and closes it on release or leaving the page", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    const down = new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true })
    await act(async () => void window.dispatchEvent(down))
    expect(lp.setMicrophoneEnabled).toHaveBeenLastCalledWith(true)
    expect(down.defaultPrevented).toBe(true)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    expect(lp.setMicrophoneEnabled).toHaveBeenLastCalledWith(false)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    await act(async () => void window.dispatchEvent(new Event("blur")))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledTimes(4)
    expect(lp.setMicrophoneEnabled).toHaveBeenLastCalledWith(false)
  })

  it("leaves Space to a focused button, and an open microphone alone", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    const button = screen.getByRole("button", { name: "Unmute" })
    button.focus()
    await act(async () => void fireEvent.keyDown(button, { key: " ", code: "Space" }))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    cleanup()
    micOn = true
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("offers holding Space as a choice in the microphone's menu, kept on this device", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone" }), { key: "Enter" })
    const option = await screen.findByRole("menuitemcheckbox", { name: "Hold Space to talk" })
    expect(option.getAttribute("aria-checked")).toBe("true")
    await act(async () => fireEvent.click(option))
    expect(localStorage.getItem("onecamp.call.pushToTalk")).toBe("off")
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("says Talking while Space holds the microphone open, and Mic again on letting go", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true })))
    expect(screen.getByText("Talking")).toBeTruthy()
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    expect(screen.queryByText("Talking")).toBeNull()
    expect(screen.getByText("Mic")).toBeTruthy()
  })

  it("says why when Space can't open the microphone, or can't close it again", async () => {
    lp.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error("Could not start audio source"), { name: "NotReadableError" }))
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your microphone is in use", variant: "destructive" })))
    expect(screen.queryByText("Talking")).toBeNull()
    // Letting go after an open that failed has nothing to close.
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    lp.setMicrophoneEnabled.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("gone"))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't turn off your microphone" })))
  })

  /**
   * A microphone that opens when the test says, as when the browser's prompt
   * is up. livekit-client 2.16.0 gives up on a disable that finds no
   * publication within 10 s, so a close sent while the open waits is lost.
   */
  function promptedMicrophone() {
    const mic = { open: false, allow: undefined as (() => void) | undefined }
    lp.setMicrophoneEnabled.mockImplementation((on: boolean) => {
      if (on) {
        return new Promise<void>((resolve) => {
          mic.allow = () => {
            mic.allow = undefined
            mic.open = true
            resolve()
          }
        })
      }
      if (!mic.allow) mic.open = false
      return Promise.resolve()
    })
    onTestFinished(() => void lp.setMicrophoneEnabled.mockImplementation(() => Promise.resolve()))
    return mic
  }

  it("closes the microphone when Space is let go before it opened (CODE-REVIEWER-46 MF1)", async () => {
    const mic = promptedMicrophone()
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    await act(async () => mic.allow?.())
    expect(mic.open).toBe(false)
  })

  it("switches the microphone once at a time for Space and the dock alike", async () => {
    const mic = promptedMicrophone()
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" })))
    // A press while the browser still asks waits for it, and turns it back.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unmute" })))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    await act(async () => mic.allow?.())
    expect(mic.open).toBe(false)
    expect(lp.setMicrophoneEnabled.mock.calls).toEqual([[true], [false]])
  })

  it("puts the call's keys first in the app's keys list while the call is up", async () => {
    const { pageGroups } = await import("@/lib/shortcuts/pageGroups")
    const { unmount } = render(<VideoControls onDisconnect={() => {}} />)
    expect(pageGroups().map((g) => g.title)).toEqual(["This call"])
    expect(pageGroups()[0].rows[0]).toEqual({ keys: "M or Ctrl/⌘ + D or Alt + A", does: "Turn your microphone on or off" })
    unmount()
    expect(pageGroups()).toEqual([])
  })
})

// CODE-REVIEWER-48's should-fix (26 Oct): an "asked to unmute" notice's Unmute
// reaches the microphone's one switch, the dock's, while the dock is up.
describe("the microphone's one switch, for the rest of the call", () => {
  it("is the dock's while it is up: Mic pressed while the browser asks, then the notice's Unmute, asks the browser once", async () => {
    let land = () => {}
    lp.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<void>((done) => (land = done)))
    const { unmount } = render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }))
    const shared = publishedSwitch(room, "microphone")
    expect(shared).toBeDefined()
    void shared!.to(true)
    land()
    await waitFor(() => expect(lp.setMicrophoneEnabled).toHaveBeenCalledTimes(1))
    unmount()
    expect(publishedSwitch(room, "microphone")).toBeUndefined()
  })

  // CODE-REVIEWER-51's should-fix (26 Oct): the notice's Unmute went round the call's hold, and the browser's refusal then
  // read "Leave and rejoin". The camera first: the dock says a title only once in 4 s, and an earlier leg's Mic title would swallow this one.
  it("keeps the call's hold: while it holds your microphone, the notice's Unmute says why and asks the browser nothing", async () => {
    render(<VideoControls onDisconnect={() => {}} held={new Set<CallHold>(["microphone", "camera"])} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn camera on" })))
    let reached: boolean | undefined
    await act(async () => void (reached = await publishedSwitch(room, "microphone")!.to(true)))
    expect(reached).toBe(false)
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The people running the call have turned off microphones." }))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
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

describe("meet-12: what the people running the call hold for you", () => {
  beforeEach(() => localStorage.clear())
  const held = (...h: CallHold[]) => new Set<CallHold>(h)

  it("dims the microphone, camera and Share in their places, says why, and never asks the call server", async () => {
    render(<VideoControls onDisconnect={() => {}} held={held("microphone", "camera", "share")} />)
    const said = [
      ["Unmute", "The people running the call have turned off microphones."],
      ["Turn camera on", "The people running the call have turned off video."],
      ["Share screen", "The people running the call have turned off screen sharing."],
    ] as const
    for (const [name, why] of said) {
      const control = screen.getByRole("button", { name })
      expect(control).toHaveAttribute("aria-disabled", "true")
      await act(async () => fireEvent.click(control))
      expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: why, tone: "info" }))
    }
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(lp.setCameraEnabled).not.toHaveBeenCalled()
    expect(lp.setScreenShareEnabled).not.toHaveBeenCalled()
  })

  it("says why for the keys too, and Space held to talk opens nothing", async () => {
    render(<VideoControls onDisconnect={() => {}} held={held("microphone")} />)
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", ctrlKey: true, cancelable: true })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "The people running the call have turned off microphones." }))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true })))
    await act(async () => void window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" })))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(screen.queryByText("Talking")).toBeNull()
  })

  it("never holds turning something off", async () => {
    micOn = true
    render(<VideoControls onDisconnect={() => {}} held={held("microphone")} />)
    const mute = screen.getByRole("button", { name: "Mute" })
    expect(mute).not.toHaveAttribute("aria-disabled")
    await act(async () => fireEvent.click(mute))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(false)
  })

  it("says why in the React tray, and keeps the signs beside your name", async () => {
    const onReact = vi.fn()
    render(<VideoControls onDisconnect={() => {}} onReact={onReact} feedback={{ current: null, onSet: vi.fn() }} held={held("react")} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "React" })))
    expect(await screen.findByText("The people running the call have turned off reactions.")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull()
    expect(await screen.findByRole("group", { name: "Signs that stay" })).toBeTruthy()
  })

  it("says so in the phone's More menu", () => {
    render(<VideoControls onDisconnect={() => {}} held={held("share")} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const row = document.querySelector("[data-share-held]")!
    expect(row).toHaveAttribute("data-disabled")
    expect(row.textContent).toContain("The people running the call have turned off screen sharing.")
  })

  // A press of the held Mic said why but not what to do, as the hold's own notice does (DESIGN-BUILD-19, 26 Oct).
  // The dock says the same words once in 4 s, so this comes last and presses the camera first: its Mic never follows another's.
  it("says what to do about a held microphone, and adds nothing where there's nothing to do", async () => {
    render(<VideoControls onDisconnect={() => {}} held={held("microphone", "camera")} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn camera on" })))
    expect(toast.mock.lastCall?.[0]).toMatchObject({ title: "The people running the call have turned off video." })
    expect(toast.mock.lastCall?.[0].description).toBeUndefined()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Unmute" })))
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The people running the call have turned off microphones.", description: "Raise your hand to ask to talk." }))
  })
})

describe("meet-18: the device menus say which device is in use", () => {
  afterEach(() => {
    activeIds = {}
  })

  it("lists each kind of device as a choice of one, the one in use checked, to a screen reader too", async () => {
    speakers = true
    activeIds = { audioinput: "audioinput-2", audiooutput: "hp" }
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone or speaker" }), { key: "Enter" })
    const mics = await screen.findByRole("group", { name: "Microphone" })
    expect(within(mics).getByRole("menuitemradio", { name: "Another audioinput" })).toHaveAttribute("aria-checked", "true")
    expect(within(mics).getByRole("menuitemradio", { name: "A audioinput" })).toHaveAttribute("aria-checked", "false")
    expect(within(screen.getByRole("group", { name: "Speaker" })).getByRole("menuitemradio", { name: "Headphones" })).toHaveAttribute("aria-checked", "true")
    // The mark is the app's one check (MenuCheck), on the chosen alone.
    expect(within(mics).getAllByRole("menuitemradio").filter((r) => r.querySelector('[data-menu-check="on"]'))).toHaveLength(1)
    await act(async () => fireEvent.click(within(mics).getByRole("menuitemradio", { name: "A audioinput" })))
    expect(setActiveMediaDevice).toHaveBeenCalledWith("audioinput-1")
  })

  it("marks the camera that will start while the camera is off, where the browser lists no default", async () => {
    // Off, the room names no camera ("" or "default"), and Chrome's camera list has no "default" entry.
    for (const off of ["", "default"]) {
      activeIds = { videoinput: off }
      render(<VideoControls onDisconnect={() => {}} />)
      fireEvent.keyDown(screen.getByRole("button", { name: "Choose a camera" }), { key: "Enter" })
      const cameras = await screen.findByRole("group", { name: "Camera" })
      expect(within(cameras).getByRole("menuitemradio", { name: "A videoinput" })).toHaveAttribute("aria-checked", "true")
      expect(within(cameras).getAllByRole("menuitemradio").filter((r) => r.querySelector('[data-menu-check="on"]'))).toHaveLength(1)
      cleanup()
    }
  })
})

describe("CALL-BUG-21: a speaker choice beside the microphone, only where it can work", () => {
  it("lists speakers in the microphone's menu where the browser can pick an output", async () => {
    speakers = true
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone or speaker" }), { key: "Enter" })
    expect(screen.getByText("Speaker")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("menuitemradio", { name: "Headphones" })))
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

// DESIGN-BUILD-2's review (17 Oct 2026): the call's notices sat on its dock,
// and the call's menus and toasts were white over the dark stage in light mode.
describe("the dock keeps the toasts above it, and the call's overlays dark", () => {
  it("sets the toasts' floor while it is on screen, and takes it away when it goes", () => {
    const root = document.documentElement
    // jsdom lays nothing out, so the dock is said to be drawn 700px down.
    const box = { top: 700, width: 600, height: 72 } as DOMRect
    const boxes = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(box)
    const rects = vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([box] as unknown as DOMRectList)
    onTestFinished(() => {
      boxes.mockRestore()
      rects.mockRestore()
    })
    const { unmount } = render(<VideoControls onDisconnect={() => {}} />)
    expect(root.style.getPropertyValue("--call-dock-floor")).toBe(`${window.innerHeight - 700 + 12}px`)
    unmount()
    expect(root.style.getPropertyValue("--call-dock-floor")).toBe("")
  })

  // DESIGN-BUILD-37 (29 Oct 2026): on a phone the first Admit's toast lay over
  // the knock bar on the dock, Admit all under it, until it faded.
  it("keeps the toasts above a notice on the dock too, and back on the dock when it goes", () => {
    const root = document.documentElement
    // jsdom lays nothing out: the dock is said to be drawn 700px down, and the knock bar on it 56px higher.
    const dock = { top: 700, width: 390, height: 72 } as DOMRect
    const bar = { top: 644, width: 374, height: 48 } as DOMRect
    const at = (el: Element) => (el.matches("[data-dock-notice]") ? bar : dock)
    const boxes = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return at(this)
    })
    const rects = vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      return [at(this)] as unknown as DOMRectList
    })
    onTestFinished(() => {
      boxes.mockRestore()
      rects.mockRestore()
    })
    const { rerender, unmount } = render(<VideoControls onDisconnect={() => {}} notice={<p>Gia Russo is waiting to join</p>} />)
    expect(root.style.getPropertyValue("--call-dock-floor")).toBe(`${window.innerHeight - 644 + 12}px`)
    rerender(<VideoControls onDisconnect={() => {}} />)
    expect(root.style.getPropertyValue("--call-dock-floor")).toBe(`${window.innerHeight - 700 + 12}px`)
    unmount()
    expect(root.style.getPropertyValue("--call-dock-floor")).toBe("")
  })

  it("raises the call's toasts on its dark surface, in either theme", async () => {
    lp.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error("Could not start video source"), { name: "NotReadableError" }))
    render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn camera on" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your camera is in use", className: "dark" })))
  })

  it("draws every menu and popover the call opens on its dark surface", () => {
    // Each of the call's portalled overlays carries the stage's surface: none is drawn in the page's theme.
    // Invite's panel (invite.tsx) is every call's: an instant meeting's and a conversation's.
    for (const file of ["VideoControls.tsx", "PersonMenuItems.tsx", "CallStage.tsx", "invite.tsx"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8")
      const overlays = src.match(/<(DropdownMenuContent|PopoverContent)\b[^>]*>/g) ?? []
      expect(overlays.length, file).toBeGreaterThan(0)
      for (const tag of overlays) expect(tag, `${file}: ${tag}`).toContain("CALL_SURFACE")
    }
    // And no call file raises a toast in the page's theme.
    for (const file of ["VideoControls.tsx", "callHosting.tsx", "VideoConference.tsx", "InstantMeetingView.tsx", "KnockBar.tsx", "invite.tsx", "ConversationInvite.tsx", "MemberDoorView.tsx"]) {
      expect(readFileSync(resolve(__dirname, file), "utf8"), file).not.toMatch(/from "@\/hooks\/use-toast"/)
    }
  })
})

// Media Processors (#55): backgrounds and sound are a click away from the
// camera's and the microphone's menus, and from the phone's More.
describe("backgrounds and sound from the dock", () => {
  it("opens from the camera's menu and the microphone's, named for each", () => {
    const onToggle = vi.fn()
    render(<VideoControls onDisconnect={() => {}} effects={{ open: false, onToggle }} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a camera" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Background effects…" }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a microphone" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Noise reduction…" }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it("opens from the phone's More", () => {
    const onToggle = vi.fn()
    render(<VideoControls onDisconnect={() => {}} effects={{ open: false, onToggle }} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Backgrounds and sound" }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("isn't in the menus where the call offers no effects", () => {
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Choose a camera" }), { key: "Enter" })
    expect(screen.queryByRole("menuitem", { name: "Background effects…" })).toBeNull()
  })
})

describe("polls and Q&A from the dock (calls package A)", () => {
  it("opens and closes its panel, pressed while it's open", () => {
    const onToggle = vi.fn()
    const { rerender } = render(<VideoControls onDisconnect={() => {}} activities={{ open: false, onToggle, lit: false }} />)
    const button = screen.getByRole("button", { name: "Polls and Q&A" })
    expect(button).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<VideoControls onDisconnect={() => {}} activities={{ open: true, onToggle, lit: false }} />)
    expect(screen.getByRole("button", { name: "Polls and Q&A" })).toHaveAttribute("aria-pressed", "true")
  })

  it("says something new waits there while the panel is shut, in its name and with a dot, and on the phone's More", () => {
    const onToggle = vi.fn()
    render(<VideoControls onDisconnect={() => {}} activities={{ open: false, onToggle, lit: true }} />)
    // A dot by the dock's button and one on the phone's More.
    expect(screen.getByRole("button", { name: "Polls and Q&A, something new" })).toBeTruthy()
    expect(document.querySelectorAll("[data-dock-new]")).toHaveLength(2)
    const more = screen.getByRole("button", { name: "More call options, something new in Polls and Q&A" })
    fireEvent.keyDown(more, { key: "Enter" })
    const row = screen.getByRole("menuitem", { name: /^Polls and Q&A/ })
    expect(row.textContent).toContain("New")
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledTimes(1)
    cleanup()
    render(<VideoControls onDisconnect={() => {}} activities={{ open: true, onToggle, lit: true }} />)
    expect(screen.getByRole("button", { name: "Polls and Q&A" })).toBeTruthy()
    expect(document.querySelectorAll("[data-dock-new]")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "More call options" })).toBeTruthy()
  })

  it("isn't in the dock where the call has no polls and Q&A", () => {
    render(<VideoControls onDisconnect={() => {}} />)
    expect(screen.queryByRole("button", { name: /^Polls and Q&A/ })).toBeNull()
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    expect(screen.queryByRole("menuitem", { name: /^Polls and Q&A/ })).toBeNull()
  })
})

// CR-54's and CR-55's SF1: a row picked with the pointer gave the focus back to More, and Chrome ringed it. Rows that
// open a panel hand it to the panel; every other row gives it back only for a key (lib/ui/inputModality).
describe("the phone's More menu, as it closes", () => {
  it("leaves the focus where a pointer's pick left it, and gives it back to More after a key's", async () => {
    render(<VideoControls onDisconnect={() => {}} layout="grid" onLayoutChange={vi.fn()} />)
    const more = screen.getByRole("button", { name: "More call options" })
    fireEvent.keyDown(more, { key: "Enter" })
    const row = await screen.findByRole("menuitem", { name: "Switch to speaker view" })
    fireEvent.pointerDown(row, { button: 0, pointerType: "mouse" })
    fireEvent.click(row)
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(document.activeElement).not.toBe(more)

    fireEvent.keyDown(more, { key: "Enter" })
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Switch to speaker view" }), { key: "Enter" })
    await waitFor(() => expect(document.activeElement).toBe(more))
  })
})

// Calls package B: for whoever may present one (lib/calls/control's boardControls),
// Share offers a board beside the screen, and says why when it can't.
describe("Share: a screen or a board", () => {
  const board = (o: { present?: "yes" | "held" | "busy"; busyBy?: string; presenting?: boolean } = {}) => ({
    present: "yes" as const,
    presenting: false,
    onPresent: vi.fn(),
    onStop: vi.fn(),
    ...o,
  })
  const openShare = () => fireEvent.keyDown(screen.getByRole("button", { name: "Share" }), { key: "Enter" })

  it("opens a menu to share the screen or present a board", async () => {
    const b = board()
    render(<VideoControls onDisconnect={() => {}} board={b} />)
    openShare()
    fireEvent.click(await screen.findByRole("menuitem", { name: /Present a board/ }))
    expect(b.onPresent).toHaveBeenCalledTimes(1)
    openShare()
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: /Share screen/ })))
    expect(lp.setScreenShareEnabled).toHaveBeenCalledWith(true)
  })

  it("says why a board can't go up: sharing is held, or someone else's board is up", async () => {
    render(<VideoControls onDisconnect={() => {}} board={board({ present: "held" })} />)
    openShare()
    const held = await screen.findByRole("menuitem", { name: /Present a board/ })
    expect(held).toHaveAttribute("aria-disabled", "true")
    expect(held).toHaveTextContent("The people running the call have turned off screen sharing.")
    cleanup()
    render(<VideoControls onDisconnect={() => {}} board={board({ present: "busy", busyBy: "Priya" })} />)
    openShare()
    const busy = await screen.findByRole("menuitem", { name: /Present a board/ })
    expect(busy).toHaveAttribute("aria-disabled", "true")
    expect(busy).toHaveTextContent("Priya is presenting a board")
  })

  it("lights Share while your board is up, and stops it from the same menu", async () => {
    const b = board({ presenting: true })
    render(<VideoControls onDisconnect={() => {}} board={b} />)
    expect(screen.getByRole("button", { name: "Share" })).toHaveAttribute("data-dock-state", "active")
    openShare()
    fireEvent.click(await screen.findByRole("menuitem", { name: "Stop presenting" }))
    expect(b.onStop).toHaveBeenCalledTimes(1)
  })

  it("on a phone with no screen capture, offers the board in More instead of a dead Share screen", async () => {
    mediaDevices(false)
    const b = board()
    render(<VideoControls onDisconnect={() => {}} board={b} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const present = await screen.findByRole("menuitem", { name: /Present a board/ })
    expect(screen.queryByRole("menuitem", { name: /Share screen/ })).toBeNull()
    fireEvent.click(present)
    expect(b.onPresent).toHaveBeenCalledTimes(1)
  })
})
