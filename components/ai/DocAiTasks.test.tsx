import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Mention from "@tiptap/extension-mention"

const find = vi.fn()
const make = vi.fn()
vi.mock("@/lib/ai/docAIApi", () => ({
  findDocTasks: (...a: unknown[]) => find(...a),
  makeDocTasks: (...a: unknown[]) => make(...a),
}))
const projects = { data: { data: [{ project_uuid: "p1", project_name: "Launch" }, { project_uuid: "p2", project_name: "Ops" }] } as unknown }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => projects }))
const toasts = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toasts(t) }))

import { BLOCK_ID_ATTR, BlockId } from "@/components/minimal-tiptap/extensions/block-id"
import { DocAiTasks } from "./DocAiTasks"

// "Find action items" (ai-search-io P0-6): the doc's action items become
// real tasks, each with its owner and date, in a project the person may add
// to, and each line gets its task's chip.

let editor: Editor
beforeEach(() => {
  find.mockReset()
  make.mockReset()
  toasts.mockReset()
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, BlockId, Mention.extend({ name: "entityMention" })],
    content: '<p data-block-id="b-1">Notes from Monday.</p><p data-block-id="b-2">Maya sends the deck by Friday.</p>',
  })
})
afterEach(() => {
  cleanup()
  editor.destroy()
})

const idOf = (index: number) => editor.state.doc.child(index).attrs[BLOCK_ID_ATTR] as string

function found() {
  const blockId = idOf(1)
  find.mockResolvedValueOnce({
    enabled: true,
    tasks: [{ title: "Send the deck", assignee_name: "Maya", due: "2026-10-16", block_id: blockId, quote: "Maya sends the deck by Friday." }],
    project: { uuid: "p1", name: "Launch", open_tasks: 3 },
  })
  return blockId
}

describe("action items in a doc", () => {
  it("are listed with their owner, date and line, and made in the doc's project", async () => {
    const blockId = found()
    const done = vi.fn()
    make.mockResolvedValueOnce({ created: 1, failed: 0, tasks: [{ task_uuid: "t1", title: "Send the deck", block_id: blockId }], project: { uuid: "p1", name: "Launch" } })
    render(<DocAiTasks editor={editor} docId="d1" onDone={done} />)
    expect(await screen.findByText("Send the deck")).toBeTruthy()
    expect(screen.getByText("Maya")).toBeTruthy()
    expect(screen.getByText("“Maya sends the deck by Friday.”")).toBeTruthy()
    // The doc's own project is picked once both answers are in.
    await vi.waitFor(() => expect((screen.getByLabelText("Project") as HTMLSelectElement).value).toBe("p1"))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make 1 task" }))
    })
    expect(make).toHaveBeenCalledWith("d1", "p1", [expect.objectContaining({ title: "Send the deck", block_id: blockId })])
    // The line gets its task's chip.
    const chip = editor.state.doc.child(1).lastChild!
    expect(chip.type.name).toBe("entityMention")
    expect(chip.attrs).toMatchObject({ id: "task:t1", label: "Send the deck" })
    expect(toasts).toHaveBeenCalledWith(expect.objectContaining({ title: "Made 1 task in Launch" }))
    expect(done).toHaveBeenCalled()
  })

  it("makes only the ones left ticked", async () => {
    found()
    render(<DocAiTasks editor={editor} docId="d1" onDone={() => {}} />)
    fireEvent.click(await screen.findByRole("checkbox"))
    expect((screen.getByRole("button", { name: "Make 0 tasks" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says why none were made, and keeps the list", async () => {
    found()
    make.mockRejectedValueOnce({ response: { status: 403, data: { msg: "You can't add tasks to Ops, so none were made." } } })
    render(<DocAiTasks editor={editor} docId="d1" onDone={() => {}} />)
    await screen.findByText("Send the deck")
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p2" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Make 1 task" }))
    })
    expect(screen.getByRole("alert").textContent).toBe("You can't add tasks to Ops, so none were made.")
    expect(screen.getByText("Send the deck")).toBeTruthy()
  })

  it("says when there are none", async () => {
    find.mockResolvedValueOnce({ enabled: true, tasks: [], note: "" })
    render(<DocAiTasks editor={editor} docId="d1" onDone={() => {}} />)
    // "Finding action items" is a status too, until the answer comes.
    expect(await screen.findByText("No clear action items in this doc.")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toBe("No clear action items in this doc.")
  })
})
