import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GuestDocComment } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

// A guest's comment on a shared doc used to fail into a toast, and nothing
// under /guest mounts a toaster: a guest who forgot their name, or whose
// comment the server refused, saw the button come back and nothing else.

type Listing = { capability: "view" | "comment"; comments: GuestDocComment[] }
const listGuestDocComments = vi.fn<(token: string) => Promise<PublicResult<Listing>>>()
const createGuestDocComment = vi.fn<(token: string, name: string, body: string) => Promise<PublicResult<GuestDocComment>>>()
vi.mock("@/services/guestService", () => ({
  listGuestDocComments: (token: string) => listGuestDocComments(token),
  createGuestDocComment: (token: string, name: string, body: string) => createGuestDocComment(token, name, body),
}))

import { GuestDocComments } from "./GuestDocComments"

const TOKEN = "tok-abcdefghijklmnop"
const comment: GuestDocComment = { id: "c1", guest_name: "Jordan Ellis", body: "Footer wording, please.", created_at: "2026-10-09T10:00:00Z" }

async function open(capability: "view" | "comment" = "comment", comments: GuestDocComment[] = []) {
  listGuestDocComments.mockResolvedValue({ ok: true, data: { capability, comments } })
  await act(async () => {
    render(<GuestDocComments token={TOKEN} />)
  })
}

const write = (text: string) => fireEvent.change(screen.getByLabelText("Comment"), { target: { value: text } })
const send = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Comment" })))

describe("a guest commenting on a shared doc", () => {
  beforeEach(() => {
    localStorage.clear()
    createGuestDocComment.mockReset()
  })
  afterEach(() => cleanup())

  it("labels its fields where they can be seen", async () => {
    await open()
    expect(screen.getByLabelText("Your name")).toHaveAttribute("autocomplete", "name")
    expect(screen.getByLabelText("Comment").tagName).toBe("TEXTAREA")
  })

  it("asks for a name under the name field, and puts the cursor there", async () => {
    await open()
    write("Looks good")
    await send()
    const nameBox = screen.getByLabelText("Your name")
    expect(nameBox).toHaveAttribute("aria-invalid", "true")
    expect(nameBox).toHaveFocus()
    expect(screen.getByText("Add your name first, so the team knows who wrote this.")).toBeInTheDocument()
    expect(createGuestDocComment).not.toHaveBeenCalled()
  })

  it("says why a comment didn't send, under the box, and keeps it", async () => {
    createGuestDocComment.mockResolvedValue({ ok: false, status: 403, msg: "This link is view only." })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    write("Looks good")
    await send()
    expect(screen.getByRole("alert")).toHaveTextContent("This link is view only.")
    expect(screen.getByLabelText("Comment")).toHaveValue("Looks good")
  })

  it("says a server that can't be reached is worth another try", async () => {
    createGuestDocComment.mockResolvedValue({ ok: false, status: 0, msg: "" })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    write("Looks good")
    await send()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the server. Try again in a moment.")
  })

  it("remembers the name for this link, as the other guest pages do", async () => {
    createGuestDocComment.mockResolvedValue({ ok: true, data: { ...comment, id: "c2", guest_name: "Jordan", body: "Looks good" } })
    await open()
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Jordan" } })
    write("Looks good")
    await send()
    expect(localStorage.getItem(`oc_guest_name_${TOKEN.slice(0, 12)}`)).toBe("Jordan")
    expect(localStorage.getItem("oc_guest_name")).toBeNull()
    cleanup()
    await open()
    expect(screen.getByLabelText("Your name")).toHaveValue("Jordan")
  })

  it("lists comments as rows, not boxed cards", async () => {
    await open("view", [comment])
    const row = screen.getByText("Footer wording, please.").closest("li")!
    expect(row.className).not.toMatch(/\bborder\b|rounded-lg/)
    // The count is a number beside the heading, not a pill.
    expect(screen.getByText("1").className).not.toMatch(/rounded-full/)
  })
})
