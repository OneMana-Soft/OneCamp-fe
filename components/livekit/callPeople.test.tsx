import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ParticipantKind } from "livekit-client"

// Step 3, part 2: who is in the call. The dock had no list and no count; the
// tiles counted screens, so a presenter counted twice.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

import { peopleOf } from "./callPeople"
import CallPeoplePanel from "./CallPeoplePanel"

afterEach(cleanup)

const person = (identity: string, name: string, over: Record<string, unknown> = {}) => ({
  identity,
  name,
  isLocal: false,
  isMicrophoneEnabled: true,
  isCameraEnabled: true,
  kind: ParticipantKind.STANDARD,
  ...over,
})

describe("peopleOf", () => {
  it("counts people, never the transcription agent, with you first and the rest by name", () => {
    const rows = peopleOf([
      person("jonas", "Jonas Weber"),
      person("transcriber-bot", "Transcriber", { kind: ParticipantKind.AGENT }),
      person("sam", "Sam Rivera", { isLocal: true }),
      person("guest-7", "Guest: Priya", { isMicrophoneEnabled: false, isCameraEnabled: false }),
    ] as never)
    expect(rows.map((r) => r.name)).toEqual(["Sam Rivera", "Jonas Weber", "Priya"])
    expect(rows[0]).toMatchObject({ you: true })
    expect(rows[2]).toMatchObject({ guest: true, micOn: false, cameraOn: false })
  })
})

describe("the participants panel", () => {
  const rows = peopleOf([person("sam", "Sam Rivera", { isLocal: true }), person("maya", "Maya Chen", { isMicrophoneEnabled: false })] as never)

  it("says how many are in the call, and each one's name, with You and a muted microphone said in words", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} />)
    const panel = screen.getByRole("complementary", { name: "Participants" })
    expect(within(panel).getByRole("heading").textContent).toMatch(/In the call\s*2/)
    const list = within(panel).getAllByRole("listitem")
    expect(list.map((li) => li.querySelector("[data-person-name]")?.textContent)).toEqual(["Sam Rivera", "Maya Chen"])
    expect(list[0].textContent).toContain("You")
    expect(within(list[1]).getByText("Microphone off")).toBeTruthy()
  })

  it("closes from its own button", () => {
    const close = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={close} />)
    fireEvent.click(screen.getByRole("button", { name: "Close participants" }))
    expect(close).toHaveBeenCalled()
  })
})

// Call Control: whoever runs the call runs it from here, and only with what
// the server told the room they may do.
describe("running the call from the participants panel", () => {
  const host = { role: "host" as const, can: new Set(["mute", "mute_all", "ask_unmute", "remove", "lock", "end", "cohost", "spotlight", "mute_on_entry"] as const), identity: "sam" }
  const rows = peopleOf([
    person("sam", "Sam Rivera", { isLocal: true, attributes: { "oc.role": "host" } }),
    person("ana", "Ana Lopez", { attributes: { "oc.role": "cohost" } }),
    person("maya", "Maya Chen", { isMicrophoneEnabled: false }),
    person("guest-g1-x", "Guest: Priya", { attributes: { "oc.role": "guest" } }),
  ] as never)

  it("names each person's part beside their name", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} />)
    const tags = screen.getAllByRole("listitem").map((li) => li.querySelector("[data-person-tags]")?.textContent ?? "")
    expect(tags).toEqual(["You · Host", "Co-host", "", "Guest"])
  })

  it("offers a host each person's actions, the danger last, and asks for the person picked", async () => {
    const act = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={host} onAction={act} />)
    // Your own controls are the dock's: on your own row, only the spotlight.
    // (A menu's items load when it's first wanted: found, not got.)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Sam Rivera" }), { key: "Enter" })
    expect((await screen.findAllByRole("menuitem", undefined, { timeout: 5000 })).map((m) => m.textContent)).toEqual(["Spotlight for everyone"])
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Maya Chen" }), { key: "Enter" })
    const items = (await screen.findAllByRole("menuitem", undefined, { timeout: 5000 })).map((m) => m.textContent)
    expect(items).toEqual(["Stop video", "Ask to unmute", "Spotlight for everyone", "Make co-host", "Remove from call"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from call" }))
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "remove" }), expect.objectContaining({ identity: "maya" }))
  })

  it("never offers to make a guest a co-host", async () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={host} onAction={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Priya" }), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: "Remove from call" }, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "Make co-host" })).toBeNull()
  })

  it("gives a host the call's own controls: two actions, and the lock and joining muted as switches", () => {
    const act = vi.fn()
    const onMuteOnEntry = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={host} onAction={act} onMuteOnEntry={onMuteOnEntry} settings={{ locked: true, muteOnEntry: false }} />)
    const tools = screen.getByRole("group", { name: "Run the call" })
    expect(within(tools).getByText("Run the call")).toBeTruthy()
    expect(within(tools).getAllByRole("button").map((b) => b.textContent)).toEqual(["Mute all", "Ask all to unmute"])
    fireEvent.click(within(tools).getByRole("button", { name: "Mute all" }))
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "mute_all" }))
    // The lock is on while the call is locked, and says what it does.
    const lock = within(tools).getByRole("switch", { name: "Lock the call" })
    expect(lock.getAttribute("aria-checked")).toBe("true")
    expect(lock.getAttribute("aria-describedby") && document.getElementById(lock.getAttribute("aria-describedby")!)?.textContent).toBe("Nobody new can join")
    fireEvent.click(lock)
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "unlock" }))
    const muted = within(tools).getByRole("switch", { name: "People join muted" })
    expect(muted.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(muted)
    expect(onMuteOnEntry).toHaveBeenCalledWith(true)
  })

  it("locks an unlocked call from its switch", () => {
    const act = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={host} onAction={act} onMuteOnEntry={vi.fn()} settings={{ locked: false, muteOnEntry: true }} />)
    fireEvent.click(screen.getByRole("switch", { name: "Lock the call" }))
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "lock" }))
    expect(screen.getByRole("switch", { name: "People join muted" }).getAttribute("aria-checked")).toBe("true")
  })

  it("gives someone who runs nothing no menus and no controls", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={{ role: "participant", can: new Set(), identity: "sam" }} onAction={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
    expect(screen.queryByRole("group", { name: "Run the call" })).toBeNull()
  })
})
