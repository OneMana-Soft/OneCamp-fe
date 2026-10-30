import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import type { LaterItem, SaveLaterInput } from "@/services/laterService"
import { DateMention } from "./dateMention"
import { remindAt } from "./reminders"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("a reminder on a date in a doc (D6)", () => {
  let editor: Editor
  let datePos: number

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 23, 10))
    editor = new Editor({
      extensions: [StarterKit, DateMention],
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Ship the beta " }, { type: "dateMention", attrs: { date: "2026-10-30" } }] }],
      },
    })
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "dateMention") datePos = pos
    })
  })

  afterEach(() => {
    editor.destroy()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("is saved on an install served over plain http, where the browser has no crypto.randomUUID", async () => {
    // Not a secure context: crypto keeps getRandomValues but not randomUUID.
    const real = globalThis.crypto
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) })
    const save = vi.fn(async (input: SaveLaterInput) => ({ ...input, id: "later-1" }) as unknown as LaterItem)

    await remindAt(editor, datePos, save)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ item_type: "reminder", link: "/app/later", title: expect.stringContaining("Ship the beta") })
    expect(save.mock.calls[0][0].item_id).toMatch(UUID)
    // The date wears the bell of the reminder it was given.
    expect(editor.state.doc.nodeAt(datePos)?.attrs.reminder).toBe("later-1")
  })
})
