import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const createGuestLink = vi.fn()
const turnOffGuestLink = vi.fn()
vi.mock("@/services/guestService", () => ({
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  guestResourceLink: () => "https://acme.test/guest/p/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: (...args: unknown[]) => turnOffGuestLink(...args),
}))
const live = vi.hoisted(() => ({ links: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: live.links, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
type ConfirmOpts = { title: string; description: string; confirmText?: string; destructive?: boolean; onConfirm: () => void }
const confirm = vi.fn<(o: ConfirmOpts) => void>()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))

import { GuestLinkSection } from "./GuestLinkSection"

describe("sharing a project with a client", () => {
  afterEach(() => cleanup())

  it("lets the client comment and approve unless told otherwise, and says approvals need it", async () => {
    createGuestLink.mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    expect(screen.getByText("Approving tasks and asking for changes need “Can see and comment”.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("project", "p1", 24 * 14, "comment", false)
  })

  it("still starts a doc's link read only", async () => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection resourceType="doc" resourceId="d1" canShare embedded />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("doc", "d1", 24 * 14, "view", false)
  })
})

describe("the links a resource already has", () => {
  afterEach(() => {
    cleanup()
    live.links = undefined
    confirm.mockReset()
    turnOffGuestLink.mockReset()
  })

  it("names the expiry and permission pickers by their labels", () => {
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    expect(screen.getByRole("combobox", { name: "Link expires" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Permission" })).toBeInTheDocument()
  })

  it("asks before turning a link off, and says whose access stops", async () => {
    live.links = { data: [{ id: "l1", capability: "comment", expires_at: null, created_at: "2026-10-01T09:00:00Z", mine: true }] }
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Turn off" })))
    expect(turnOffGuestLink).not.toHaveBeenCalled()
    const asked = confirm.mock.calls[0][0]
    expect(asked.title).toBe("Turn off the “Can see and comment” link?")
    expect(asked.description).toMatch(/Anyone using it loses access at once/)
    expect(asked.destructive).toBe(true)
    await act(async () => asked.onConfirm())
    expect(turnOffGuestLink).toHaveBeenCalledWith("l1")
  })
})
