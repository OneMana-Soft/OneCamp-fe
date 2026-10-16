import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import * as Y from "yjs"

const edits = vi.fn()
const revert = vi.fn()
vi.mock("@/lib/ai/docAIApi", () => ({
  getAgentEdits: (...a: unknown[]) => edits(...a),
  revertAgentEdit: (...a: unknown[]) => revert(...a),
}))
const toasts = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toasts(t) }))

import { encodeRelative, relativeAt } from "@/lib/proposals/core"
import { yBindingOf } from "@/lib/proposals/review"
import DocAiAgentEdits, { acrossOf, age } from "./DocAiAgentEdits"

// An agent's edits in the margin (editor.md P2-2): "Release Captain · 2m ·
// Revert" beside what it wrote, from the doc's live copy, so every tab sees
// the same marks; Revert asks first when someone edited the text since.

let editor: Editor
let ydoc: Y.Doc
beforeEach(() => {
  edits.mockReset()
  revert.mockReset()
  toasts.mockReset()
  ydoc = new Y.Doc()
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: ydoc })],
  })
  editor.commands.setContent("<p>Intro.</p><h2>Risks</h2><p>Launch slips a week.</p>")
  // jsdom lays nothing out: each position a line of its own.
  editor.view.coordsAtPos = ((pos: number) => ({ top: pos * 10, bottom: pos * 10 + 16, left: 0, right: 0 })) as typeof editor.view.coordsAtPos
})
afterEach(() => {
  cleanup()
  editor.destroy()
})

/** An agent's edit of blocks 1 and 2, as the collaboration service writes it. */
function agentWrote(id = "e1", at = Date.now() - 120_000) {
  const b = yBindingOf(editor.state)!
  const from = editor.state.doc.child(0).nodeSize
  const to = editor.state.doc.content.size
  act(() => {
    ydoc.getMap("agentEdits").set(id, {
      agent: "a1",
      asker: "u1",
      run: "r1",
      at,
      from: encodeRelative(relativeAt(b.fragment, editor.state.doc, from, 0)),
      to: encodeRelative(relativeAt(b.fragment, editor.state.doc, to, -1)),
    })
  })
}

