"use client"

import type { Editor } from "@tiptap/core"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { APPEND_BLOCKS_PATH } from "@/services/endpoints/docs"
import { standAlone, type BlockRef } from "@/components/minimal-tiptap/extensions/block-commands/blocks"
import { deleteBlocks, runsOf, targetBlocks, type BlockTarget } from "@/components/minimal-tiptap/extensions/block-commands/commands"
import { blocksWithIds } from "@/components/minimal-tiptap/extensions/block-commands/blockIds"
import { KEEP_PAGES } from "@/components/minimal-tiptap/extensions/subpage/keepPages"

/**
 * MOVE TO… FOR BLOCKS (B1, with B6's dialog; WAVE_B_CONTRACTS "Dialogs").
 * The block menu stages the blocks here and opens B6's `doc.moveTo` dialog,
 * which reads them (peekBlockMove, releaseBlockMove) and, once a doc is chosen, awaits
 * moveTo(target): the blocks are added at the end of the target through the
 * API (A4's live writer, so whoever has it open sees them arrive), then
 * deleted here in one transaction. A move that fails throws an Error whose
 * message says what happened and what to do, and leaves the blocks here.
 */

/** The API's way in: append blocks to a doc's end (router/docsBlocks.go). */
export const APPEND_BLOCKS_URL = APPEND_BLOCKS_PATH

interface StagedBlockMove {
  /** How many blocks (the dialog's title: "Move 3 blocks to…"). */
  count: number
  moveTo(targetDocId: string): Promise<void>
}

const staged = new Map<string, StagedBlockMove>()

/** The blocks of a move, found again by their ids (they may have moved since). */
function blocksNow(editor: Editor, ids: string[]): BlockRef[] | null {
  const found = blocksWithIds(editor.state.doc, ids)
  return found.length === ids.length ? found : null
}

/** The message a refused move shows: the API's own words when it gave some. */
function moveError(e: unknown): Error {
  const res = (e as { response?: { status?: number; data?: { msg?: string } } }).response
  if (res?.status === 403) return new Error("You can't edit that doc, so the blocks can't go there. Choose another doc.")
  if (res?.status === 404 || res?.status === 410) return new Error("That doc isn't there any more. Choose another doc.")
  if (res?.data?.msg) return new Error(res.data.msg)
  return new Error("The blocks couldn't be moved just now. They are still here; try again in a moment.")
}

/**
 * Stages a move of the blocks a menu stood for (their ids or their range;
 * without either, the chosen ones) out of this doc. False when there is nothing to move (no blocks, or blocks with
 * no id yet).
 */
export function stageBlockMove(docId: string, editor: Editor, target: BlockTarget): boolean {
  const blocks = runsOf(editor.state.doc, targetBlocks(editor.state, target)).flatMap((r) => {
    const out: BlockRef[] = []
    let pos = r.from
    for (let i = r.start; i < r.end; i++) {
      const node = r.parent.child(i)
      out.push({ pos, node })
      pos += node.nodeSize
    }
    return out
  })
  const ids = blocks.map((b) => b.node.attrs.blockId as string | null)
  if (!blocks.length || !ids.every(Boolean)) return false
  staged.set(docId, {
    count: blocks.length,
    async moveTo(targetDocId: string) {
      if (targetDocId === docId) throw new Error("The blocks are in this doc already. Choose another doc.")
      if (editor.isDestroyed || !editor.isEditable) throw new Error("This doc can't be edited just now, so nothing was moved.")
      const now = blocksNow(editor, ids as string[])
      if (!now) throw new Error("Those blocks changed while you chose. Choose them again, then choose Move to… again.")
      // Each block as it can stand on its own: a list item in a list of its kind.
      const content = now.map((b) => standAlone(b.node, editor.state.doc.resolve(b.pos).parent.type).toJSON())
      try {
        await axiosInstance.post(APPEND_BLOCKS_URL, { doc_uuid: targetDocId, content: { type: "doc", content } }, OWN_ERRORS)
      } catch (e) {
        throw moveError(e)
      }
      // Added there: gone from here, in one change. Found again, in case they moved meanwhile.
      const after = editor.isDestroyed ? null : blocksNow(editor, ids as string[])
      const tr = after && deleteBlocks(editor.state, after)
      // Never a quiet half: the dialog says what happened and what to do.
      if (!tr) throw new Error("The blocks were added to that doc, but they're still here too. Delete them here by hand.")
      // A page's block among them went too: the page stays where it is.
      editor.view.dispatch(tr.setMeta(KEEP_PAGES, true))
    },
  })
  return true
}

/** The staged block move for a doc, as its dialog opens (useHandoff); null when none is staged (the dialog moves the page). */
export function peekBlockMove(docId: string): StagedBlockMove | null {
  return staged.get(docId) ?? null
}

/** The dialog showing it has it: it is no longer staged. */
export function releaseBlockMove(move: StagedBlockMove): void {
  for (const [doc, m] of staged) if (m === move) staged.delete(doc)
}

