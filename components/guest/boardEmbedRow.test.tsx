import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const createGuestLink = vi.fn()
vi.mock("@/services/guestService", () => ({
  createGuestLink: (...args: unknown[]) => createGuestLink(...args),
  guestResourceLink: () => "https://acme.test/guest/b/tok",
  resourceGuestLinksKey: () => "links",
  turnOffGuestLink: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { GuestLinkSection } from "./GuestLinkSection"
import { BoardEmbedRow } from "./BoardEmbedRow"
import { embedCode } from "@/lib/embeds/embedCode"

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
    render(<GuestLinkSection card resourceType="board" resourceId="r1" canShare extra={(link) => <BoardEmbedRow link={link} name={name} />} />)
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
})
