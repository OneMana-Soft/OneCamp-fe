import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { EditProposal } from "@/lib/proposals/types"

// Every suggestion on a doc, beside it: who suggested what in a few words,
// open ones first; accept and decline (on the server) for whoever may decide,
// take back for its author; decided ones say what became of them.

let listed: EditProposal[] = []
let failed = false
let level = { doc_edit_access: 1 } as Record<string, number>
const decide = vi.fn()
const withdraw = vi.fn()
const reread = vi.fn()
vi.mock("@/services/proposalService", () => ({
  useDocProposals: () => ({ proposals: listed, isError: failed, isLoading: false, mutate: reread }),
  decideProposal: (...a: unknown[]) => decide(...a),
  withdrawProposal: (...a: unknown[]) => withdraw(...a),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }) }))
vi.mock("@/components/docEditor/chrome/useDoc", () => ({ useDoc: () => level }))

const { default: SuggestionsList } = await import("./SuggestionsList")

afterEach(() => {
  cleanup()
  decide.mockReset()
  withdraw.mockReset()
  reread.mockReset()
  listed = []
  failed = false
  level = { doc_edit_access: 1 }
})

const p = (id: string, more: Partial<EditProposal> = {}): EditProposal =>
  ({
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    anchor: { kind: "none" },
    base_hash: "",
    proposed: [],
    hunks: [{ id: "h1", op: "replace", level: "inline", path: [0], from: 0, to: 6, before: [{ type: "text", text: "Friday" }], after: [{ type: "text", text: "Monday" }] }],
    author_kind: "person",
    author_uuid: "maya",
    author_name: "Maya Patel",
    status: "open",
    created_at: new Date().toISOString(),
    ...more,
  }) as EditProposal

describe("the doc's suggestions", () => {
  it("says who suggested what, and lets whoever may decide accept or decline it on the server", async () => {
    listed = [p("k1", { note: "Friday is a holiday" })]
    render(<SuggestionsList docId="d1" />)
    const row = document.querySelector('[data-suggestion="k1"]')!
    expect(row.textContent).toContain("Suggested by Maya Patel")
    expect(row.textContent).toContain("“Friday” to “Monday”")
    expect(row.textContent).toContain("“Friday is a holiday”")
    decide.mockResolvedValue({})
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Accept" })))
    expect(decide).toHaveBeenCalledWith("k1", { accept: true, apply: "server" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Decline" })))
    expect(decide).toHaveBeenLastCalledWith("k1", { accept: false })
  })

  it("says busy on the choice being made, holds the row's other choice, and leaves the other rows free", async () => {
    listed = [p("k1"), p("k2")]
    let answer: (value: unknown) => void = () => {}
    decide.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    render(<SuggestionsList docId="d1" />)
    const [accept, otherAccept] = screen.getAllByRole("button", { name: "Accept" }) as HTMLButtonElement[]
    const [decline] = screen.getAllByRole("button", { name: "Decline" }) as HTMLButtonElement[]
    await act(async () => fireEvent.click(accept))
    expect(accept.getAttribute("aria-busy")).toBe("true")
    expect(accept.disabled).toBe(false)
    expect(decline.disabled).toBe(true)
    expect(otherAccept.disabled).toBe(false)
    expect(otherAccept.getAttribute("aria-busy")).toBeNull()
    // A second press while it runs asks nothing more.
    await act(async () => fireEvent.click(accept))
    expect(decide).toHaveBeenCalledTimes(1)
    await act(async () => answer({}))
    expect(accept.getAttribute("aria-busy")).toBeNull()
    expect(decline.disabled).toBe(false)
  })

  it("lets a commenter take back their own, and nothing more", async () => {
    level = { doc_comment_access: 1 }
    listed = [p("own", { author_uuid: "sam" }), p("other")]
    render(<SuggestionsList docId="d1" />)
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    const takeBack = screen.getAllByRole("button", { name: "Take back" })
    expect(takeBack).toHaveLength(1)
    withdraw.mockResolvedValue({})
    await act(async () => fireEvent.click(takeBack[0]))
    expect(withdraw).toHaveBeenCalledWith("own")
  })

  it("says what became of a decided one, and what went wrong with a refused decision", async () => {
    listed = [p("open"), p("done", { status: "accepted" })]
    render(<SuggestionsList docId="d1" />)
    expect(document.querySelector('[data-suggestion="done"]')!.textContent).toContain("Accepted")
    decide.mockRejectedValue({ response: { status: 409, data: { msg: "The text changed since this was suggested. Insert it below, or decline it." } } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Accept" })))
    expect(screen.getByRole("alert").textContent).toBe("The text changed since this was suggested. Insert it below, or decline it.")
  })

  it("says how to make one when there are none", () => {
    render(<SuggestionsList docId="d1" />)
    expect(document.querySelector("[data-suggestions-empty]")!.textContent).toContain("Suggest edit")
  })

  // The one place a failed read is told: the chip and the marks draw nothing,
  // and nothing toasts (suggestionsLoadQuiet.test.tsx).
  it("says in place when they didn't load, never as none, and Try again reads them again", () => {
    failed = true
    render(<SuggestionsList docId="d1" />)
    expect(screen.getByText("Couldn't load this doc's suggestions")).toBeTruthy()
    expect(document.querySelector("[data-suggestions-empty]")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reread).toHaveBeenCalledTimes(1)
  })
})
