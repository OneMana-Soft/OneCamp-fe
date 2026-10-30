"use client"

/**
 * Presence from a doc editor's first moment (B8): this tab's edits said in its
 * awareness state, and everyone's state read into the presence store, which
 * the stack and the line under the title read ("Edited just now by Maya").
 *
 * Both were the presence overlay's (PresenceOverlay.tsx), an 'editorOverlay'
 * slot whose chunk loads a moment after the doc opens, so they started when it
 * came: an edit typed before then was never said, and another person's edit
 * seen before then was taken for one made before this tab opened the doc, so
 * never news. On a busy machine that moment is seconds, and the line read
 * "Edited just now" where it says "Edited just now by sam" (presence.spec:108,
 * flaky across gates; held 4 s, the overlay's chunk made it so every time).
 * A doc block's extension instead, loaded with the doc's other blocks before
 * its editor is made, so they start with the editor and stop with it. The
 * overlay keeps the rest: idle, following, jumping, and where this tab looks
 * while followed.
 */

import { Extension, type Editor } from "@tiptap/core"
import type { BlockContext } from "@/components/docEditor/registry/types"
import { readPresence } from "./read"
import type { AwarenessLike } from "./live"

/** At most this often an edit is said: the line rounds to "just now" anyway. */
const EDIT_PULSE_EVERY = 10_000

/** Says this tab's edits in its awareness state, at most every EDIT_PULSE_EVERY. Returns a way to stop. */
function sayEdits(editor: Pick<Editor, "on" | "off">, awareness: AwarenessLike): () => void {
  let last = 0
  const onUpdate = ({ transaction }: { transaction: { docChanged: boolean; getMeta(key: string): unknown } }) => {
    if (!transaction.docChanged) return
    // What another tab wrote arrives through the sync: not this tab's edit.
    if ((transaction.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin) return
    const now = Date.now()
    if (now - last < EDIT_PULSE_EVERY) return
    last = now
    awareness.setLocalStateField("edited", now)
  }
  editor.on("update", onUpdate)
  return () => {
    editor.off("update", onUpdate)
  }
}

const PresenceFromTheStart = Extension.create<{ docId: string; awareness: AwarenessLike | null }, { stop: (() => void) | null }>({
  name: "presenceFromTheStart",
  addOptions: () => ({ docId: "", awareness: null }),
  addStorage: () => ({ stop: null }),
  onCreate() {
    const { docId, awareness } = this.options
    if (!docId || !awareness || this.storage.stop) return
    const stopReading = readPresence(docId, awareness)
    const stopSaying = sayEdits(this.editor, awareness)
    this.storage.stop = () => {
      stopReading()
      stopSaying()
    }
  },
  onDestroy() {
    this.storage.stop?.()
    this.storage.stop = null
  },
})

/** The block's extension, for a doc's editor bound to its collaboration provider (registry: history/register.ts). */
export const presenceFor = (ctx: BlockContext) => {
  const awareness = ctx.provider?.awareness as unknown as AwarenessLike | null | undefined
  return ctx.docId && awareness ? [PresenceFromTheStart.configure({ docId: ctx.docId, awareness })] : []
}
