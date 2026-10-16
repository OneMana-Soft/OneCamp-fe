"use client"

import type { Editor } from "@tiptap/core"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { dateWords } from "@/lib/codec/connectedValues"
import type { LaterItem, SaveLaterInput } from "@/services/laterService"
import { trackPos } from "../smart-paste/smartPaste"
import { reminderTime } from "./parseDate"

/** The words of the line a date sits in, the date in words: what its reminder says in Later. */
export function lineOf(editor: Editor, pos: number): string {
  const block = editor.state.doc.resolve(pos).parent
  const text = block.textBetween(0, block.content.size, " ", (leaf) => (leaf.type.name === "dateMention" ? dateWords(leaf.attrs.date) : ""))
  return text.replace(/\s+/g, " ").trim().slice(0, 200)
}

/**
 * A reminder on the date at pos (D6): an item in the person's Later list, due
 * at 9:00 that day (parseDate's reminderTime), named by its line, opening the
 * doc. Where they may edit, the date wears a bell: the doc shows a reminder
 * was set; the reminder itself is the setter's. save is Later's own
 * (useLaterActions), which says what it did.
 */
export async function remindAt(editor: Editor, pos: number, save: (input: SaveLaterInput) => Promise<LaterItem>): Promise<void> {
  const node = editor.state.doc.nodeAt(pos)
  const when = node?.type.name === "dateMention" ? reminderTime(node.attrs.date) : null
  if (!node || !when) return
  const docId = busFor(editor)?.docId
  const at = trackPos(editor, pos)
  try {
    const item = await save({
      item_type: "reminder",
      item_id: crypto.randomUUID(),
      link: docId ? `/app/doc/${docId}` : "/app/later",
      title: lineOf(editor, pos) || dateWords(node.attrs.date),
      remind_at: when.toISOString(),
    })
    const now = at.pos()
    const chip = now === null || editor.isDestroyed ? null : editor.state.doc.nodeAt(now)
    if (editor.isEditable && chip?.type.name === "dateMention" && !chip.attrs.reminder && item?.id) {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(now!, undefined, { ...chip.attrs, reminder: item.id }))
    }
  } finally {
    at.stop()
  }
}
