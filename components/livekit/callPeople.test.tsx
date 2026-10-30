import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { ParticipantKind } from "livekit-client"

// Step 3, part 2: who is in the call. The dock had no list and no count; the
// tiles counted screens, so a presenter counted twice.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

import { peopleOf } from "./callPeople"
import CallPeoplePanel from "./CallPeoplePanel"
import { InvitePanel } from "./invite"

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
    const panel = screen.getByRole("complementary", { name: "People" })
    expect(within(panel).getByRole("heading").textContent).toMatch(/^People\s*2$/)
    const list = within(panel).getAllByRole("listitem")
    expect(list.map((li) => li.querySelector("[data-person-name]")?.textContent)).toEqual(["Sam Rivera", "Maya Chen"])
    expect(list[0].textContent).toContain("You")
    expect(within(list[1]).getByText("Microphone off")).toBeTruthy()
  })

  it("closes from its own button", () => {
    const close = vi.fn()
    render(<CallPeoplePanel people={rows} onClose={close} />)
    fireEvent.click(screen.getByRole("button", { name: "Close People" }))
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

  // Where Zoom's Participants and Meet's People put it (calls HU13;
  // DESIGN-BUILD-4, 22 Oct): the call's own Invite, at the panel's head, with
  // its word always shown.
  it("offers the call's Invite at its head, worded", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} invite={<InvitePanel label="Invite people" title="Invite to this call" description="Anyone with the link can ask to come in." />} />)
    const head = screen.getByRole("heading", { name: /^People/ }).parentElement!
    const invite = within(head).getByRole("button", { name: "Invite people" })
    const word = within(invite).getByText("Invite")
    expect(word.className).not.toContain("hidden")
  })

  // Why the call stutters for someone, for whoever runs it (calls A5, #56).
  it("says under a name when their call is suffering, and why", () => {
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} quality={new Map([["maya", "network" as const], ["priya", "fine" as const]])} />)
    const maya = screen.getByText("Maya Chen").closest("li")!
    const note = within(maya).getByText("Weak connection").closest("[data-person-quality]")!
    expect(note.getAttribute("title")).toMatch(/network/)
    expect(screen.getAllByRole("listitem").filter((li) => li.querySelector("[data-person-quality]"))).toHaveLength(1)
  })

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

