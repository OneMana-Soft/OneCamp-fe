"use client"

import type { Editor } from "@tiptap/core"
import { trash, type Trashed } from "@/components/docTree/docActions"
import { readNow, type DocChipData } from "@/lib/liveEntity"
import store from "@/store/store"
import { holds } from "./leaving"

/** What undoes each page this tab put in the trash by deleting its last block. */
const trashed = new Map<string, Trashed>()

/** Where a block was, followed through the edits since (smart-paste's trackPos). */
interface Spot {
  pos(): number | null
  stop(): void
}

/**
 * A page's last block left this doc's body (leaving.ts). A child of this doc
 * goes to the trash with Undo, which puts the block back where it was; the
 * server checks it is still the child (docActions.trash). A page that lives
 * elsewhere was linked, and one the person can't open, or gone already, is
 * left as it is.
 */
export async function blockLeft(editor: Editor, parent: string, page: string, at: Spot) {
  const seen = await readNow("doc", page)
  const d = seen.state === "ok" ? (seen.data as DocChipData | undefined) : undefined
  if (!d || d.parent_id !== parent || editor.isDestroyed || holds(editor.state.doc, page)) return at.stop()
  const putBack = () => {
    trashed.delete(page)
    const pos = at.pos()
    at.stop()
    if (editor.isDestroyed || holds(editor.state.doc, page)) return
    editor.chain().insertContentAt(pos ?? editor.state.doc.content.size, { type: "subpage", attrs: { docId: page } }).run()
  }
  const gone = await trash(store.dispatch, { id: page, title: d.title ?? "", icon: d.icon }, { onItsPage: false, go: () => undefined }, { parent, putBack })
  if (!gone) return at.stop()
  // Its block came back while it went: so does the page.
  if (!editor.isDestroyed && holds(editor.state.doc, page)) return void gone.undo()
  trashed.set(page, gone)
}

/** Blocks of pages this tab put in the trash are back (the editor's Undo, a paste): the pages come back too. */
export function blocksBack(pages: string[]) {
  for (const page of pages) {
    const gone = trashed.get(page)
    if (!gone) continue
    trashed.delete(page)
    void gone.undo()
  }
}