/** The chip, opened from its small mark when the page is narrow. */
async function openMark() {
  await vi.waitFor(() => expect(document.querySelector("[data-agent-edit], [aria-label^=\"Release Captain's edit\"]")).not.toBeNull())
  const mark = screen.queryByRole("button", { name: /^Release Captain's edit, / })
  if (mark) fireEvent.click(mark)
}

const narrow = (width: number) => Object.defineProperty(window, "innerWidth", { value: width, configurable: true })

const edit = (over: Record<string, unknown> = {}) => ({
  edit_id: "e1",
  run_id: "r1",
  agent_id: "a1",
  agent_name: "Release Captain",
  asker_uuid: "u1",
  asker_name: "Sam Rivera",
  op: "replace_section",
  block_ids: [],
  at: new Date().toISOString(),
  reverted: false,
  can_revert: true,
  ...over,
})

describe("an agent's edit in the margin", () => {
  it("reads “Release Captain · 2m · Revert” beside what it wrote", async () => {
    edits.mockResolvedValue([edit()])
    render(<DocAiAgentEdits editor={editor} docId="d1" />)
    agentWrote()
    await openMark()
    const chip = await screen.findByText("Release Captain")
    expect(chip.parentElement?.textContent).toBe("Release Captain· 2m· Revert")
    expect(chip.parentElement?.getAttribute("title")).toMatch(/^Release Captain wrote this for Sam Rivera, .+\. Revert puts back what was there before\.$/)
  })

  it("reverts, and says so", async () => {
    edits.mockResolvedValue([edit()])
    revert.mockResolvedValueOnce({ ok: true, reverted: 1 })
    render(<DocAiAgentEdits editor={editor} docId="d1" />)
    agentWrote()
    await openMark()
    await screen.findByText("Release Captain")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Revert/ }))
    })
    expect(revert).toHaveBeenCalledWith("d1", { edit_id: "e1" }, false)
    expect(toasts).toHaveBeenCalledWith({ title: "Reverted Release Captain's edit" })
  })

  it("asks first when someone edited the agent's text since", async () => {
    edits.mockResolvedValue([edit()])
    revert.mockResolvedValueOnce({ ok: false, editedSince: true, message: "Maya edited this since the agent wrote it. Revert anyway?" })
    revert.mockResolvedValueOnce({ ok: true, reverted: 1 })
    render(<DocAiAgentEdits editor={editor} docId="d1" />)
    agentWrote()
    await openMark()
    await screen.findByText("Release Captain")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Revert/ }))
    })
    expect(screen.getByRole("alertdialog", { name: "Revert anyway?" }).textContent).toContain("Maya edited this since")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revert anyway" }))
    })
    expect(revert).toHaveBeenLastCalledWith("d1", { edit_id: "e1" }, true)
  })

  it("offers no Revert to someone who may not, and draws nothing for a reverted edit", async () => {
    edits.mockResolvedValue([edit({ can_revert: false })])
    const view = render(<DocAiAgentEdits editor={editor} docId="d1" />)
    agentWrote()
    await openMark()
    await screen.findByText("Release Captain")
    expect(screen.queryByRole("button", { name: /Revert/ })).toBeNull()
    view.unmount()
    edits.mockResolvedValue([edit({ reverted: true })])
    render(<DocAiAgentEdits editor={editor} docId="d1" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(screen.queryByRole("button", { name: /^Release Captain's edit, / })).toBeNull()
  })

  it("is a small mark on a narrow page, which opens the chip", async () => {
    // jsdom lays nothing out: the text ends at 0, so the page must be narrower than the chip.
    narrow(220)
    try {
      edits.mockResolvedValue([edit()])
      render(<DocAiAgentEdits editor={editor} docId="d1" />)
      agentWrote()
      const mark = await screen.findByRole("button", { name: /^Release Captain's edit, 2m ago$/ })
      expect(screen.queryByText("Release Captain")).toBeNull()
      fireEvent.click(mark)
      expect(mark.getAttribute("aria-expanded")).toBe("true")
      expect(screen.getByText("Release Captain")).toBeTruthy()
    } finally {
      narrow(1024)
    }
  })

  it("asks the API nothing in a doc no agent wrote in", async () => {
    render(<DocAiAgentEdits editor={editor} docId="d1" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(edits).not.toHaveBeenCalled()
  })
})

describe("where a mark goes across", () => {
  it("is beside the text when the margin has room, and compact where it hasn't", () => {
    // 1920: room in the page's margin for the whole chip.
    expect(acrossOf({ left: 600, right: 1320 }, { left: 600 }, 1904)).toEqual({ rule: -12, chip: 732, mode: "full" })
    // A phone: a small mark in what margin there is, never past the edge.
    const phone = acrossOf({ left: 20, right: 370 }, { left: 20 }, 382)
    expect(phone).toEqual({ rule: -12, chip: 338, mode: "compact" })
    expect(acrossOf({ left: 400, right: 1120 }, { left: 400 }, 1264).mode).toBe("compact")
    // 1440 beside a sidebar: not quite room for the whole chip, so the small mark.
    expect(acrossOf({ left: 480, right: 1200 }, { left: 480 }, 1424).mode).toBe("compact")
  })
})

describe("a mark's age", () => {
  it("is short", () => {
    const now = new Date("2026-10-13T12:00:00Z")
    expect(age(new Date("2026-10-13T11:59:50Z"), now)).toBe("now")
    expect(age(new Date("2026-10-13T11:58:00Z"), now)).toBe("2m")
    expect(age(new Date("2026-10-13T09:00:00Z"), now)).toBe("3h")
  })
})
