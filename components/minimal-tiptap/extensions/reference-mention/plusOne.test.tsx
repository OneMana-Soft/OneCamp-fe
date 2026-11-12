import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor, EditorContent } from "@tiptap/react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"

// "+1" STAYS "+1" (UX-CHAT-H3, the audit's CHAT-03). "+" at a word's start
// opened the work picker, and "+1" searched the workspace for "1": with a task
// called "Q1 launch" highlighted, Enter put that task's chip where "+1" was,
// and the message was never sent. The work picker now opens only when a
// letter follows "+", so "+1", "+5 from me" and "+" itself are text, and
// Enter sends them; "+la" still finds "Launch checklist".

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...args: unknown[]) => post(...args) } }))
// A picked chip draws as a link that moves the page.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }))

/** What the workspace search finds for any words: a task whose name has a "1" and an "a" in it. */
const FOUND = { data: { data: { page: [{ type: "task", task: { task_id: "0c4a0000-0000-4000-8000-0000000000a1", task_name: "Q1 launch checklist" } }] } } }

beforeAll(async () => {
  // jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
    Range.prototype.getBoundingClientRect = () => new DOMRect()
  }
  await loadBlocks("chat", ALL_EDITIONS)
})

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue(FOUND)
})

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
})

/** The chat composer's editor, on the page, with `send` as its Enter. */
async function composer(send: () => boolean) {
  const e = new Editor({ extensions: extensionsFor({ ...bareContext("chat", ALL_EDITIONS), onSubmitRef: { current: send } }), content: "<p></p>" })
  editors.push(e)
  render(<EditorContent editor={e} />)
  await waitFor(() => expect(e.view.dom.isConnected).toBe(true))
  act(() => {
    e.commands.focus("end")
  })
  return e
}

/** Typed a character at a time, as a keyboard does. */
async function type(e: Editor, text: string) {
  for (const ch of text) {
    await act(async () => {
      e.commands.insertContent(ch)
    })
  }
}

function press(e: Editor, key: string) {
  act(() => {
    e.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

/** Longer than the picker's search pause (180 ms), so a search it was going to make has been made. */
const pastTheSearchPause = () => act(() => new Promise((r) => setTimeout(r, 400)))

const chips = (e: Editor) => (e.getJSON().content?.[0]?.content ?? []).filter((n) => n.type === "entityMention")
const pickerRows = () => document.querySelectorAll("[data-reference-list] [role='option']")

describe("'+' and a number in the chat composer", () => {
  it("'+1' and Enter sends '+1', never a chip", async () => {
    let sent = ""
    const send = vi.fn(() => {
      sent = e.getText()
      return true
    })
    const e = await composer(send)
    await type(e, "+1")
    await pastTheSearchPause()
    // Nothing was searched for, and no picker stands over the box.
    expect(post).not.toHaveBeenCalled()
    expect(pickerRows()).toHaveLength(0)
    press(e, "Enter")
    expect(send).toHaveBeenCalledTimes(1)
    expect(sent).toBe("+1")
    expect(chips(e)).toEqual([])
  })

  it("'+a' still opens the work picker", async () => {
    const e = await composer(() => true)
    await type(e, "+a")
    await waitFor(() => expect(pickerRows()).toHaveLength(1))
    expect(post).toHaveBeenCalledWith("/search/unifiedSearch", { global_search_text: "a" })
    expect(pickerRows()[0].textContent).toContain("Q1 launch checklist")
    press(e, "Enter")
    expect(chips(e)).toHaveLength(1)
    expect(chips(e)[0].attrs?.id).toBe("task:0c4a0000-0000-4000-8000-0000000000a1")
  })

  // After words: "+" on a line of its own is markdown's list marker, as "-"
  // and "*" are, and Enter there starts a list in every editor.
  it("'+' alone and Enter sends '+': 'Looks good +' goes as typed", async () => {
    let sent = ""
    const send = vi.fn(() => {
      sent = e.getText()
      return true
    })
    const e = await composer(send)
    await type(e, "Looks good +")
    await pastTheSearchPause()
    expect(pickerRows()).toHaveLength(0)
    press(e, "Enter")
    expect(send).toHaveBeenCalledTimes(1)
    expect(sent).toBe("Looks good +")
    expect(chips(e)).toEqual([])
  })

  // Only "+" waits for a letter: a channel's name may start with a digit.
  it("'#2' still opens the channel picker", async () => {
    post.mockResolvedValue({ data: { data: { page: [{ type: "channel", channel: { ch_id: "0c4a0000-0000-4000-8000-0000000000c2", ch_name: "2026-plans" } }] } } })
    const e = await composer(() => true)
    await type(e, "#2")
    await waitFor(() => expect(pickerRows()).toHaveLength(1))
    expect(post).toHaveBeenCalledWith("/search/unifiedSearch", { global_search_text: "2" })
    expect(pickerRows()[0].textContent).toContain("2026-plans")
  })

  // The letter rule sits beside the code rule, never in its place: "+la" in code is code.
  it("'+la' in a code block opens no menu", async () => {
    const e = await composer(() => true)
    expect(e.schema.nodes.codeBlock, "the chat composer has code blocks").toBeTruthy()
    act(() => {
      e.chain().focus().setCodeBlock().run()
    })
    await type(e, "+la")
    await pastTheSearchPause()
    expect(e.getJSON().content?.[0]?.type).toBe("codeBlock")
    expect(post).not.toHaveBeenCalled()
    expect(pickerRows()).toHaveLength(0)
  })
})
