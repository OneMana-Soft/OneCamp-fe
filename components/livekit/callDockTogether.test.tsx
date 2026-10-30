import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Step 3, part 2 (the rivals review against Zoom, 16 Oct): the dock had no
// Participants, no React, a Chat nobody wired, and only Leave said its name
// on a computer. Together now holds People (with how many), Chat and React,
// and from 1280 px of stage each control says its word under it.

vi.mock("@livekit/components-react", () => ({
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: vi.fn(), setCameraEnabled: vi.fn(), setScreenShareEnabled: vi.fn() },
    isMicrophoneEnabled: true,
    isCameraEnabled: true,
    isScreenShareEnabled: false,
  }),
}))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => false }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

import { CallDock } from "./VideoControls"

afterEach(cleanup)

const dock = (over: Partial<Parameters<typeof CallDock>[0]> = {}) =>
  render(
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
      people={{ count: 3, open: false, onToggle: () => {} }}
      onReact={() => {}}
      {...over}
    />,
  )

const order = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-call-dock] button[aria-label], [data-dock-divider]"))
    .map((el) => (el.hasAttribute("data-dock-divider") ? "|" : el.getAttribute("aria-label")))
    .join(" ")

describe("the dock's Together group", () => {
  it("holds People with how many are in the call, Chat and React, before the view and Record", () => {
    const { container } = dock({ onToggleRecording: () => {} })
    expect(order(container)).toBe("Mute Turn camera off | Share screen Show captions | People, 3 Chat React Switch to speaker view Record More call options | Leave call")
  })

  it("says how many are in the call on People, and opens and closes the list", () => {
    const toggle = vi.fn()
    dock({ people: { count: 3, open: false, onToggle: toggle } })
    const people = screen.getByRole("button", { name: "People, 3" })
    expect(people.getAttribute("aria-pressed")).toBe("false")
    expect(people.parentElement?.textContent).toContain("3")
    fireEvent.click(people)
    expect(toggle).toHaveBeenCalled()
    cleanup()
    dock({ people: { count: 3, open: true, onToggle: toggle } })
    expect(screen.getByRole("button", { name: "People, 3" }).getAttribute("aria-pressed")).toBe("true")
  })

  // CALLS-2: on a phone, More says who waits in its first row, with See who.
  it("opens More with who waits first, and See who opens the list", () => {
    const toggle = vi.fn()
    dock({ people: { count: 3, open: false, onToggle: toggle, waiting: 2 } })
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const items = screen.getAllByRole("menuitem")
    expect(items[0].textContent).toBe("2 waiting to joinSee who")
    expect(items[0].className).not.toContain("text-brand")
    fireEvent.click(items[0])
    expect(toggle).toHaveBeenCalled()
  })

  // CALLS-2: whoever may let people in sees from the dock that someone waits.
  it("turns the count sun, +N, while people wait to join, and says so", () => {
    dock({ people: { count: 3, open: false, onToggle: vi.fn(), waiting: 2 } })
    const people = screen.getByRole("button", { name: "People, 3, 2 waiting to join" })
    // Waiting is pending, which is sun: never a second orange beside Admit.
    const badge = people.parentElement?.querySelector('span[aria-hidden][class*="bg-[#F5B544]"]')
    expect(badge?.textContent).toBe("+2")
    expect(people.parentElement?.querySelector("span[aria-hidden].bg-brand")).toBeNull()
  })

  it("opens a tray of six from React, sends the one picked, and closes", () => {
    const react = vi.fn()
    dock({ onReact: react })
    const button = screen.getByRole("button", { name: "React" })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(button)
    const tray = screen.getByRole("group", { name: "Reactions" })
    const choices = within(tray).getAllByRole("button")
    expect(choices.map((b) => b.textContent)).toEqual(["👍", "❤️", "😂", "🎉", "👏", "😮"])
    expect(choices.map((b) => b.getAttribute("aria-label"))).toEqual(["Thumbs up", "Heart", "Laughing", "Celebrate", "Clapping", "Surprised"])
    fireEvent.click(within(tray).getByRole("button", { name: "Celebrate" }))
    expect(react).toHaveBeenCalledWith("🎉")
    expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull()
  })

  it("has no People, Chat or React where none is given", () => {
    const { container } = dock({ people: undefined, onReact: undefined, onChatToggle: undefined })
    expect(order(container)).toBe("Mute Turn camera off | Share screen Show captions | Switch to speaker view More call options | Leave call")
  })
})

describe("the phone's More", () => {
  it("lists the people in the call with how many, beside Chat", () => {
    const toggle = vi.fn()
    dock({ people: { count: 4, open: false, onToggle: toggle } })
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const row = screen.getByRole("menuitem", { name: /People/ })
    expect(row.textContent).toMatch(/People\s*4/)
    fireEvent.click(row)
    expect(toggle).toHaveBeenCalled()
  })
})

describe("the dock's words", () => {
  it("say each control's name under it on a phone and on a stage of 1280 px or more, never between", () => {
    const { container } = dock({ onToggleRecording: () => {} })
    const words = Array.from(container.querySelectorAll("[data-dock-word]"))
    expect(words.map((w) => w.textContent)).toEqual(["Mic", "Camera", "Share", "Captions", "People", "Chat", "React", "Layout", "Record"])
    for (const w of words) expect(w.className).toMatch(/@3xl:hidden @7xl:block/)
    // Leave says its name beside its icon from 768 px of stage.
    expect(screen.getByRole("button", { name: "Leave call" }).textContent).toBe("Leave")
  })
})
