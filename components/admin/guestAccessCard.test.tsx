import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GuestGrant } from "@/services/guestService"

const setGuestAccess = vi.fn()
const setGuestPublish = vi.fn()
const listGuestGrants = vi.fn()
vi.mock("@/services/guestService", () => ({
  setGuestAccess: (on: boolean) => setGuestAccess(on),
  setGuestPublish: (on: boolean) => setGuestPublish(on),
  listGuestGrants: () => listGuestGrants(),
  revokeGuestGrant: vi.fn(),
}))
const getWorkspaceSettings = vi.hoisted(() => vi.fn(() => Promise.resolve({ guest_access_enabled: false } as unknown)))
// The setting is read through the one shared SWR key (useWorkspaceSettings);
// the request it makes answers from getWorkspaceSettings.
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: async () => ({ data: { data: await getWorkspaceSettings() } }), post: vi.fn() },
  OWN_ERRORS: {},
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
