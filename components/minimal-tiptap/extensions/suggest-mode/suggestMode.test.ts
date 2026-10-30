import { afterEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import * as Y from "yjs"
import { Fragment } from "@tiptap/pm/model"
import { Proposals, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { DECISION_WRITE, proposeReplacement } from "@/lib/proposals/review"
import { SuggestMode, closeSuggestion, openSuggestion, setSuggesting, suggestStateOf } from "./suggestMode"
import { placeOf, targetAt } from "./target"
import { contentOfText, planSync, reviewerLabel } from "./sync"
import type { EditProposal } from "@/lib/proposals/types"

const decide = vi.fn()
vi.mock("@/services/proposalService", async (orig) => ({ ...(await orig<object>()), decideProposal: (...a: unknown[]) => decide(...a), decideAndApply: async (id: string, input: unknown, apply: () => unknown) => (await decide(id, input), apply()) }))

import { acceptPersisted } from "@/components/proposals/persisted"

// Two tabs on one doc, each on its own Yjs copy, passing every update to the
// other as the collaboration server would (as proposals.test.ts does).
const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function tabs(html: string) {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(b, u, "wire")
  })
  b.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(a, u, "wire")
  })
  const make = (doc: Y.Doc) => {
    const e = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc }), Proposals, SuggestMode],
    })
    editors.push(e)
    return e
  }
  const tabA = make(a)
  const tabB = make(b)
  tabA.commands.setContent(html)
  return { tabA, tabB }
}

const text = (e: Editor) => e.state.doc.textBetween(0, e.state.doc.content.size, "|")

/** Where a word is in the doc. */
function find(e: Editor, word: string) {
  let at = -1
  e.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(word)) at = pos + node.text.indexOf(word)
  })
  return { from: at, to: at + word.length }
}

describe("suggesting", () => {
  it("stops this editor's own changes, and lets everyone else's through", () => {
    const { tabA, tabB } = tabs("<p>Ship the launch on Friday</p>")
    setSuggesting(tabA, true)
    tabA.commands.insertContentAt(1, "Please ")
    expect(text(tabA)).toBe("Ship the launch on Friday")
    // Another tab's change arrives, and shows.
    tabB.commands.insertContentAt(1, "Team: ")
    expect(text(tabA)).toBe("Team: Ship the launch on Friday")
    // Accepting a suggestion writes, even while suggesting.
    tabA.view.dispatch(tabA.state.tr.insertText("OK ", 1).setMeta(DECISION_WRITE, true))
    expect(text(tabA)).toBe("OK Team: Ship the launch on Friday")
    setSuggesting(tabA, false)
    tabA.commands.insertContentAt(1, "Now ")
    expect(text(tabA)).toBe("Now OK Team: Ship the launch on Friday")
  })

  it("writes an accepted suggestion, and none of this editor's own changes while the accept waits on the server", async () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    const friday = find(tabA, "Friday")
    showProposal(tabA, proposeReplacement(tabA.state, friday.from, friday.to, Fragment.from(tabA.schema.text("Monday")))!)
    const [id] = Object.keys(proposalsOf(tabA.state).active)
    setSuggesting(tabA, true)
    let answer = () => {}
    decide.mockReturnValueOnce(new Promise<void>((resolve) => (answer = resolve)))
    const accepting = acceptPersisted(tabA, id)
    // Commands are not typing: ⌘B and the like stay out while the accept is in flight.
    tabA.commands.setTextSelection(find(tabA, "Ship"))
    tabA.commands.toggleBold()
    tabA.commands.insertContentAt(1, "Please ")
    expect(tabA.getHTML()).not.toContain("<strong>")
    expect(text(tabA)).toBe("Ship the launch on Friday")
    answer()
    await accepting
    expect(text(tabA)).toBe("Ship the launch on Monday")
  })

  // A phone's keyboard composes a word (IME): the composer opens as it starts, empty over the words chosen, so the word is composed there.
  it("opens the composer as a keyboard starts composing, and what it still commits in the doc goes to the field", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    setSuggesting(tabA, true)
    const friday = find(tabA, "Friday")
    tabA.commands.setTextSelection(friday)
    tabA.view.dom.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }))
    expect(suggestStateOf(tabA).open).toEqual({ from: friday.from, to: friday.to, seed: "" })
    const late = tabA.view.someProp("handleTextInput", (f) => f(tabA.view, friday.from, friday.to, "Mo", () => tabA.state.tr))
    expect(late).toBe(true)
    // What the keyboard committed in the doc as the focus moved goes on in the field, never in the doc.
    expect(suggestStateOf(tabA).open).toEqual({ from: friday.from, to: friday.to, seed: "", late: "Mo" })
    expect(text(tabA)).toBe("Ship the launch on Friday")
  })

  it("keeps what a fast typist types after the first key, before the composer's field has the focus", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    setSuggesting(tabA, true)
    const friday = find(tabA, "Friday")
    const typeIn = (t: string) => tabA.view.someProp("handleTextInput", (f) => f(tabA.view, friday.from, friday.to, t, () => tabA.state.tr))
    expect(typeIn("M")).toBe(true)
    expect(typeIn("o")).toBe(true)
    expect(typeIn("nday")).toBe(true)
    expect(suggestStateOf(tabA).open).toEqual({ from: friday.from, to: friday.to, seed: "M", late: "onday" })
    expect(text(tabA)).toBe("Ship the launch on Friday")
  })

  it("opens the composer on what is typed, over the words or at the caret", () => {
    const { tabA } = tabs("<p>Ship the launch on Friday</p>")
    setSuggesting(tabA, true)
    const friday = find(tabA, "Friday")
    const typed = tabA.view.someProp("handleTextInput", (f) => f(tabA.view, friday.from, friday.to, "M", () => tabA.state.tr))
    expect(typed).toBe(true)
    expect(suggestStateOf(tabA).open).toEqual({ from: friday.from, to: friday.to, seed: "M" })
    closeSuggestion(tabA)
    // Backspace over words suggests taking them out; at a caret it does nothing.
    tabA.commands.setTextSelection(friday)
    const del = new KeyboardEvent("keydown", { key: "Backspace" })
    expect(tabA.view.someProp("handleKeyDown", (f) => f(tabA.view, del))).toBe(true)
    expect(suggestStateOf(tabA).open).toEqual({ from: friday.from, to: friday.to, seed: "" })
    closeSuggestion(tabA)
    tabA.commands.setTextSelection(friday.from)
    expect(tabA.view.someProp("handleKeyDown", (f) => f(tabA.view, del))).toBe(true)
    expect(suggestStateOf(tabA).open).toBeNull()
    // Off, the keys are the editor's own.
    setSuggesting(tabA, false)
    expect(tabA.view.someProp("handleKeyDown", (f) => f(tabA.view, del))).toBeFalsy()
  })

  it("lets go of a suggestion being written when suggesting is turned off", () => {
    const { tabA } = tabs("<p>Ship it</p>")
    setSuggesting(tabA, true)
    openSuggestion(tabA, { from: 1, to: 5 })
    setSuggesting(tabA, false)
    expect(suggestStateOf(tabA)).toEqual({ suggesting: false, open: null })
  })
})

