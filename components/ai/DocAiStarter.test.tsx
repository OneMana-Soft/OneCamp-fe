import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Fragment } from "@tiptap/pm/model"

const starters = vi.fn()
vi.mock("@/lib/ai/docAIApi", () => ({ getDocAIStarters: (...a: unknown[]) => starters(...a) }))

import { Proposals, discardProposal, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { proposeReplacement } from "@/lib/proposals/review"
import { aiBarOf } from "./docAiStore"
import DocAiStarter from "./DocAiStarter"

// An empty doc's AI rows (small-details E8; PROGRAM B9): "Ask AI to draft",
// and a draft from the doc's project's open tasks when it has some.

let editor: Editor
let host: HTMLDivElement
beforeEach(() => {
  starters.mockReset()
  host = document.createElement("div")
  document.body.appendChild(host)
  editor = new Editor({ element: host, extensions: [StarterKit, Proposals], content: "<p></p>" })
})
afterEach(() => {
  cleanup()
  editor.destroy()
  host.remove()
})

const starter = () =>
  render(
    <div data-doc-empty-starter="">
      <DocAiStarter editor={editor} docId="d1" />
    </div>,
  )

const rows = () => screen.queryAllByRole("button").map((b) => b.textContent)

describe("the empty doc's AI rows", () => {
  it("offer a draft, and one from the project's open tasks when there are some", async () => {
    starters.mockResolvedValueOnce({ uuid: "p1", name: "Launch", open_tasks: 12 })
    starter()
    expect(await screen.findByText(/Draft from Launch/)).toBeTruthy()
    expect(rows()).toEqual(["Ask AI to draft", "Draft from Launch's open tasks · 12"])
    expect(starters).toHaveBeenCalledWith("d1")
  })

  it("leave the tasks out when the project has none open", async () => {
    starters.mockResolvedValueOnce({ uuid: "p1", name: "Launch", open_tasks: 0 })
    starter()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(rows()).toEqual(["Ask AI to draft"])
  })

  it("open the bar at the empty line, or draft from the tasks at once", async () => {
    starters.mockResolvedValueOnce({ uuid: "p1", name: "Launch", open_tasks: 12 })
    starter()
    fireEvent.click(screen.getByRole("button", { name: "Ask AI to draft" }))
    expect(aiBarOf(editor)).toMatchObject({ open: true, request: { docId: "d1", from: 1, to: 1, mode: "actions", source: "starter" } })
    expect(aiBarOf(editor).request?.action).toBeUndefined()
    fireEvent.click(await screen.findByRole("button", { name: /Draft from Launch/ }))
    expect(aiBarOf(editor).request).toMatchObject({ action: "draft_from_tasks", projectId: "p1", source: "starter" })
  })

  it("are reached with ↓ from the empty line, moved through with ↑ ↓, and left with Esc", async () => {
    starters.mockResolvedValueOnce({ uuid: "p1", name: "Launch", open_tasks: 3 })
    starter()
    await screen.findByText(/Draft from Launch/)
    editor.commands.focus()
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" })
    const [ask, tasks] = screen.getAllByRole("button")
    expect(document.activeElement).toBe(ask)
    fireEvent.keyDown(ask, { key: "ArrowDown" })
    expect(document.activeElement).toBe(tasks)
    fireEvent.keyDown(tasks, { key: "ArrowUp" })
    expect(document.activeElement).toBe(ask)
    fireEvent.keyDown(ask, { key: "Escape" })
    // Tiptap focuses on the next frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it("step aside while an answer is shown on the empty line for review", async () => {
    starters.mockResolvedValueOnce(null)
    starter()
    expect(rows()).toEqual(["Ask AI to draft"])
    const t = proposeReplacement(editor.state, 0, editor.state.doc.content.size, Fragment.from(editor.schema.nodes.paragraph.create(null, editor.schema.text("A draft."))))!
    act(() => showProposal(editor, t))
    expect(rows()).toEqual([])
    act(() => discardProposal(editor, t.proposal.id))
    expect(rows()).toEqual(["Ask AI to draft"])
  })
})
