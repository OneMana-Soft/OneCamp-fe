import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { GuestGrant } from "@/services/guestService"

const setGuestAccess = vi.fn()
const listGuestGrants = vi.fn()
vi.mock("@/services/guestService", () => ({
  setGuestAccess: (on: boolean) => setGuestAccess(on),
  listGuestGrants: () => listGuestGrants(),
  revokeGuestGrant: vi.fn(),
}))
const getWorkspaceSettings = vi.hoisted(() => vi.fn(() => Promise.resolve({ guest_access_enabled: false } as unknown)))
vi.mock("@/services/settingsService", () => ({ getWorkspaceSettings: () => getWorkspaceSettings() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import GuestAccessCard from "./GuestAccessCard"

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
    expect(screen.getByText("Guest links, paused while guest access is off")).toBeInTheDocument()
    expect(screen.getByText("Project")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2)
  })

  it("says how many links will work again before turning it on", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project"), grant("g2", "doc")])
    setGuestAccess.mockResolvedValue(true)
    await open()
    await act(async () => fireEvent.click(screen.getByRole("switch")))
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
    await act(async () => fireEvent.click(screen.getByRole("switch")))
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
    expect(screen.getByText("Couldn't load the guest access setting")).toBeInTheDocument()
    expect(screen.queryByRole("switch")).toBeNull()
    getWorkspaceSettings.mockImplementationOnce(() => Promise.resolve({ guest_access_enabled: true }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(screen.getByRole("switch", { name: "Allow guest links" }).getAttribute("aria-checked")).toBe("true")
  })

  it("names the switch, and heads the links in sentence case", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project")])
    await open()
    expect(screen.getByRole("switch", { name: "Allow guest links" })).toBeInTheDocument()
    const heading = screen.getByText("Guest links, paused while guest access is off")
    expect(heading.className).not.toMatch(/uppercase/)
    expect(screen.getByText("Can comment")).toBeInTheDocument()
  })

  it("says why revoking a link failed", async () => {
    listGuestGrants.mockResolvedValue([grant("g1", "project")])
    const revoke = (await import("@/services/guestService")).revokeGuestGrant as ReturnType<typeof vi.fn>
    revoke.mockRejectedValue({ response: { data: { msg: "That link was already revoked." } } })
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))
    await act(async () => confirm.mock.calls.at(-1)![0].onConfirm())
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't revoke the link",
      description: "That link was already revoked.",
      variant: "destructive",
    }))
  })
})
