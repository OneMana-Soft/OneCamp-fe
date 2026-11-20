import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const createGuestLink = vi.fn()
const getGuestCollabSession = vi.fn()
vi.mock("@/services/guestService", () => ({
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  getGuestCollabSession: (...args: unknown[]) => getGuestCollabSession(...args),
  guestCollabToken: vi.fn(),
  guestResourceLink: () => "https://acme.test/guest/b/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("next/dynamic", () => ({ default: () => () => <div data-viewer="" /> }))

import { GuestLinkSection } from "./GuestLinkSection"
import { BoardEmbedRow } from "./BoardEmbedRow"
import { embedCode } from "@/lib/embeds/embedCode"
import BoardEmbedPage from "@/app/guest/b/[token]/embed/page"

describe("a board's embed code, with its new link (miro-34)", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()
  afterEach(() => {
    cleanup()
    writeText.mockReset()
    Reflect.deleteProperty(navigator, "clipboard")
  })
  // The board's share card, as components/dialog/boardShareDialog draws it.
  const make = async (name?: string) => {
    createGuestLink.mockReset().mockResolvedValue({ token: "tok" })
    render(<GuestLinkSection card resourceType="board" resourceId="r1" canShare extra={(link, password) => <BoardEmbedRow link={link} name={name} password={password} />} />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Anyone with the link" })))
  }

  it("says before the link is made that a new one brings the embed code, and copies the code once it is", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    writeText.mockResolvedValue(undefined)
    await make(" Roadmap ")
    expect(screen.getByText("A new link also gives the code to embed this board in a website.")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(screen.queryByText("A new link also gives the code to embed this board in a website.")).toBeNull()
    expect(screen.getByText("Copy the link or the embed code now: neither is shown again.")).toBeInTheDocument()
    expect(screen.queryByText("Copy it now: it won't be shown again.")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy embed code" })))
    expect(writeText).toHaveBeenCalledWith(embedCode("https://acme.test/guest/b/tok", "Roadmap"))
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Embed code" })).toBeNull()
  })

  it("shows the code to select by hand where the clipboard is blocked, titled for the board when it has no name", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    writeText.mockRejectedValue(new Error("blocked"))
    await make()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy embed code" })))
    expect(screen.getByRole("textbox", { name: "Embed code" })).toHaveValue(embedCode("https://acme.test/guest/b/tok", "Shared board"))
  })

  it("offers no embed code for a link with a password, and says why, before and after it is made", async () => {
    await make("Roadmap")
    fireEvent.click(await screen.findByRole("button", { name: "Add a password" }))
    fireEvent.change(screen.getByLabelText("Link password"), { target: { value: "open-sesame" } })
    const why = "A board with a password can't be embedded. Share the link instead."
    expect(screen.getByText(why)).toBeInTheDocument()
    expect(screen.queryByText("A new link also gives the code to embed this board in a website.")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create link" })))
    expect(createGuestLink).toHaveBeenCalledWith("board", "r1", 24 * 30, "view", false, "open-sesame")
    expect(screen.getByText(why)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Copy embed code" })).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Embed code" })).toBeNull()
    expect(screen.getByText("Copy it now: it won't be shown again.")).toBeInTheDocument()
  })
})

describe("a board's embed, framed on another site (miro-34)", () => {
  afterEach(() => {
    cleanup()
    getGuestCollabSession.mockReset()
  })
  const frame = () =>
    act(async () => {
      render(
        <Suspense fallback={null}>
          <BoardEmbedPage params={Promise.resolve({ token: "tok/1" })} />
        </Suspense>,
      )
    })

  it("says a board has a password when its link asks for one, and opens the link's own page in a tab of its own", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: false, status: 401, msg: "This link needs its password.", code: "password_needed" })
    await frame()
    expect(await screen.findByRole("heading", { name: "This board has a password", level: 1 })).toBeInTheDocument()
    const open = screen.getByRole("link", { name: /Open the board/ })
    expect(open).toHaveAttribute("href", "/guest/b/tok%2F1")
    expect(open).toHaveAttribute("target", "_blank")
    expect(open.getAttribute("rel")).toMatch(/\bnoopener\b/)
    expect(screen.queryByText("The link may have expired or been turned off.")).toBeNull()
    expect(getGuestCollabSession).toHaveBeenCalledTimes(1)
  })

  it("opens a live link read only, its role named as the owner's picker names it", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: true, data: { collab_token: "c", document_name: "board:b1", resource_type: "board", resource_id: "b1", capability: "view", title: "Kickoff" } })
    await frame()
    expect(await screen.findByText("Can view")).toBeInTheDocument()
    expect(screen.queryByText("Read only")).toBeNull()
  })

  it("still says a link turned off is gone, with no way on", async () => {
    getGuestCollabSession.mockResolvedValue({ ok: false, status: 404, msg: "This link was turned off.", code: "not_found" })
    await frame()
    expect(await screen.findByText("The link may have expired or been turned off.")).toBeInTheDocument()
    expect(screen.queryByText("This board has a password")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
