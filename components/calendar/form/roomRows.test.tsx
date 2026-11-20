import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Room } from "@/lib/calendar/rooms"

// The room picker in the event form (gcal-6): the rooms free for the slot as
// chips to press, the chosen ones pressed (a booked room of its own stays
// offered), and the save's refusal said at the row.
const free = vi.hoisted(() => ({ rooms: undefined as Room[] | undefined, failed: false, tooLong: false, retry: vi.fn(), args: [] as unknown[] }))
// The room directory, read only when no room is free (ask), to tell "none
// free then" from "none set up"; and whether the reader is a workspace admin.
const dir = vi.hoisted(() => ({ rooms: undefined as Room[] | undefined, failed: false, retry: vi.fn(), asks: [] as boolean[] }))
const me = vi.hoisted(() => ({ admin: false }))
vi.mock("@/hooks/useRooms", () => ({
  useFreeRooms: (...args: unknown[]) => {
    free.args = args
    return { rooms: free.rooms, failed: free.failed, tooLong: free.tooLong, retry: free.retry }
  },
  useRoomDirectory: (ask: boolean) => {
    dir.asks.push(ask)
    return ask ? { rooms: dir.rooms, failed: dir.failed, retry: dir.retry } : { rooms: undefined, failed: false, retry: dir.retry }
  },
}))
vi.mock("@/hooks/useMyId", () => ({ useWorkspaceAdmin: () => me.admin }))

import { RoomRows } from "@/components/calendar/form/roomRows"
import { pinTestClock } from "@/lib/testing/testClock"

// A fixed day, so nothing here reads the machine's clock.
pinTestClock()

const room = (id: string, name: string, capacity = 6): Room => ({ id, name, building: "North wing", floor: "2", capacity, features: [], retired: false })
const ATLAS = room("r-atlas", "Atlas", 8)
const BOOTH = room("r-booth", "Booth", 2)
const START = new Date("2026-10-21T14:00:00Z")
const END = new Date("2026-10-21T15:00:00Z")

beforeEach(() => {
  free.rooms = [ATLAS, BOOTH]
  free.failed = false
  free.tooLong = false
  free.retry.mockReset()
  dir.rooms = [ATLAS, BOOTH]
  dir.failed = false
  dir.retry.mockReset()
  dir.asks = []
  me.admin = false
})
afterEach(cleanup)

describe("RoomRows", () => {
  it("asks for the rooms free for the slot, sized for its people, and books one when pressed", () => {
    const onChange = vi.fn()
    render(<RoomRows id="rooms" rooms={[]} onChange={onChange} start={START} end={END} capacity={3} />)
    expect(free.args).toEqual([START, END, 3])
    const atlas = screen.getByRole("button", { name: /Atlas/ })
    expect(atlas).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(atlas)
    expect(onChange).toHaveBeenCalledWith([ATLAS])
  })

  it("shows a chosen room pressed even when the free list leaves it out, and lets it go", () => {
    free.rooms = [BOOTH]
    const onChange = vi.fn()
    render(<RoomRows id="rooms" rooms={[ATLAS]} onChange={onChange} start={START} end={END} capacity={3} />)
    const atlas = screen.getByRole("button", { name: /Atlas/ })
    expect(atlas).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(atlas)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("says when no room is free, while it looks, and when the look failed", () => {
    free.rooms = []
    const { rerender } = render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("No room is free then.")).toBeInTheDocument()
    free.rooms = undefined
    rerender(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("Finding free rooms…")).toBeInTheDocument()
    free.failed = true
    rerender(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("Couldn't find the free rooms.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(free.retry).toHaveBeenCalled()
  })

  it("asks the room directory only when no room is free and none is chosen", () => {
    const { rerender } = render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(dir.asks.every((ask) => !ask)).toBe(true)
    free.rooms = []
    rerender(<RoomRows id="rooms" rooms={[ATLAS]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(dir.asks.at(-1)).toBe(false)
    expect(screen.getByText("No other room is free then.")).toBeInTheDocument()
    rerender(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(dir.asks.at(-1)).toBe(true)
    expect(screen.getByText("No room is free then.")).toBeInTheDocument()
    expect(screen.queryByText(/No rooms yet/)).toBeNull()
  })

  it("tells an admin the workspace has no rooms yet, with the way to add them", () => {
    free.rooms = []
    dir.rooms = []
    me.admin = true
    render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText(/^No rooms yet\.$/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Add rooms" })).toHaveAttribute("href", "/app/admin?tab=rooms")
    expect(screen.queryByText("No room is free then.")).toBeNull()
  })

  it("tells a member the workspace has no rooms yet and who adds them, with no link", () => {
    free.rooms = []
    dir.rooms = []
    render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("No rooms yet. An admin adds them in Settings, Rooms.")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("keeps the looking and failed notes while the directory is read, never a flash of no rooms", () => {
    free.rooms = []
    dir.rooms = undefined
    const { rerender } = render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("Finding free rooms…")).toBeInTheDocument()
    expect(screen.queryByText(/No room/)).toBeNull()
    dir.failed = true
    rerender(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={3} />)
    expect(screen.getByText("Couldn't find the free rooms.")).toBeInTheDocument()
    expect(screen.queryByText(/No room/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(dir.retry).toHaveBeenCalled()
    expect(free.retry).not.toHaveBeenCalled()
  })

  it("says the save's refusal at the row in the server's words alone, and a taken room the way forward", () => {
    // The server's real wording: it names the other event only to someone who may read it (B314 rooms.go RoomTakenError).
    const { rerender } = render(
      <RoomRows id="rooms" rooms={[ATLAS]} onChange={() => {}} start={START} end={END} capacity={3} problem={{ message: "Atlas is booked on 2026-10-21.", taken: true }} />,
    )
    expect(screen.getByRole("alert").textContent).toBe("Atlas is booked on 2026-10-21.Pick another room or time.")
    rerender(<RoomRows id="rooms" rooms={[ATLAS]} onChange={() => {}} start={START} end={END} capacity={3} problem={{ message: "Atlas is booked on 2026-10-21 (Design crit).", taken: true }} />)
    // The other event is said once, in the server's msg.
    expect(screen.getByRole("alert").textContent).toBe("Atlas is booked on 2026-10-21 (Design crit).Pick another room or time.")
    rerender(<RoomRows id="rooms" rooms={[ATLAS]} onChange={() => {}} start={START} end={END} capacity={3} problem={{ message: "That room isn't available." }} />)
    expect(screen.getByRole("alert").textContent).toBe("That room isn't available.")
  })

  it("says plainly that rooms are looked up for up to 14 days, with no retry that can't help", () => {
    free.tooLong = true
    render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={0} />)
    expect(screen.getByText("Free rooms can be found for up to 14 days.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("shows the first eight free rooms and the rest on asking", () => {
    free.rooms = Array.from({ length: 11 }, (_, i) => room(`r${i}`, `Room ${i + 1}`))
    render(<RoomRows id="rooms" rooms={[]} onChange={() => {}} start={START} end={END} capacity={0} />)
    expect(screen.queryByRole("button", { name: /Room 9/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "3 more rooms" }))
    expect(screen.getByRole("button", { name: /Room 11/ })).toBeInTheDocument()
  })
})
