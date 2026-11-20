import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

const createGuestLink = vi.fn()
const turnOffGuestLink = vi.fn()
vi.mock("@/services/guestService", () => ({
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  guestResourceLink: () => "https://acme.test/guest/p/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: (...args: unknown[]) => turnOffGuestLink(...args),
}))
vi.mock("@/services/guestBoardLinks", () => ({ changeGuestLink: (...args: unknown[]) => changeGuestLink(...args) }))
const changeGuestLink = vi.fn()
pinTestClock()
const live = vi.hoisted(() => ({ links: undefined as unknown, mutate: (() => {}) as (...a: unknown[]) => unknown, toast: (() => {}) as (...a: unknown[]) => unknown }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: live.links, mutate: live.mutate }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: live.toast }) }))
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


describe("a kind's own row beside its link, as the card's extra (a board's embed code)", () => {
  afterEach(() => cleanup())
  type Extra = Parameters<typeof GuestLinkSection>[0]["extra"]
  const turnOn = async (extra?: Extra) => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection card resourceType="board" resourceId="r1" canShare extra={extra} />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
  }

  it("draws the row with no link before one is made, then with the new link in place of the copy hint", async () => {
    const extra = vi.fn((link: string) => <p>{link ? `row for ${link}` : "row before a link"}</p>)
    await turnOn(extra)
    expect(screen.getByText("row before a link")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(screen.getByText("row for https://acme.test/guest/p/tok")).toBeInTheDocument()
    expect(screen.queryByText("row before a link")).toBeNull()
    expect(screen.queryByText("Copy it now: it won't be shown again.")).toBeNull()
    expect(extra.mock.calls.map(([link]) => link)).toEqual(expect.arrayContaining(["", "https://acme.test/guest/p/tok"]))
  })

  it("keeps the copy hint, and offers no embed code, without one", async () => {
    await turnOn()
    expect(screen.queryByText(/embed/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(screen.getByText("Copy it now: it won't be shown again.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy embed code" })).toBeNull()
  })
})

// miro-33: a board's link has a role (view, comment, edit), an optional password and an end, and its
// owner or a co-owner changes or turns off each live one. The server keeps the password; the card says set or not.
describe("a board's links, with a role, a password and an end (miro-33)", () => {
  const press = (el: Element) => fireEvent.keyDown(el, { key: "Enter" })
  const items = async () => (await screen.findAllByRole("menuitem")).map((m) => m.textContent?.trim())
  const waitForChange = () =>
    waitFor(() => {
      const row = document.querySelector<HTMLElement>("[data-link-change]")
      if (!row) throw new Error("the link's change row hasn't come yet")
      return row
    })
  const LINK = { id: "g1", capability: "comment", expires_at: "2099-01-01T00:00:00Z", created_at: "2026-11-13T00:00:00Z", mine: true, has_password: true }
  afterEach(() => {
    cleanup()
    live.links = undefined
    createGuestLink.mockReset()
    changeGuestLink.mockReset()
  })

  it("offers view, comment and edit, and makes a comment link with a password", async () => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    press(screen.getByRole("button", { name: "Permission: Can view" }))
    expect(await items()).toEqual(["Can view", "Can comment", "Can edit"])
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Can comment" })))
    // The password is the board's own piece (boardLinkControls): it comes as its code does.
    fireEvent.click(await screen.findByRole("button", { name: "Add a password" }))
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "abc" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).not.toHaveBeenCalled()
    expect(screen.getByText("A password is 6 to 128 characters.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "open-sesame" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("board", "b1", 24 * 30, "comment", false, "open-sesame")
  })

  it("says each live link's role and whether it has a password, never the password", () => {
    live.links = { data: [LINK, { ...LINK, id: "g2", capability: "edit", has_password: false, expires_at: null }] }
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    expect(screen.getByText(/Can comment/, { selector: "[data-link-row] *" }).closest("[data-link-row]")?.textContent).toMatch(/Password set/)
    expect(screen.getByText(/Can edit/, { selector: "[data-link-row] *" }).closest("[data-link-row]")?.textContent).toMatch(/No password/)
  })

  it("changes a link's role and sends only what changed", async () => {
    live.links = { data: [LINK] }
    changeGuestLink.mockResolvedValue({ ...LINK, capability: "edit" })
    const mutate = vi.fn()
    live.mutate = mutate
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    fireEvent.click(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    press(await screen.findByRole("button", { name: "Permission: Can comment" }))
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Can edit" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })))
    expect(changeGuestLink).toHaveBeenCalledWith("g1", { capability: "edit" })
    expect(mutate).toHaveBeenCalled()
  })

  it("takes the password off, or sets a new one by the docs' rule", async () => {
    live.links = { data: [LINK] }
    changeGuestLink.mockResolvedValue({ ...LINK, has_password: false })
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    fireEvent.click(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    fireEvent.click(await screen.findByRole("button", { name: "Remove the password" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })))
    expect(changeGuestLink).toHaveBeenCalledWith("g1", { password: "" })
  })

  it("shows a lost race in the server's words, then reads the link again", async () => {
    live.links = { data: [LINK] }
    const said = "Someone changed this link just now. Look at it again, then make your change."
    changeGuestLink.mockRejectedValue(Object.assign(new Error("Request failed with status code 409"), { isAxiosError: true, response: { status: 409, data: { msg: said } } }))
    const mutate = vi.fn()
    const toast = vi.fn()
    live.mutate = mutate
    live.toast = toast
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    fireEvent.click(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    const expiry = within(await waitForChange()).getByRole("button", { name: /^Link expires:/ })
    press(expiry)
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Does not expire" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })))
    expect(changeGuestLink).toHaveBeenCalledWith("g1", { never_expires: true })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: said }))
    expect(mutate).toHaveBeenCalled()
  })

  it("asks for the password before Create link, on screen and in tab order: the action comes last", async () => {
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    const add = await screen.findByRole("button", { name: "Add a password" })
    const create = screen.getByRole("button", { name: "Create link" })
    expect(add.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(add)
    expect(screen.getByLabelText("Link password").compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("takes a refused password's words away once the owner types again, making a link or changing one", async () => {
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    fireEvent.click(await screen.findByRole("button", { name: "Add a password" }))
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "abc" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(screen.getByRole("alert")).toHaveTextContent("A password is 6 to 128 characters.")
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "open-sesame" } })
    expect(screen.queryByRole("alert")).toBeNull()
    cleanup()

    live.links = { data: [LINK] }
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    fireEvent.click(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    fireEvent.click(await screen.findByRole("button", { name: "New password" }))
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "abc" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save changes" })))
    expect(changeGuestLink).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("A password is 6 to 128 characters.")
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "open-sesame" } })
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("draws a live link on two lines, its role and its controls, then its password, its end and whose, none cut short", () => {
    live.links = { data: [LINK, { ...LINK, id: "g2", capability: "view", has_password: false, expires_at: null, mine: false }] }
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    const [first, second] = Array.from(document.querySelectorAll<HTMLElement>("[data-link-row]"))
    const facts = (row: HTMLElement) => row.querySelector("[data-link-facts]")?.textContent
    expect(facts(first)).toMatch(/^Password set · ends in .+ · yours$/)
    expect(facts(second)).toBe("No password · doesn't expire")
    expect(first.textContent).toMatch(/^Can comment/)
    expect(first.querySelectorAll(".truncate")).toHaveLength(0)
    expect(first.className).not.toMatch(/\bh-9\b/)
  })

  it("reaches 44px under a finger on every control the link's role, end and password add", async () => {
    live.links = { data: [LINK] }
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    const reach = (el: Element) => expect(el.className, el.textContent ?? "").toMatch(/\bextend-touch-target\b/)
    reach(screen.getByRole("button", { name: "Turn off" }))
    reach(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    fireEvent.click(screen.getByRole("button", { name: "Change the “Can comment” link" }))
    reach(await screen.findByRole("button", { name: "New password" }))
    reach(screen.getByRole("button", { name: "Remove the password" }))
    reach(screen.getByRole("button", { name: "Cancel" }))
    reach(screen.getByRole("button", { name: "Save changes" }))
    fireEvent.click(screen.getByRole("button", { name: "New password" }))
    // An input draws no ::after, so the field's own box grows under a finger instead.
    expect(screen.getByLabelText("Link password").className).toMatch(/\bpointer-coarse:h-11\b/)
    cleanup()
    live.links = undefined
    render(<GuestLinkSection card resourceType="board" resourceId="b1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    reach(await screen.findByRole("button", { name: "Add a password" }))
  })

  it("keeps a doc's and a table's links as they were: no edit role, no password on the card", async () => {
    render(<GuestLinkSection card resourceType="doc" resourceId="d1" canShare />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
    expect(screen.queryByRole("button", { name: "Add a password" })).toBeNull()
    press(screen.getByRole("button", { name: "Permission: Can view" }))
    expect(await items()).toEqual(["Can view", "Can comment"])
  })
})