describe("what a suggestion replaces", () => {
  it("is the words chosen, found again after someone else's edit", () => {
    const { tabA, tabB } = tabs("<p>Ship the launch on Friday</p>")
    const target = targetAt(tabA.state, find(tabA, "Friday").from, find(tabA, "Friday").to)!
    expect(target.text).toBe("Friday")
    tabB.commands.insertContentAt(1, "Team: ")
    const at = placeOf(tabA.state, target)!
    expect(tabA.state.doc.textBetween(at.from, at.to)).toBe("Friday")
  })

  it("is lost, not guessed, when the words chosen change under it", () => {
    const { tabA, tabB } = tabs("<p>Ship the launch on Friday</p>")
    const friday = find(tabA, "Friday")
    const target = targetAt(tabA.state, friday.from, friday.to)!
    const inB = find(tabB, "Friday")
    tabB.commands.insertContentAt(inB.from + 3, "XX")
    expect(placeOf(tabA.state, target)).toBeNull()
  })

  it("at a caret, is its place in its block, while the block reads as it did", () => {
    const { tabA, tabB } = tabs("<p>Ship the launch</p><p>Second</p>")
    const caret = find(tabA, "launch").from
    const target = targetAt(tabA.state, caret, caret)!
    expect(target.text).toBe("")
    tabB.commands.insertContentAt(tabB.state.doc.content.size - 1, " line")
    const at = placeOf(tabA.state, target)!
    expect(at.from).toBe(at.to)
    expect(tabA.state.doc.textBetween(at.from, at.from + 6)).toBe("launch")
    // Words put before the block leave the caret's place as it was meant.
    tabB.commands.insertContentAt(find(tabB, "Ship").from, "Now: ")
    expect(tabA.state.doc.textBetween(placeOf(tabA.state, target)!.from, placeOf(tabA.state, target)!.from + 6)).toBe("launch")
    // Words changed inside the block: its place isn't guessed.
    tabB.commands.insertContentAt(find(tabB, "Ship").from + 2, "xx")
    expect(placeOf(tabA.state, target)).toBeNull()
  })

  it("is nothing for a selection with no words in it", () => {
    const { tabA } = tabs("<p>Ship</p><p></p><p>it</p>")
    let empty = -1
    tabA.state.doc.forEach((node, offset) => {
      if (node.content.size === 0 && empty < 0) empty = offset
    })
    expect(targetAt(tabA.state, empty, empty + 2)).toBeNull()
  })
})

describe("kept suggestions in an open doc", () => {
  const p = (id: string, status: EditProposal["status"], more: Partial<EditProposal> = {}) =>
    ({ id, status, author_kind: "person", author_uuid: "maya", ...more }) as EditProposal

  it("shows every open one not shown yet, and drops only the decided ones it showed", () => {
    const plan = planSync([p("a", "open"), p("b", "partial"), p("c", "accepted"), p("d", "declined"), p("e", "withdrawn")], ["b", "c", "draft-1"])
    expect(plan.show.map((x) => x.id)).toEqual(["a"])
    expect(plan.drop).toEqual(["c"])
  })

  it("names who suggested each, never a stranger's address", () => {
    expect(reviewerLabel(p("a", "open", { author_name: "Maya Patel" }), "sam")).toBe("Suggested by Maya Patel")
    expect(reviewerLabel(p("a", "open"), "sam")).toBe("Suggested by a teammate")
    expect(reviewerLabel(p("a", "open"), "maya")).toBe("Your suggestion")
    expect(reviewerLabel(p("a", "open", { author_kind: "agent", author_name: "Launch helper" }), "sam")).toBe("Suggested by Launch helper, an agent")
    expect(reviewerLabel(p("a", "open", { author_kind: "ai" }), "sam")).toBe("A suggestion, kept for review")
  })

  it("reads the composer's words as one line in place, or paragraphs", () => {
    const { tabA } = tabs("<p>x</p>")
    expect(contentOfText(tabA.schema, "Monday").textBetween(0, 6)).toBe("Monday")
    expect(contentOfText(tabA.schema, "").size).toBe(0)
    const two = contentOfText(tabA.schema, "First line\nSecond line")
    expect(two.childCount).toBe(2)
    expect(two.child(1).textContent).toBe("Second line")
  })
})
