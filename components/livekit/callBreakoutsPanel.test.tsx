import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CAN_ATTRIBUTE, ROLE_ATTRIBUTE, partOf } from "@/lib/calls/control"
import type { CallBreakouts } from "@/lib/calls/breakouts"
import CallBreakoutsPanel, { clock, roomNamesToSend } from "./CallBreakoutsPanel"

// The app's Select, as plain buttons: the panel's own logic is what's tested
// here; e2e/callBreakouts.spec.ts drives the real one.
vi.mock("@/components/ui/select", () => {
  const Pick = React.createContext<(v: string) => void>(() => {})
  return {
    Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) => (
      <div data-select="">
        <Pick.Provider value={onValueChange}>{children}</Pick.Provider>
      </div>
    ),
    SelectTrigger: (p: { "aria-label"?: string; "aria-labelledby"?: string; children: React.ReactNode }) => (
      <button type="button" aria-label={p["aria-label"]} aria-labelledby={p["aria-labelledby"]}>
        {p.children}
      </button>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const pick = React.useContext(Pick)
      return (
        <button type="button" role="option" aria-selected={false} onClick={() => pick(value)}>
          {children}
        </button>
      )
    },
  }
})
const choose = (label: string, option: string) => fireEvent.click(within(screen.getByLabelText(label).parentElement!).getByRole("option", { name: option }))

// Breakout rooms for whoever runs the call (calls package C, meet-10 and
// zoom-02): name the rooms, put people in them, open them, speak to every
// room, call everyone back. Each act goes to the server, which says no in its
// own words; only those the server lets run the rooms are offered the panel.

afterEach(cleanup)

const PRIYA = { identity: "priya", name: "Priya Shah" }
const JO = { identity: "jo", name: "Jo Park" }
const rooms = (o: Partial<CallBreakouts> = {}): CallBreakouts => ({
  open: false,
  choose: false,
  rooms: [
    { n: 1, name: "Design" },
    { n: 2, name: "Launch" },
  ],
  assigned: {},
  room: 0,
  ...o,
})

describe("who is offered the rooms", () => {
  it("only whoever the server lets run them: a host or co-host's breakouts, never a participant's or a guest's", () => {
    expect(partOf({ [ROLE_ATTRIBUTE]: "host", [CAN_ATTRIBUTE]: "mute,breakouts" }).can.has("breakouts")).toBe(true)
    expect(partOf({ [ROLE_ATTRIBUTE]: "participant", [CAN_ATTRIBUTE]: "" }).can.has("breakouts")).toBe(false)
    expect(partOf({ [ROLE_ATTRIBUTE]: "guest" }).can.has("breakouts")).toBe(false)
  })
})

