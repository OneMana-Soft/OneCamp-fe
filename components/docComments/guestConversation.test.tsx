import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { afterEach, describe, expect, it, vi } from "vitest"

// The doc's conversation with its guests, for its team (docs C5-2).

const answers = new Map<string, unknown>()
const mutate = vi.fn(async () => undefined)
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: answers.get(key), isLoading: false, isError: undefined, mutate }),
}))
const post = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ data: { data: {} } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const media = { sheet: false }
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => media.sheet }))

import { GuestConversation } from "./GuestConversation"
import { docVerdictKey, guestThreadKey } from "@/lib/guestThread/guestThread"

const DOC = "d1"
const at = new Date().toISOString()
function answer(comments: unknown[], can: { reply?: boolean; moderate?: boolean } = {}, review: unknown = null) {
  answers.set(guestThreadKey(DOC), { data: { comments, can_reply: !!can.reply, can_moderate: !!can.moderate } })
  answers.set(docVerdictKey(DOC), { data: { review } })
}
const guest = { id: "g1", guest_name: "Dana", body: "Is section 2 final?", created_at: at, author_id: "guest-a" }
const reply = { id: "r1", guest_name: "Maya from Acme", body: "Yes.", created_at: at, parent_id: "g1", from_team: true, author_id: "u-maya" }

describe("a doc's conversation with its guests", () => {
  afterEach(() => {
    cleanup()
    answers.clear()
    post.mockClear()
    confirm.mockReset()
    media.sheet = false
  })

  it("is nothing at all when no guest has said anything", () => {
    answer([])
    const { container } = render(<GuestConversation docId={DOC} />)
    expect(container.innerHTML).toBe("")
  })

  it("shows a guest's comment and the team's reply, marked visible to the guest", () => {
    answer([guest, reply])
    render(<GuestConversation docId={DOC} />)
    expect(screen.getByText("Is section 2 final?")).toBeTruthy()
    const team = document.querySelector('[data-guest-comment="team"]')!
    expect(team.textContent).toContain("Visible to guest")
    // The guest wears the app's one Guest chip, the same as on the guest's own page.
    expect(document.querySelector('[data-guest-comment="guest"] [data-principal-tag="guest"]')).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull()
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull()
  })

  it("replies where the guest sees it, for someone who may comment", async () => {
    answer([guest], { reply: true })
    render(<GuestConversation docId={DOC} />)
    fireEvent.click(screen.getByRole("button", { name: "Reply" }))
    fireEvent.change(screen.getByLabelText("Reply to Dana, visible to them"), { target: { value: "Yes, final." } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reply to guest" })))
    expect(post).toHaveBeenCalledWith("/doc/guest-thread/reply", { doc_uuid: DOC, parent_id: "g1", body: "Yes, final." }, OWN_ERRORS)
  })

  it("brings a reply box opened low in a long thread into view, with its buttons", () => {
    const seen = vi.spyOn(Element.prototype, "scrollIntoView")
    answer([guest], { reply: true })
    render(<GuestConversation docId={DOC} />)
    fireEvent.click(screen.getByRole("button", { name: "Reply" }))
    const box = screen.getByLabelText("Reply to Dana, visible to them").closest("form")
    expect(box?.contains(screen.getByRole("button", { name: "Reply to guest" }))).toBe(true)
    expect(seen.mock.contexts).toContain(box)
    expect(seen).toHaveBeenCalledWith({ block: "nearest" })
    seen.mockRestore()
  })

  it("keeps Remove in a quiet menu beside Reply, in danger ink, and asks before removing", async () => {
    answer([guest], { moderate: true, reply: true })
    render(<GuestConversation docId={DOC} />)
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull()
    const more = await screen.findByRole("button", { name: "More for Dana's comment" })
    expect(more.previousElementSibling?.textContent).toBe("Reply")
    fireEvent.keyDown(more, { key: "Enter" })
    const item = await screen.findByRole("menuitem", { name: "Remove" })
    expect(item.className).toMatch(/text-danger-ink/)
    fireEvent.click(item)
    const asked = confirm.mock.calls[0][0] as { title: string; confirmText: string; onConfirm(): Promise<void> }
    expect(asked.title).toBe("Remove Dana's comment?")
    expect(asked.confirmText).toBe("Remove comment")
    expect(post).not.toHaveBeenCalled()
    await act(async () => asked.onConfirm())
    expect(post).toHaveBeenCalledWith("/doc/guest-thread/remove", { doc_uuid: DOC, comment_id: "g1" }, OWN_ERRORS)
  })

  it("offers Remove in a sheet on a phone, still asking first", async () => {
    media.sheet = true
    answer([guest], { moderate: true })
    render(<GuestConversation docId={DOC} />)
    fireEvent.click(await screen.findByRole("button", { name: "More for Dana's comment" }))
    const sheet = document.querySelector("[data-guest-comment-sheet]")!
    const remove = Array.from(sheet.querySelectorAll("button")).find((b) => b.textContent === "Remove")!
    expect(remove.className).toMatch(/text-danger-ink/)
    fireEvent.click(remove)
    expect((confirm.mock.calls[0][0] as { title: string }).title).toBe("Remove Dana's comment?")
  })

  it("shows the client's latest verdict at its top", () => {
    answer([], {}, { decision: "changes", name: "Dana", note: "Move launch to May", created_at: at })
    render(<GuestConversation docId={DOC} />)
    const v = document.querySelector('[data-doc-verdict="changes"]')!
    expect(v.textContent).toContain("Dana asked for changes")
    expect(v.textContent).toContain("Move launch to May")
  })
})

