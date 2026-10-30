import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GuestGrant } from "@/services/guestService"

const setGuestAccess = vi.fn()
const setGuestPublish = vi.fn()
const setGuestRooms = vi.fn()
const listGuestGrants = vi.fn()
vi.mock("@/services/guestService", () => ({
  setGuestOption: (option: "enabled" | "publish" | "rooms", on: boolean) => ({ enabled: setGuestAccess, publish: setGuestPublish, rooms: setGuestRooms })[option](on),
  listGuestGrants: () => listGuestGrants(),
  revokeGuestGrant: vi.fn(),
}))
const getWorkspaceSettings = vi.hoisted(() => vi.fn(() => Promise.resolve({ guest_access_enabled: false } as unknown)))
// The setting is read through the one shared SWR key (useWorkspaceSettings);
// the request it makes answers from getWorkspaceSettings.
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: async () => ({ data: { data: await getWorkspaceSettings() } }), post: vi.fn() },
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import { SWRConfig } from "swr"
import Card from "./GuestAccessCard"

const GuestAccessCard = () => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
    <Card />
  </SWRConfig>
)

const grant = (id: string, resource_type: string): GuestGrant => ({
  id, resource_type, resource_id: id, capability: "comment", created_by: "u1", expires_at: null, created_at: "2026-10-01T00:00:00Z",
})

async function open() {
  await act(async () => {
    render(<GuestAccessCard />)
  })
}

describe("guest access, turned off with links made", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("still lists the links, which can be revoked", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project"), grant("g2", "doc")])
    await open()
    expect(await screen.findByText("Guest links, paused while guest access is off")).toBeInTheDocument()
    expect(screen.getByText("Project")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2)
  })

  it("says how many links will work again before turning it on", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project"), grant("g2", "doc")])
    setGuestAccess.mockResolvedValue(true)
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("switch", { name: "Allow guest links" })))
    expect(setGuestAccess).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Turn guest access back on?",
      description: expect.stringContaining("2 guest links made before will work again"),
    }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(setGuestAccess).toHaveBeenCalledWith(true)
  })

  it("turns on at once when there are no links to wake", async () => {
    listGuestGrants.mockResolvedValue([])
    setGuestAccess.mockResolvedValue(true)
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("switch", { name: "Allow guest links" })))
    expect(confirm).not.toHaveBeenCalled()
    expect(setGuestAccess).toHaveBeenCalledWith(true)
  })

  it("describes what links can really do", async () => {
    listGuestGrants.mockResolvedValue([])
    await open()
    expect(screen.queryByText(/read-only link/)).not.toBeInTheDocument()
    expect(screen.getByText(/channel, project or meeting/)).toBeInTheDocument()
  })
})

describe("guest access, read and labelled honestly", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    getWorkspaceSettings.mockImplementation(() => Promise.resolve({ guest_access_enabled: false }))
  })

  it("says it couldn't read the setting, with no switch to guess at, and tries again", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockImplementationOnce(() => Promise.reject(new Error("503")))
    await open()
    expect(await screen.findByText(/Couldn't load the guest access setting/)).toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Allow guest links" })).toBeNull()
    getWorkspaceSettings.mockImplementationOnce(() => Promise.resolve({ guest_access_enabled: true }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect((await screen.findByRole("switch", { name: "Allow guest links" })).getAttribute("aria-checked")).toBe("true")
  })

  // Design v3 (admin A8, §1.5): a link's type is a category, so its tile is
  // a neutral glyph on sunken, never a hue; the links are rows of the
  // switch's own card; Open and Revoke are one size.
  it("draws each link as a row of the card with a neutral tile, and Open and Revoke at one size", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project")])
    await open()
    const row = (await screen.findByText("Project")).closest("li") as HTMLElement
    expect(row.className).toContain("set-row")
    expect(row.closest("[data-settings-card]")).toBe(screen.getByRole("switch", { name: "Allow guest links" }).closest("[data-settings-card]"))
    expect(row.querySelector("[class*='hue-']")).toBeNull()
    expect(row.querySelector(".bg-sunken svg")).toBeTruthy()
    const openLink = screen.getByRole("link", { name: /open/i })
    const revoke = screen.getByRole("button", { name: "Revoke" })
    const height = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(md:)?h-\d+$/.test(c)).sort().join(" ")
    expect(height(openLink)).toBe(height(revoke))
  })

  it("reveals the links in a stagger when guest access is turned on here", async () => {
    listGuestGrants.mockResolvedValue([])
    setGuestAccess.mockResolvedValue(true)
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("switch", { name: "Allow guest links" })))
    const heading = await screen.findByText("Active guest links")
    const row = heading.parentElement as HTMLElement
    expect(row.className).toContain("cfg-reveal")
    expect(row.style.getPropertyValue("--i")).toBe("0")
  })

  it("names the switch, and heads the links in sentence case", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project")])
    await open()
    expect(await screen.findByRole("switch", { name: "Allow guest links" })).toBeInTheDocument()
    const heading = screen.getByText("Guest links, paused while guest access is off")
    expect(heading.className).not.toMatch(/uppercase/)
    expect(screen.getByText("Can comment")).toBeInTheDocument()
  })

  it("says why revoking a link failed", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project")])
    const revoke = (await import("@/services/guestService")).revokeGuestGrant as ReturnType<typeof vi.fn>
    revoke.mockRejectedValue({ response: { data: { msg: "That link was already revoked." } } })
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }))
    await act(async () => confirm.mock.calls.at(-1)![0].onConfirm())
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't revoke the link",
      description: "That link was already revoked.",
      variant: "destructive",
    }))
  })
})

