import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"

import type { MyRoom } from "@/services/roomService"

// A member's personal room (/app/meet/room, calls CALLS-2): opened once at
// their name, then its lobby, passcode and address changed here, or closed.

const mine = vi.hoisted(() => ({ room: null as MyRoom | null }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async () => ({ data: { data: mine.room } }) },
}))
const openMyRoom = vi.fn()
const changeMyRoom = vi.fn()
const closeMyRoom = vi.fn()
vi.mock("@/services/roomService", () => ({
  MY_ROOM: "/calls/room",
  openMyRoom: () => openMyRoom(),
  changeMyRoom: (c: unknown) => changeMyRoom(c),
  closeMyRoom: () => closeMyRoom(),
}))
const router = { push: vi.fn(), back: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn((o: { onConfirm: () => unknown }) => o.onConfirm())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import { YourRoom } from "./YourRoom"

const ROOM: MyRoom = { meeting_id: "m1", room: "meet-m1", title: "Maya Chen's room", slug: "maya-chen", address: "/r/maya-chen", passcode: false, guests_wait: true, on: true }

async function open() {
  await act(async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <YourRoom />
      </SWRConfig>,
    )
  })
}

const taken = { response: { status: 409, data: { code: "taken", msg: "That address is taken. Try another." } } }

describe("your room", () => {
  beforeEach(() => {
    mine.room = null
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // clearAllMocks keeps queued answers: a test that fails before its Save
    // would hand them to the next one, and one red would read as two.
    changeMyRoom.mockReset()
  })

  it("opens at your name, then is shared by its address and started on its meeting's page", async () => {
    openMyRoom.mockResolvedValue(ROOM)
    await open()
    expect(await screen.findByText("No room yet")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Open your room" })))
    const address = await screen.findByLabelText("Your room's address")
    expect(address.textContent).toBe(`${window.location.origin}/r/maya-chen`)
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    expect(router.push).toHaveBeenCalledWith("/app/meet/m/m1")
  })

  it("says why it couldn't be opened, in the server's words", async () => {
    openMyRoom.mockRejectedValue({ response: { status: 403, data: { code: "rooms_off", msg: "Personal rooms are off for this workspace." } } })
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Open your room" })))
    expect((await screen.findByRole("alert")).textContent).toBe("Personal rooms are off for this workspace.")
  })

  it("lets guests in at once when the lobby is turned off", async () => {
    mine.room = ROOM
    changeMyRoom.mockResolvedValue({ ...ROOM, guests_wait: false })
    await open()
    const lobby = await screen.findByRole("switch", { name: "Guests wait in the lobby" })
    expect(lobby.getAttribute("aria-checked")).toBe("true")
    // Colleagues at the address come in as themselves, without waiting:
    // "Join as yourself" on its page (HU13).
    expect(screen.getByText("People in your workspace can come in as themselves, without waiting.")).toBeInTheDocument()
    await act(async () => fireEvent.click(lobby))
    expect(changeMyRoom).toHaveBeenCalledWith({ guests_wait: false })
    await waitFor(() => expect(screen.getByRole("switch", { name: "Guests wait in the lobby" }).getAttribute("aria-checked")).toBe("false"))
  })

  // The server takes 6 to 128 characters (business/Guest SecretProblem): a
  // shorter one was sent, and refused, while the field asked for 4.
  it("sets a passcode of six characters or more, as the server takes them, and turns it off", async () => {
    mine.room = ROOM
    changeMyRoom.mockResolvedValueOnce({ ...ROOM, passcode: true }).mockResolvedValueOnce({ ...ROOM, passcode: false })
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Set a passcode" }))
    const field = screen.getByLabelText("Passcode") as HTMLInputElement
    expect(field.placeholder).toBe("At least 6 characters")
    fireEvent.change(field, { target: { value: "12345" } })
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(field, { target: { value: "654321" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(changeMyRoom).toHaveBeenCalledWith({ passcode: "654321" })
    expect(await screen.findByText("Guests type it before they come in. A new one asks everyone again.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn off" })))
    expect(changeMyRoom).toHaveBeenLastCalledWith({ passcode: "" })
    expect(await screen.findByRole("button", { name: "Set a passcode" })).toBeInTheDocument()
  })

  it("says an address that's taken, and keeps the one it has", async () => {
    mine.room = ROOM
    changeMyRoom.mockRejectedValue(taken)
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    const field = screen.getByLabelText("Address") as HTMLInputElement
    expect(field.value).toBe("maya-chen")
    fireEvent.change(field, { target: { value: "ben" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(changeMyRoom).toHaveBeenCalledWith({ slug: "ben" })
    // Said once, under the field and marked on it: not saved, and why.
    expect(await screen.findByText("Not saved. That address is taken. Try another.")).toBeInTheDocument()
    expect(screen.getAllByText(/That address is taken/)).toHaveLength(1)
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.textContent).toBe("Not saved. That address is taken. Try another.")
    expect(document.querySelector("[data-save-failed]")).toBeNull()
    expect(screen.getByLabelText("Your room's address").textContent).toMatch(/\/r\/maya-chen$/)
  })

  // Every change that ticks is offered back (settings, design-14): Undo runs
  // the row's own change with the old value.
  type Offer = { title: string; action: { props: { onClick: () => Promise<void> } } }
  const offered = (): Offer[] => toast.mock.calls.map(([t]) => t).filter((t) => t?.action)
  const undo = (t: Offer) => act(async () => t.action.props.onClick())
  // The toast's parts load on first use (import()): settle them before saying none came.
  const settled = () => act(async () => void (await import("@/components/ui/undoToast")))

  it("offers the lobby's change back, and Undo puts it back", async () => {
    mine.room = ROOM
    changeMyRoom.mockImplementation(async (c: Partial<MyRoom>) => ({ ...ROOM, ...c }))
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("switch", { name: "Guests wait in the lobby" })))
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Guests wait in the lobby: Off"]))
    await undo(offered()[0])
    expect(changeMyRoom.mock.calls.map(([c]) => c)).toEqual([{ guests_wait: false }, { guests_wait: true }])
  })

  it("offers a first passcode back, and Undo takes it off", async () => {
    mine.room = ROOM
    changeMyRoom.mockImplementation(async (c: { passcode?: string }) => ({ ...ROOM, passcode: !!c.passcode }))
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Set a passcode" }))
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "654321" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Passcode: On"]))
    await undo(offered()[0])
    expect(changeMyRoom.mock.calls.map(([c]) => c)).toEqual([{ passcode: "654321" }, { passcode: "" }])
    expect(await screen.findByRole("button", { name: "Set a passcode" })).toBeInTheDocument()
  })

  it("offers nothing back for a changed or removed passcode: the old one never reached the page", async () => {
    mine.room = { ...ROOM, passcode: true }
    changeMyRoom.mockImplementation(async (c: { passcode?: string }) => ({ ...ROOM, passcode: !!c.passcode }))
    await open()
    fireEvent.click((await screen.findAllByRole("button", { name: "Change" }))[0])
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "987654" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(changeMyRoom).toHaveBeenCalledWith({ passcode: "987654" })
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Turn off" })))
    expect(changeMyRoom).toHaveBeenLastCalledWith({ passcode: "" })
    await settled()
    expect(offered()).toEqual([])
  })

  it("offers a new address back, and Undo asks for the old one", async () => {
    mine.room = ROOM
    changeMyRoom.mockImplementation(async (c: { slug?: string }) => ({ ...ROOM, slug: c.slug ?? ROOM.slug, address: `/r/${c.slug ?? ROOM.slug}` }))
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "maya" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Address: /r/maya"]))
    await undo(offered()[0])
    expect(changeMyRoom.mock.calls.map(([c]) => c)).toEqual([{ slug: "maya" }, { slug: "maya-chen" }])
  })

  it("closes after asking, and can be opened again", async () => {
    mine.room = ROOM
    closeMyRoom.mockResolvedValue(undefined)
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Close room" })))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Close your room?", destructive: true }))
    expect(closeMyRoom).toHaveBeenCalled()
    expect(await screen.findByText("No room yet")).toBeInTheDocument()
  })

  it("says when rooms are off, and when an admin turned its link off", async () => {
    mine.room = { ...ROOM, on: false, slug: "", address: "" }
    openMyRoom.mockResolvedValue({ ...ROOM, on: false })
    await open()
    expect(await screen.findByText(/Personal rooms are off for this workspace/)).toBeInTheDocument()
    expect(screen.getByText("Your room has no address")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Give it an address" })))
    expect(openMyRoom).toHaveBeenCalled()
    expect(await screen.findByLabelText("Your room's address")).toBeInTheDocument()
  })
})