// meet-12: what everyone who doesn't run the call may do, as Meet's host
// management and Zoom's Security menu, held by the server.
describe("what everyone else may do", () => {
  const holder = { role: "host" as const, can: new Set(["mute", "ask_unmute", "hold"] as const), identity: "sam" }
  const heldRows = peopleOf([
    person("sam", "Sam Rivera", { isLocal: true, attributes: { "oc.role": "host" } }),
    person("maya", "Maya Chen", { isMicrophoneEnabled: false }),
    person("kai", "Kai Lin", { isMicrophoneEnabled: false, attributes: { "oc.role": "participant", "oc.allowed": "microphone" } }),
  ] as never)

  // The switches sit behind one row that says what's off, so the panel is a
  // list of people first (DESIGN-BUILD-18's SF2).
  const letEveryone = async () => {
    const row = screen.getByRole("button", { name: "Let everyone" })
    const summary = document.getElementById(row.getAttribute("aria-describedby") ?? "")?.textContent
    fireEvent.click(row)
    return { summary, sheet: await screen.findByRole("dialog", { name: "Let everyone" }) }
  }
  // The glyph an open person menu draws for a row: two rows in one menu never share one (DESIGN-BUILD-19).
  const glyph = async (name: string) => (await screen.findByRole("menuitem", { name }, { timeout: 5000 })).querySelector("svg")?.outerHTML

  it("gives whoever may hold one row saying what's off, opening a switch for each, named as Meet names them, on while everyone may", async () => {
    const onHold = vi.fn()
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={holder} onAction={vi.fn()} held={new Set(["chat"])} onHold={onHold} hasChat />)
    expect(screen.queryByRole("switch", { name: "Send chat messages" })).toBeNull()
    const { summary, sheet } = await letEveryone()
    expect(summary).toBe("Off for everyone: chat")
    expect(within(sheet).getAllByRole("switch")).toHaveLength(5)
    expect(within(sheet).getByRole("switch", { name: "Send chat messages" }).getAttribute("aria-checked")).toBe("false")
    const mics = within(sheet).getByRole("switch", { name: "Turn on their microphone" })
    expect(mics.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(mics)
    expect(onHold).toHaveBeenLastCalledWith("microphone", true)
    fireEvent.click(within(sheet).getByRole("switch", { name: "Send chat messages" }))
    expect(onHold).toHaveBeenLastCalledWith("chat", false)
  })

  it("leaves chat out where the call has none, and says when nothing is off", async () => {
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={holder} onAction={vi.fn()} onHold={vi.fn()} />)
    const { summary, sheet } = await letEveryone()
    expect(summary).toBe("Nothing is turned off")
    expect(within(sheet).getAllByRole("switch")).toHaveLength(4)
    expect(within(sheet).queryByRole("switch", { name: "Send chat messages" })).toBeNull()
  })

  it("lets a held person talk from their menu, says who was let through, and takes it back", async () => {
    const act = vi.fn()
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={holder} onAction={act} held={new Set(["microphone"])} onHold={vi.fn()} />)
    expect(screen.getByText("Kai Lin").closest("li")!.querySelector("[data-person-tags]")?.textContent).toBe("Can talk")
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Maya Chen" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Let them talk" }, { timeout: 5000 }))
    expect(act).toHaveBeenCalledWith(expect.objectContaining({ action: "allow", what: "microphone", on: true }), expect.objectContaining({ identity: "maya" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Kai Lin" }), { key: "Enter" })
    expect(await screen.findByRole("menuitem", { name: "Stop letting them talk" }, { timeout: 5000 })).toBeTruthy()
  })

  // Both rows drew the slashed mic, one under the other (DESIGN-BUILD-19, 26 Oct).
  it("tells asking someone let through to unmute from taking it back, by its glyph", async () => {
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={holder} onAction={vi.fn()} held={new Set(["microphone"])} onHold={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Kai Lin" }), { key: "Enter" })
    const ask = await glyph("Ask to unmute")
    expect(ask).toBeTruthy()
    expect(ask).not.toBe(await glyph("Stop letting them talk"))
  })

  // Both drew the slashed mic while someone let through talked (DESIGN-BUILD-19, 26 Oct): taking it back puts the call's
  // hold on them again, so it draws the lock.
  it("tells muting someone let through from taking it back, by its glyph", async () => {
    const talking = peopleOf([
      person("sam", "Sam Rivera", { isLocal: true, attributes: { "oc.role": "host" } }),
      person("kai", "Kai Lin", { isMicrophoneEnabled: true, attributes: { "oc.role": "participant", "oc.allowed": "microphone" } }),
    ] as never)
    render(<CallPeoplePanel people={talking} onClose={vi.fn()} me={holder} onAction={vi.fn()} held={new Set(["microphone"])} onHold={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Kai Lin" }), { key: "Enter" })
    const mute = await glyph("Mute")
    expect(mute).toBeTruthy()
    expect(mute).not.toBe(await glyph("Stop letting them talk"))
  })

  it("draws each let-through with the dock's icon, and heads a phone's sheet with whose menu it is", async () => {
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={holder} onAction={vi.fn()} held={new Set(["microphone", "share"])} onHold={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More for Maya Chen" }), { key: "Enter" })
    for (const name of ["Let them talk", "Let them share"]) {
      expect((await screen.findByRole("menuitem", { name }, { timeout: 5000 })).querySelector("svg"), name).not.toBeNull()
    }
    expect(document.querySelector("[data-person-menu-head]")?.textContent).toContain("Maya Chen")
  })

  it("gives no switches and no let-through to someone who may not hold", () => {
    const cohostWithout = { role: "cohost" as const, can: new Set(["mute", "ask_unmute"] as const), identity: "ana" }
    render(<CallPeoplePanel people={heldRows} onClose={vi.fn()} me={cohostWithout} onAction={vi.fn()} held={new Set(["microphone"])} onHold={vi.fn()} hasChat />)
    expect(screen.queryByRole("button", { name: "Let everyone" })).toBeNull()
  })
})
