import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import RoomsCard from "@/components/admin/RoomsCard"
import type { Room, RoomsHttp } from "@/lib/calendar/rooms"
import { pinTestClock } from "@/lib/testing/testClock"

// The Resource Directory (gcal-6): an admin's rooms, added, changed and
// retired (soft, through the shared confirm), each with its bookings as busy
// blocks. It takes the page's own client, so the lazy card reaches no shared core.
const ATLAS: Room = { id: "r-atlas", name: "Atlas", building: "North wing", floor: "2", capacity: 8, features: ["Screen"], retired: false }

function server(rooms: Room[] | "fail") {
  let list = rooms === "fail" ? [] : [...rooms]
  const http = {
    get: vi.fn(async (url: string) => {
      if (rooms === "fail") throw Object.assign(new Error("down"), { response: { status: 500, data: { msg: "down" } } })
      if (url.includes("/bookings")) {
        return { data: { data: { room: ATLAS, bookings: [{ start: "2026-10-21T14:00:00Z", end: "2026-10-21T15:00:00Z", busy: true }, { start: "2026-10-22T09:00:00Z", end: "2026-10-22T10:00:00Z", busy: true, event_id: "e2", title: "Design crit" }] } } }
      }
      return { data: { data: list } }
    }),
    post: vi.fn(async (url: string, body: Partial<Room>) => {
      if (url.endsWith("/retire")) {
        list = list.filter((r) => !url.includes(r.id))
        return { data: { data: { ...ATLAS, retired: true } } }
      }
      const made = { ...ATLAS, ...body, id: "r-new" } as Room
      list = [...list, made]
      return { data: { data: made } }
    }),
    patch: vi.fn(async (_url: string, body: Partial<Room>) => {
      list = list.map((r) => ({ ...r, ...body }))
      return { data: { data: { ...ATLAS, ...body } } }
    }),
  }
  return http as typeof http & RoomsHttp
}

// The reader's day: Tue 20 Oct 2026, 10:00, the bookings the day after.
pinTestClock(new Date(2026, 9, 20, 10))

afterEach(cleanup)

describe("RoomsCard", () => {
  it("lists the live rooms: name, where, seats and features", async () => {
    render(<RoomsCard http={server([ATLAS])} />)
    const row = await screen.findByRole("listitem", { name: "Atlas" })
    expect(row).toHaveTextContent("North wing · Floor 2 · Seats 8")
    expect(row).toHaveTextContent("Screen")
  })

  it("says when there are no rooms yet, and offers to add one", async () => {
    render(<RoomsCard http={server([])} />)
    expect(await screen.findByText("No rooms yet")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Add a room" }).length).toBeGreaterThan(0)
  })

  it("says a failed read and tries again", async () => {
    const http = server("fail")
    render(<RoomsCard http={http} />)
    expect(await screen.findByText(/Couldn't load the rooms/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(2))
  })

  it("adds a room, names what stops it first, and says it in place", async () => {
    const http = server([])
    render(<RoomsCard http={http} />)
    fireEvent.click((await screen.findAllByRole("button", { name: "Add a room" }))[0])
    const dialog = await screen.findByRole("dialog", { name: "Add a room" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add room" }))
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Give the room a name.")
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Booth" } })
    fireEvent.change(within(dialog).getByLabelText("Seats"), { target: { value: "2" } })
    fireEvent.change(within(dialog).getByLabelText("Features"), { target: { value: "Phone, Screen" } })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Add room" })))
    expect(http.post).toHaveBeenCalledWith("/admin/calendar/rooms", { name: "Booth", building: "", floor: "", capacity: 2, features: ["Phone", "Screen"] }, expect.anything())
    expect(await screen.findByRole("listitem", { name: "Booth" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Added Booth.")
  })

  it("changes a room with only what differs", async () => {
    const http = server([ATLAS])
    render(<RoomsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Change Atlas" }))
    const dialog = await screen.findByRole("dialog", { name: "Change Atlas" })
    fireEvent.change(within(dialog).getByLabelText("Seats"), { target: { value: "10" } })
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Save room" })))
    expect(http.patch).toHaveBeenCalledWith("/admin/calendar/rooms/r-atlas", { capacity: 10 }, expect.anything())
  })

  it("retires a room through the shared confirm, softly", async () => {
    const http = server([ATLAS])
    render(<RoomsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Retire Atlas" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm).toHaveTextContent("Retire the room Atlas?")
    expect(confirm).toHaveTextContent("Its bookings stay")
    await act(async () => fireEvent.click(within(confirm).getByRole("button", { name: "Retire room" })))
    expect(http.post).toHaveBeenCalledWith("/admin/calendar/rooms/r-atlas/retire", {}, expect.anything())
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Atlas" })).toBeNull())
  })

  it("shows a room's bookings, busy alone unless the event may be read", async () => {
    const http = server([ATLAS])
    render(<RoomsCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "Bookings for Atlas" }))
    const dialog = await screen.findByRole("dialog", { name: "Atlas bookings" })
    expect(http.get).toHaveBeenCalledWith(expect.stringMatching(/^\/calendar\/rooms\/r-atlas\/bookings\?from=.+&to=.+/), expect.anything())
    const items = await within(dialog).findAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Busy")
    expect(items[1]).toHaveTextContent("Design crit")
    // Dated the house way, as the event form says a day (N7): "Wed 21 Oct", never the locale's "Wed, Oct 21".
    expect(items[0]).toHaveTextContent("Wed 21 Oct")
    expect(items[1]).toHaveTextContent("Thu 22 Oct")
  })
})
