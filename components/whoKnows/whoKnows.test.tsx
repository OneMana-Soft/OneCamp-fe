import { readFileSync } from "fs"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { whoKnowsKey } from "@/lib/whoKnows/key"
import { answerLabel, countsLine, evidenceHop, roleLabel, type WhoKnowsAnswer } from "@/lib/whoKnows/whoKnows"

/** What each key answers: data, an error, or still loading. isPrevious: the data is the last key's, kept on screen by SWR. */
type Answer = { data?: unknown; isError?: unknown; isLoading?: boolean; isPrevious?: boolean }
const answers = new Map<string, Answer>()
const asked: string[] = []
const mutate = vi.fn(() => Promise.resolve())
const put = vi.fn(() => Promise.resolve({ data: { data: { listed: false } } }))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (key) asked.push(key)
    const a = (key && answers.get(key)) || (key ? { isLoading: true } : {})
    return { data: a.data, isError: a.isError, isLoading: !!a.isLoading, isPrevious: !!a.isPrevious, mutate }
  },
}))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put: (...a: unknown[]) => put(...(a as [])) } }))
vi.mock("@/components/navigationBar/desktop/IntentLink", () => ({
  IntentLink: React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function L(p, ref) {
    return <a ref={ref} {...p} />
  }),
}))
vi.mock("@/components/message/chatFace", () => ({ ChatFace: ({ name }: { name: string }) => <span data-face="">{name[0]}</span> }))
type Toasted = { title?: string; action?: React.ReactElement<{ onClick: () => Promise<void> }> }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

import { WhoKnowsList } from "./WhoKnowsList"
import { WhoKnowsStrip } from "./WhoKnowsStrip"
import WhoKnowsSettingCard from "./WhoKnowsSettingCard"

afterEach(() => {
  cleanup()
  answers.clear()
  asked.length = 0
  put.mockClear()
  toast.mockReset()
})

const answer: WhoKnowsAnswer = {
  query: "budget",
  considered: 6,
  you_hidden: false,
  people: [
    {
      id: "u-cy",
      name: "Cy Okafor",
      score: 6,
      wrote: 1,
      created: 0,
      posted: 1,
      assigned: 0,
      commented: 0,
      evidence: [
        { kind: "doc", id: "d1", title: "Budget plan", role: "wrote" },
        { kind: "message", id: "m1", title: "The budget is in", role: "wrote", data: { channel_id: "c1", channel_name: "launch" } },
      ],
    },
    { id: "u-dee", name: "Dee Park", score: 2, wrote: 0, created: 0, posted: 0, assigned: 1, commented: 0, evidence: [{ kind: "task", id: "t1", title: "Close the budget", role: "assigned" }] },
    { id: "u-ben", name: "Ben Ito", score: 3, wrote: 0, created: 0, posted: 0, assigned: 0, commented: 3, evidence: [{ kind: "doc", id: "d1", title: "Budget plan", role: "commented" }] },
    { id: "u-eve", name: "Eve Ade", score: 1, wrote: 0, created: 1, posted: 0, assigned: 0, commented: 1, evidence: [] },
  ],
}
const STRIP = "/people/who-knows?q=budget&limit=3"
const refused = { response: { status: 403 } }
const signedOut = { response: { status: 401 } }
const failed = { response: { status: 503 } }
// The server's 400 for words it won't ask about (controllers/WhoKnows).
const badWords = { response: { status: 400, data: { msg: "Ask about something in 2 to 200 characters." } } }

describe("the who-knows module", () => {
  it("asks only about words worth asking, the words tidied", () => {
    expect(whoKnowsKey(" b ")).toBe("")
    expect(whoKnowsKey("  launch   budget ", 3)).toBe("/people/who-knows?q=launch+budget&limit=3")
  })
  it("says only what someone did, with the rows' verbs", () => {
    expect(countsLine({ wrote: 2, created: 1, posted: 1, assigned: 1, commented: 3 })).toBe("Wrote 2 · Created 1 · Posted 1 · Assigned 1 · Commented on 3")
    expect(countsLine({ commented: 1 })).toBe("Commented on 1")
  })
  it("words each item with a verb that fits its kind", () => {
    expect(roleLabel("wrote", "doc")).toBe("Wrote")
    expect(roleLabel("wrote", "task")).toBe("Created")
    expect(roleLabel("wrote", "message")).toBe("Posted")
    expect(roleLabel("assigned", "task")).toBe("Assigned")
    expect(roleLabel("commented", "message")).toBe("Commented on")
  })
  it("opens a message where it was posted", () => {
    expect(evidenceHop(answer.people[0].evidence[1])).toMatchObject({ kind: "message", data: { channel_id: "c1" } })
    expect(answerLabel(answer, "budget")).toBe("4 people for “budget”")
    expect(answerLabel({ ...answer, people: [] }, "budget")).toBe("No one yet for “budget”")
  })
})

