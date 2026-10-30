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
import { GUEST_HUE } from "./guestUi"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

describe("sharing a project with a client", () => {
  afterEach(() => cleanup())

  it("lets the client comment and approve unless told otherwise, and says approvals need it", async () => {
    createGuestLink.mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    expect(screen.getByText("Approving tasks and asking for changes need “Can see and comment”.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("project", "p1", 24 * 14, "comment", false)
  })

  // PTC-60: the share dialog's preview lists what a client sees; a paragraph
  // under it said it all again.
  it("says nothing the share dialog's preview says already, while a channel's link still explains itself", () => {
    const { unmount } = render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    expect(screen.queryByText(/A client follows this project/)).toBeNull()
    unmount()
    render(<GuestLinkSection resourceType="channel" resourceId="c1" canShare embedded />)
    expect(screen.getByText(/Invite someone from another company/)).toBeInTheDocument()
  })

  // Integration review, 12 Oct: on a phone the two menus kept their words'
  // width side by side and pushed Create link out past the share sheet's edge
  // (shot at 390 once the sheet opened at all, work P0).
  it("on a phone gives Create link a row of its own under the menus, which shrink before they push it out", () => {
    render(<GuestLinkSection resourceType="project" resourceId="p1" canShare embedded />)
    const row = document.querySelector("[data-link-options]")!
    expect(row.className).toMatch(/(^| )flex-wrap( |$)/)
    expect(row.className).toMatch(/(^| )sm:flex-nowrap( |$)/)
    for (const name of ["Link expires", "Permission"]) {
      const field = screen.getByRole("combobox", { name }).parentElement!
      expect(field.className).toMatch(/(^| )min-w-0( |$)/)
    }
    const create = screen.getByRole("button", { name: "Create link" })
    expect(create.className).toMatch(/(^| )max-sm:w-full( |$)/)
    expect(create.className).toMatch(/(^| )max-sm:h-11( |$)/)
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

describe("the way in to sharing, in a share dialog", () => {
  afterEach(() => cleanup())

  it("puts its globe on a tile in the hue the shared page will wear", () => {
    render(<GuestLinkSection resourceType="doc" resourceId="d1" canShare />)
    const open = screen.getByRole("button", { name: /Create an external link/ })
    const tile = open.querySelector(`span.${HUE_CLASS[GUEST_HUE]}`)
    expect(tile).not.toBeNull()
    expect(open.querySelector(".rounded-full")).toBeNull()
  })
})

describe("anyone with the link, as the share dialog's card (D19)", () => {
  afterEach(() => {
    cleanup()
    live.links = undefined
    confirm.mockReset()
    turnOffGuestLink.mockReset()
  })

  it("is a switch on a card with the globe in neutral ink, Off until turned on, and says a doc can be published once it's on", () => {
    render(<GuestLinkSection card resourceType="doc" resourceId="d1" canShare />)
    const sw = screen.getByRole("switch", { name: "Anyone with the link" })
    expect(sw.getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("Off · Turn on to share a link or publish it as a web page")).toBeInTheDocument()
    const tile = document.querySelector('[data-access-tile="link"]')!
    expect(tile.className).toMatch(/bg-hover/)
    expect(tile.querySelector(`.${HUE_CLASS.moss}`)).toBeNull()
  })

  it("says Off alone where nothing can be published", () => {
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    expect(screen.getByText("Off")).toBeInTheDocument()
  })

  it("turning on opens the options and Create link makes a 30-day read-only link", async () => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection card resourceType="doc" resourceId="d1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("doc", "d1", 24 * 30, "view", false)
    expect(screen.getByRole("textbox", { name: "Guest link" })).toHaveValue("https://acme.test/guest/p/tok")
  })

  it("says what a live link allows, and asks before switching it off", async () => {
    live.links = { data: [{ id: "l1", capability: "comment", expires_at: "2026-11-09T09:00:00Z", created_at: "2026-10-01T09:00:00Z", mine: true }] }
    render(<GuestLinkSection card resourceType="doc" resourceId="d1" canShare />)
    expect(screen.getByText("On · Can comment · expires 9 Nov")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    const asked = confirm.mock.calls[0][0]
    expect(asked.title).toBe("Turn off this link?")
    expect(asked.description).toBe("Anyone using it loses access now.")
    expect(turnOffGuestLink).not.toHaveBeenCalled()
    await act(async () => asked.onConfirm())
    expect(turnOffGuestLink).toHaveBeenCalledWith("l1")
  })
})