describe("setting up the rooms", () => {
  it("starts with two rooms to name, adds and removes them, and makes them by name", async () => {
    const onAct = vi.fn(() => Promise.resolve(true))
    render(<CallBreakoutsPanel breakouts={undefined} people={[PRIYA]} onAct={onAct} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText("Room 1's name"), { target: { value: "  Design " } })
    fireEvent.click(screen.getByRole("button", { name: "Add a room" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Room 2" }))
    fireEvent.click(screen.getByRole("button", { name: "Make 2 rooms" }))
    await waitFor(() => expect(onAct).toHaveBeenCalledWith("breakouts_set", { rooms: ["Design", "Room 3"] }))
  })

  it("keeps the names as the server does: trimmed, none empty", () => {
    expect(roomNamesToSend([" A ", "", "  ", "B"])).toEqual(["A", "B"])
  })
})

describe("the rooms at work", () => {
  it("puts someone in a room, spreads everyone, and opens the rooms with a time limit and choosing", () => {
    const onAct = vi.fn()
    render(<CallBreakoutsPanel breakouts={rooms({ assigned: { jo: 2 } })} people={[PRIYA, JO]} onAct={onAct} onClose={() => {}} />)
    expect(screen.getByRole("status")).toHaveTextContent("The rooms aren't open yet")
    expect(screen.getByText("In the main room, no room yet: 1")).toBeTruthy()
    choose("Priya Shah's room", "Design")
    expect(onAct).toHaveBeenCalledWith("breakouts_assign", { identity: "priya", room: 1, name: "Priya Shah" })
    fireEvent.click(screen.getByRole("button", { name: "Spread everyone evenly" }))
    expect(onAct).toHaveBeenCalledWith("breakouts_spread")
    fireEvent.click(screen.getByLabelText("Let people choose their room"))
    choose("Close the rooms after", "15 minutes")
    fireEvent.click(screen.getByRole("button", { name: "Open rooms" }))
    expect(onAct).toHaveBeenCalledWith("breakouts_open", { on: true, minutes: 15 })
  })

  it("while open: says the time left, sends a message to every room, and closes them", async () => {
    const onAct = vi.fn(() => Promise.resolve(true))
    render(<CallBreakoutsPanel breakouts={rooms({ open: true, assigned: { jo: 1 }, endsAt: Date.now() + 245_000 })} people={[JO]} onAct={onAct} onClose={() => {}} />)
    expect(screen.getByRole("status").textContent).toMatch(/The rooms are open: 4:0[45] left/)
    expect(screen.queryByRole("button", { name: "Rename or add rooms" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Message to every room"), { target: { value: "  Five minutes left " } })
    fireEvent.click(screen.getByRole("button", { name: "Send to every room" }))
    expect(onAct).toHaveBeenCalledWith("breakouts_broadcast", { text: "Five minutes left" })
    await waitFor(() => expect((screen.getByLabelText("Message to every room") as HTMLInputElement).value).toBe(""))
    fireEvent.click(screen.getByRole("button", { name: "Close rooms" }))
    expect(onAct).toHaveBeenCalledWith("breakouts_close")
  })

  it("counts down the call back, can't be closed twice, and spreads nobody meanwhile", () => {
    render(<CallBreakoutsPanel breakouts={rooms({ open: true, closingAt: Date.now() + 25_000 })} people={[]} onAct={vi.fn()} onClose={() => {}} />)
    expect(screen.getByRole("status").textContent).toMatch(/Everyone comes back in 0:2[45]/)
    expect(screen.getByRole("button", { name: "Calling everyone back" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Spread everyone evenly" })).toBeNull()
  })

  it("keeps what failed: a message the server didn't send stays typed, and rooms it didn't make stay in the editor (CR-68 SF1)", async () => {
    const onAct = vi.fn(() => Promise.resolve(false))
    const { unmount } = render(<CallBreakoutsPanel breakouts={rooms({ open: true })} people={[]} onAct={onAct} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText("Message to every room"), { target: { value: "Back soon" } })
    fireEvent.click(screen.getByRole("button", { name: "Send to every room" }))
    await waitFor(() => expect(onAct).toHaveBeenCalled())
    await Promise.resolve()
    expect((screen.getByLabelText("Message to every room") as HTMLInputElement).value).toBe("Back soon")
    unmount()
    render(<CallBreakoutsPanel breakouts={rooms()} people={[]} onAct={onAct} onClose={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Rename or add rooms" }))
    fireEvent.click(screen.getByRole("button", { name: "Save rooms" }))
    await waitFor(() => expect(onAct).toHaveBeenLastCalledWith("breakouts_set", { rooms: ["Design", "Launch"] }))
    expect(screen.getByLabelText("Room 1's name")).toBeTruthy()
  })

  it("counts someone in another room whose name this room doesn't know", () => {
    render(<CallBreakoutsPanel breakouts={rooms({ assigned: { jo: 1, far: 1 } })} people={[JO]} onAct={vi.fn()} onClose={() => {}} />)
    const design = document.querySelector('[data-breakout-room="1"]')!
    expect(design.textContent).toContain("2 people")
    expect(design.textContent).toContain("Jo Park, 1 more")
  })

  it("writes minutes and seconds", () => {
    expect(clock(245)).toBe("4:05")
    expect(clock(0)).toBe("0:00")
  })
})
