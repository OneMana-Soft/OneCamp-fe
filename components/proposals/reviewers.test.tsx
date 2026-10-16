import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Fragment } from "@tiptap/pm/model"
import { proposeReplacement } from "@/lib/proposals/review"
import { Proposals, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { reviewerFor, reviewersVersion, setReviewer, subscribeReviewers } from "./reviewers"
import ReviewBarSlot from "./ReviewBarSlot"

// Who reviews a proposal: its producer's handlers, given to the one review
// bar by the proposal's id (B9's AI bar names the model and asks again).

let editor: Editor
beforeEach(() => {
  editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit, Proposals], content: "<p>We ship on Thursday.</p>" })
})
afterEach(() => {
  cleanup()
  editor.destroy()
})

describe("a proposal's reviewer", () => {
  it("is found by its proposal, and taken back only by whoever gave it", () => {
    const heard = vi.fn()
    const off = subscribeReviewers(heard)
    const v = reviewersVersion()
    const releaseFirst = setReviewer("p1", { label: "first" })
    const releaseSecond = setReviewer("p1", { label: "second" })
    expect(reviewerFor("p1")?.label).toBe("second")
    releaseFirst()
    expect(reviewerFor("p1")?.label).toBe("second")
    releaseSecond()
    expect(reviewerFor("p1")).toBeUndefined()
    expect(reviewerFor(null)).toBeUndefined()
    expect(heard).toHaveBeenCalledTimes(3)
    expect(reviewersVersion()).toBe(v + 3)
    off()
  })

  it("gives the review bar its label and its Try again", async () => {
    render(<ReviewBarSlot editor={editor} docId="d1" />)
    const end = editor.state.doc.child(0).nodeSize - 1
    const tracked = proposeReplacement(editor.state, 1, end, Fragment.from(editor.schema.text("We ship on Friday.")))!
    const retry = vi.fn()
    let release = () => {}
    act(() => {
      showProposal(editor, tracked)
      release = setReviewer(tracked.proposal.id, { label: "AI · qwen3 4B, on your server", onRetry: retry })
    })
    const bar = screen.getByRole("toolbar", { hidden: true })
    expect(bar.textContent).toContain("AI · qwen3 4B, on your server · 1 change")
    fireEvent.keyDown(bar, { key: "r", ctrlKey: true })
    expect(retry).toHaveBeenCalledTimes(1)
    act(() => release())
    expect(screen.getByRole("toolbar", { hidden: true }).textContent).not.toContain("qwen3")
  })
})
