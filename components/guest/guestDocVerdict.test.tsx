import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GuestDocComment } from "@/services/guestService"
import type { PublicResult } from "@/services/publicApi"

// The client loop on a shared doc (docs C5-2): the team's replies under what
// they answer, and the client's verdict.

type Listing = { capability: "view" | "comment"; comments: GuestDocComment[] }
const listGuestDocComments = vi.fn<(token: string) => Promise<PublicResult<Listing>>>()
const reviewGuestDoc = vi.fn<(token: string, name: string, decision: string, note: string) => Promise<PublicResult<unknown>>>()
vi.mock("@/services/guestService", () => ({
  listGuestDocComments: (token: string) => listGuestDocComments(token),
  createGuestDocComment: vi.fn(),
}))
vi.mock("@/services/guestReview", () => ({
  reviewGuestDoc: (token: string, name: string, decision: string, note: string) => reviewGuestDoc(token, name, decision, note),
}))

import { GuestDocComments } from "./GuestDocComments"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const TOKEN = "tok-abcdefghijklmnop"
const ask: GuestDocComment = { id: "c1", guest_name: "Dana", body: "Is section 2 final?", created_at: "2026-10-09T10:00:00Z", author_id: "guest-a" }
const later: GuestDocComment = { id: "c2", guest_name: "Dana", body: "And the dates?", created_at: "2026-10-09T11:00:00Z", author_id: "guest-a" }
const answer: GuestDocComment = { id: "r1", guest_name: "Maya from Acme", body: "Yes, final.", created_at: "2026-10-09T12:00:00Z", parent_id: "c1", from_team: true }

async function open(capability: "view" | "comment", comments: GuestDocComment[]) {
  listGuestDocComments.mockResolvedValue({ ok: true, data: { capability, comments } })
  await act(async () => {
    render(<GuestDocComments token={TOKEN} />)
  })
}

describe("the client loop on a shared doc", () => {
  beforeEach(() => {
    localStorage.clear()
    reviewGuestDoc.mockReset()
  })
  afterEach(() => cleanup())

  it("shows the team's reply indented, named as the team, never tagged Guest", async () => {
    await open("comment", [ask, later, answer])
    const reply = document.querySelector("[data-guest-reply]")!
    expect(reply.textContent).toContain("Maya from Acme")
    expect(reply.textContent).not.toContain("Guest")
    expect(reply.className).toMatch(/ml-10/)
  })

  it("approves the doc as the guest, and says so", async () => {
    localStorage.setItem(`onecamp:guest-name:${TOKEN}`, "Dana")
    reviewGuestDoc.mockResolvedValue({ ok: true, data: { review: { decision: "approved" } } })
    await open("comment", [ask])
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve doc" })))
    expect(reviewGuestDoc).toHaveBeenCalledWith(TOKEN, "Dana", "approved", "")
    expect(screen.getByRole("status").textContent).toContain("approved this doc")
  })

  it("asks what should change before it sends changes", async () => {
    reviewGuestDoc.mockResolvedValue({ ok: true, data: { review: { decision: "changes" } } })
    await open("comment", [ask])
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } })
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }))
    expect((screen.getByRole("button", { name: "Send the changes" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: "Move launch to May" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send the changes" })))
    expect(reviewGuestDoc).toHaveBeenCalledWith(TOKEN, "Dana", "changes", "Move launch to May")
  })

  it("says a refused verdict between the note and the buttons, and brings it into view", async () => {
    const seen = vi.spyOn(Element.prototype, "scrollIntoView")
    reviewGuestDoc.mockResolvedValue({ ok: false, status: 0, msg: "" })
    await open("comment", [ask])
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } })
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }))
    const note = screen.getByLabelText("What should change?")
    fireEvent.change(note, { target: { value: "Move launch to May" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send the changes" })))
    const error = screen.getByRole("alert")
    const send = screen.getByRole("button", { name: "Send the changes" })
    expect(note.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(error.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(seen.mock.contexts).toContain(error)
    expect(seen).toHaveBeenCalledWith({ block: "nearest" })
    seen.mockRestore()
  })

  it("offers no verdict on a view-only link", async () => {
    await open("view", [ask])
    expect(screen.queryByRole("button", { name: "Approve doc" })).toBeNull()
  })
})