// Publishing pages is guest access's one sub-option, under its switch: off
// with guest access, and saved on its own when changed.
describe("publishing pages, under guest access", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("is off and can't be changed while guest access is off", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: false, guest_publish_enabled: true })
    await open()
    const sub = await screen.findByRole("switch", { name: "Pages can be published to the web" })
    expect(sub.getAttribute("aria-checked")).toBe("false")
    expect(sub.hasAttribute("disabled") || sub.getAttribute("data-disabled") !== null).toBe(true)
  })

  it("is saved on its own while guest access is on", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true, guest_publish_enabled: true })
    setGuestPublish.mockResolvedValue(false)
    await open()
    const sub = await screen.findByRole("switch", { name: "Pages can be published to the web" })
    expect(sub.getAttribute("aria-checked")).toBe("true")
    await act(async () => fireEvent.click(sub))
    expect(setGuestPublish).toHaveBeenCalledWith(false)
    expect(setGuestAccess).not.toHaveBeenCalled()
  })
})

// Personal meeting rooms (calls CALLS-2) are guest access's other sub-option:
// on unless turned off, off with guest access, and saved on their own; a room's
// link is listed as a room, at its address, with no end.
describe("personal meeting rooms, under guest access", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("are on until turned off, and off with guest access", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true })
    await open()
    expect((await screen.findByRole("switch", { name: "Personal meeting rooms" })).getAttribute("aria-checked")).toBe("true")
    cleanup()
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: false, guest_rooms_enabled: true })
    await open()
    const off = await screen.findByRole("switch", { name: "Personal meeting rooms" })
    expect(off.getAttribute("aria-checked")).toBe("false")
    expect(off.hasAttribute("disabled") || off.getAttribute("data-disabled") !== null).toBe(true)
  })

  it("are saved on their own while guest access is on", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true, guest_rooms_enabled: true })
    setGuestRooms.mockResolvedValue(false)
    await open()
    const sub = await screen.findByRole("switch", { name: "Personal meeting rooms" })
    await act(async () => fireEvent.click(sub))
    expect(setGuestRooms).toHaveBeenCalledWith(false)
    expect(setGuestAccess).not.toHaveBeenCalled()
    expect(setGuestPublish).not.toHaveBeenCalled()
  })

  // Like its two siblings (settings: every change that ticks offers itself
  // back), the saved change is offered back, and Undo saves the old value.
  it("offer a saved change back, and Undo turns them on again", async () => {
    listGuestGrants.mockResolvedValue([])
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true, guest_rooms_enabled: true })
    setGuestRooms.mockImplementation(async (on: boolean) => on)
    await open()
    await act(async () => fireEvent.click(await screen.findByRole("switch", { name: "Personal meeting rooms" })))
    const offer = await waitFor(() => {
      const offered = toast.mock.calls.map(([t]) => t).find((t) => t.action)
      expect(offered?.title).toBe("Personal meeting rooms: Off")
      return offered
    })
    await act(async () => offer.action.props.onClick())
    expect(setGuestRooms.mock.calls.map(([on]) => on)).toEqual([false, true])
  })

  // HU13: a call's invite is named as one, with its maker, never as its raw type.
  it("lists a call's invite as a call invite, with whose it is", async () => {
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true })
    listGuestGrants.mockResolvedValue([{ ...grant("g9", "call"), capability: "join", created_by_name: "Maya Chen", expires_at: new Date(Date.now() + 3600_000).toISOString() }])
    await open()
    expect(await screen.findByText("Maya Chen's call invite")).toBeInTheDocument()
    expect(screen.queryByText("call")).toBeNull()
  })

  it("lists a room's link as its owner's room, at its address, with no end", async () => {
    getWorkspaceSettings.mockResolvedValue({ guest_access_enabled: true })
    listGuestGrants.mockResolvedValue([
      { ...grant("g1", "meeting"), capability: "join", slug: "maya-chen", created_by_name: "Maya Chen" },
      { ...grant("g3", "meeting"), capability: "join", slug: "gone" },
      { ...grant("g4", "meeting"), capability: "join", slug: "alexandria-montgomery-fitzgerald", created_by_name: "Alexandria Montgomery-Fitzgerald" },
      grant("g2", "meeting"),
    ])
    await open()
    // The words its guests see, so a column of rooms says whose each is.
    expect(await screen.findByText("Maya Chen's room")).toBeInTheDocument()
    // Its address under it; a room never expires, so the row doesn't say so
    // and the address keeps its room on a phone.
    expect(screen.getByText("/r/maya-chen")).toBeInTheDocument()
    // A room whose owner has gone is still a room.
    expect(screen.getByText("Personal room")).toBeInTheDocument()
    expect(screen.getByText("/r/gone")).toBeInTheDocument()
    expect(screen.getAllByText("Doesn't expire")).toHaveLength(1)
    // On a phone a long name wraps to two lines before it's cut, and a long
    // address is cut in its middle, so its start and its end both show.
    expect(screen.getByText("Alexandria Montgomery-Fitzgerald's room").className).toContain("line-clamp-2")
    const address = [...document.querySelectorAll("[data-room-address]")].find((el) => el.textContent === "/r/alexandria-montgomery-fitzgerald")
    const cut = address?.querySelector("[data-middle-name]")
    expect(cut?.lastElementChild?.textContent).toBe("gerald")
    expect(cut?.lastElementChild?.className).toContain("shrink-0")
    // A one-call link to a meeting stays a meeting.
    expect(screen.getByText("Meeting")).toBeInTheDocument()
  })
})