describe("the full list", () => {
  const props = { words: "budget", onRetry: vi.fn(), retrying: false }
  it("names each person with what they did and the items that show it, each opening where it lives", () => {
    render(<WhoKnowsList {...props} answer={answer} error={undefined} loading={false} />)
    const cy = screen.getByRole("link", { name: "Cy Okafor, Wrote 1 · Posted 1" })
    expect(cy.getAttribute("href")).toBe("/app/user/u-cy")
    expect(screen.getByRole("link", { name: "Wrote Budget plan" }).getAttribute("href")).toBe("/app/doc/d1")
    expect(screen.getByRole("link", { name: "Posted The budget is in" }).getAttribute("href")).toBe("/app/channel/c1/m1")
    expect(screen.getByRole("link", { name: "Assigned Close the budget" }).getAttribute("href")).toBe("/app/task/t1")
    expect(screen.getByRole("list", { name: "What shows Ben Ito knows" })).toBeTruthy()
  })
  it("moves through rows with the arrow keys", () => {
    render(<WhoKnowsList {...props} answer={answer} error={undefined} loading={false} />)
    const cy = screen.getByRole("link", { name: "Cy Okafor, Wrote 1 · Posted 1" })
    cy.focus()
    fireEvent.keyDown(cy, { key: "ArrowDown" })
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Wrote Budget plan")
  })
  it("loading, no one, a failure and a refusal each say what's true", () => {
    const { rerender } = render(<WhoKnowsList {...props} answer={undefined} error={undefined} loading />)
    expect(screen.getByRole("status", { name: "Finding who knows" })).toBeTruthy()
    rerender(<WhoKnowsList {...props} answer={{ ...answer, people: [] }} error={undefined} loading={false} />)
    expect(screen.getByRole("heading", { name: "No one yet" })).toBeTruthy()
    rerender(<WhoKnowsList {...props} answer={undefined} error={failed} loading={false} />)
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
    expect(screen.queryByText("No one yet")).toBeNull()
    rerender(<WhoKnowsList {...props} answer={undefined} error={refused} loading={false} />)
    expect(screen.getByText("Who knows is for workspace members")).toBeTruthy()
    rerender(<WhoKnowsList {...props} answer={undefined} error={signedOut} loading={false} />)
    expect(screen.getByText("Who knows is for workspace members")).toBeTruthy()
  })
  it("says why the server won't ask about the words, with nothing to retry", () => {
    render(<WhoKnowsList {...props} answer={undefined} error={badWords} loading={false} />)
    expect(screen.getByText("Ask about something in 2 to 200 characters.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
  })
  it("tells someone who left themselves out, and where to change it", () => {
    render(<WhoKnowsList {...props} answer={{ ...answer, you_hidden: true }} error={undefined} loading={false} />)
    expect(screen.getByText(/You're hidden from Who knows/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Change" }).getAttribute("href")).toBe("/app/settings/profile#profile-who-knows")
  })
})

describe("the search page's strip", () => {
  it("asks for three, shows them, and opens the rest", () => {
    answers.set(STRIP, { data: { data: { ...answer, people: answer.people.slice(0, 3) } } })
    render(<WhoKnowsStrip words="budget" />)
    expect(asked).toContain(STRIP)
    expect(screen.getByRole("region", { name: "Who knows about “budget”" })).toBeTruthy()
    expect(screen.getAllByRole("link")).toHaveLength(3)
    expect(screen.getByRole("link", { name: "Cy Okafor, Wrote 1 · Posted 1" }).textContent).toBe("CCy OkaforWrote 1 · Posted 1\u2003Budget plan")
    const open = screen.getByRole("button", { name: "See who and why" })
    expect(open.getAttribute("aria-haspopup")).toBe("dialog")
  })
  it("says nothing for a word too short, and nothing to someone refused", () => {
    const { container, rerender } = render(<WhoKnowsStrip words="b" />)
    expect(container.innerHTML).toBe("")
    expect(asked).toHaveLength(0)
    answers.set(STRIP, { isError: refused })
    rerender(<WhoKnowsStrip words="budget" />)
    expect(container.innerHTML).toBe("")
    answers.set(STRIP, { isError: signedOut })
    rerender(<WhoKnowsStrip words="budget" />)
    expect(container.innerHTML).toBe("")
  })
  it("says nothing, and offers no retry, for words the server won't ask about", () => {
    answers.set(STRIP, { isError: badWords })
    const { container } = render(<WhoKnowsStrip words="budget" />)
    expect(container.innerHTML).toBe("")
  })
  it("says a failed read is a failure, never the last words' people as who knows about these", () => {
    const shown = { data: { data: { ...answer, people: answer.people.slice(0, 3) } } }
    answers.set(STRIP, shown)
    const { rerender } = render(<WhoKnowsStrip words="budget" />)
    expect(screen.getAllByRole("link")).toHaveLength(3)
    answers.set("/people/who-knows?q=budget+plan&limit=3", { ...shown, isError: failed, isPrevious: true })
    rerender(<WhoKnowsStrip words="budget plan" />)
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })
  it("loading, no one and a failure", () => {
    const { rerender } = render(<WhoKnowsStrip words="budget" />)
    expect(screen.getByRole("status", { name: "Finding who knows" })).toBeTruthy()
    answers.set(STRIP, { data: { data: { ...answer, people: [] } } })
    rerender(<WhoKnowsStrip words="budget" />)
    expect(screen.getByText(/No one yet/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "See who and why" })).toBeNull()
    answers.set(STRIP, { isError: failed })
    rerender(<WhoKnowsStrip words="budget" />)
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })
  // The held slot is 208 px on a computer (DESIGN-BUILD-16, 25 Oct): the full
  // failure state put Try again below its fold, and the note that you're hidden
  // with three people cut the third through the middle.
  it("says a failure in one row, with Try again at its end", () => {
    answers.set(STRIP, { isError: failed })
    const { container } = render(<WhoKnowsStrip words="budget" />)
    const body = container.querySelector("[data-who-knows-body]")!
    const row = body.firstElementChild!
    expect(row.textContent).toContain("Couldn't load who knows about this")
    expect(row.lastElementChild).toBe(screen.getByRole("button", { name: /Try again/ }))
  })
  it("shows one person fewer under the note that you're hidden, and fades what still doesn't fit", () => {
    answers.set(STRIP, { data: { data: { ...answer, you_hidden: true, people: answer.people.slice(0, 3) } } })
    const { container } = render(<WhoKnowsStrip words="budget" />)
    expect(screen.getByText(/You're hidden from Who knows/)).toBeTruthy()
    expect(container.querySelectorAll("[data-who-knows-person]")).toHaveLength(2)
    // The rest are a press away, as ever.
    expect(screen.getByRole("button", { name: "See who and why" })).toBeTruthy()
    // Long names wrapping at 390 can still overflow: the layer's fade, down the column.
    expect(container.querySelector("[data-who-knows-body]")!.getAttribute("data-edge-fade")).toBe("block")
    const css = readFileSync("app/interaction.css", "utf8").replace(/\s+/g, " ")
    expect(css).toMatch(/\[data-edge-fade="block"\] \{[^}]*mask-image: linear-gradient\(to bottom,[^}]*animation-timeline: scroll\(self block\);/)
  })
})

describe("the setting", () => {
  it("is on by default and saves the person's own choice at once", async () => {
    answers.set("/people/who-knows/me", { data: { data: { listed: true } } })
    render(<WhoKnowsSettingCard />)
    const sw = screen.getByRole("switch", { name: /Show me in Who knows/ })
    expect(sw.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(sw)
    await Promise.resolve()
    expect(put).toHaveBeenCalledWith("/people/who-knows/me", { listed: false }, OWN_ERRORS)
  })
  // design-14: a saved change is offered back. Undo runs from the render the
  // change was made in, so a refused Undo puts back what the change left,
  // never the value that render read.
  it("offers the change back, and a refused Undo leaves the switch where the change put it", async () => {
    answers.set("/people/who-knows/me", { data: { data: { listed: true } } })
    render(<WhoKnowsSettingCard />)
    fireEvent.click(screen.getByRole("switch", { name: /Show me in Who knows/ }))
    await waitFor(() => expect(toast.mock.calls.some(([t]) => t.action)).toBe(true))
    const offer = toast.mock.calls.map(([t]) => t).find((t) => t.action)!
    expect(offer.title).toBe("Show me in Who knows: Off")
    put.mockRejectedValueOnce(new Error("refused"))
    await act(async () => {
      await offer.action!.props.onClick()
    })
    expect(put).toHaveBeenLastCalledWith("/people/who-knows/me", { listed: true }, OWN_ERRORS)
    expect(mutate).toHaveBeenLastCalledWith({ data: { listed: false } }, { revalidate: false })
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn't undo that" }))
  })
  it("draws nothing until it knows", () => {
    const { container } = render(<WhoKnowsSettingCard />)
    expect(container.innerHTML).toBe("")
  })
  // Both editions draw this card, and the one without AI has no assistant:
  // its words name nothing only the AI edition has, on or off.
  it("says what it does in words both editions can say", () => {
    for (const listed of [true, false]) {
      cleanup()
      answers.set("/people/who-knows/me", { data: { data: { listed } } })
      const { container } = render(<WhoKnowsSettingCard />)
      expect(container.textContent).not.toMatch(/assistant|\bAI\b|agent/i)
    }
  })
})
