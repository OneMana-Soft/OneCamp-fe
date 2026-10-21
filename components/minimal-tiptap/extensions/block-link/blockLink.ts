"use client"

import type { Editor } from "@tiptap/core"
import { toast } from "@/hooks/use-toast"
import { busFor } from "@/components/docEditor/registry/commandBus"
import { collaboratorHue } from "@/lib/identityHue"
import { CAMP_HUES, type CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { newBlockId } from "../block-id/blockId"
import { reducedMotion, showEffect } from "../block-commands/effects"
import { blocksWithIds } from "../block-commands/blockIds"
import type { BlockRef } from "../block-commands/blocks"

/**
 * LINKS TO A BLOCK (B1; editor.md P1-1, small-details S11, S12). Copy link to
 * block (⌥⇧L, the block menu) puts the doc's address with the block's id in
 * the fragment, and the sender's hue after it:
 *
 *   https://<app>/app/doc/<doc>#block-<id>~sky
 *
 * Opening one scrolls the block to the middle of the pane and flashes it in
 * the sender's hue (the one their caret wears), and a "Back to where you
 * were" chip offers the way back (docEditor/BlockMenu.tsx). The id is the
 * block's own (A1's Block Identity); a block without one yet is given one
 * here, in this tab's own change.
 */

/** A link to a block. Pure. */
export function blockLinkOf(origin: string, docId: string, blockId: string, hue?: CampHue | null): string {
  return `${origin}/app/doc/${docId}#block-${blockId}${hue ? `~${hue}` : ""}`
}

/** What a link's fragment names: a block, and the hue it was sent in. Pure. */
export function parseBlockLink(hash: string): { blockId: string; hue: CampHue | null } | null {
  const m = /^#?block-([0-9a-zA-Z-]{8,64})(?:~([a-z]+))?$/.exec(hash.trim())
  if (!m) return null
  const hue = CAMP_HUES.includes(m[2] as CampHue) ? (m[2] as CampHue) : null
  return { blockId: m[1], hue }
}

/** This tab's own hue: the one its caret wears for collaborators. */
function myHue(editor: Editor): CampHue | null {
  const ext = editor.extensionManager.extensions.find((e) => e.name === "collaborationCursor")
  const user = (ext?.options as { user?: { name?: unknown; id?: unknown; hue?: unknown } } | undefined)?.user
  return user ? collaboratorHue(user) : null
}

/** A block's id, given it one here if it has none yet. */
export function idOfBlock(editor: Editor, block: BlockRef): string | null {
  const id = block.node.attrs.blockId
  if (typeof id === "string" && id) return id
  if (!editor.isEditable || !block.node.type.spec.attrs?.blockId) return null
  const fresh = newBlockId()
  editor.view.dispatch(editor.state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, blockId: fresh }).setMeta("addToHistory", false))
  return fresh
}

/** Copies a link to the block, and says so. */
export async function copyBlockLink(editor: Editor, block: BlockRef): Promise<boolean> {
  const docId = busFor(editor)?.docId
  const id = idOfBlock(editor, block)
  if (!docId || !id) {
    toast({ title: "Couldn't link to this block", description: "Try again once the doc has saved.", variant: "destructive" })
    return false
  }
  const link = blockLinkOf(window.location.origin, docId, id, myHue(editor))
  try {
    await navigator.clipboard.writeText(link)
    toast({ title: "Link to block copied" })
    return true
  } catch {
    // A browser that refuses the clipboard: the link, to copy by hand.
    toast({ title: "Couldn't copy the link", description: link, variant: "destructive" })
    return false
  }
}

/** Where a block with this id is now, or null. */
export function findBlockById(editor: Editor, blockId: string): BlockRef | null {
  return blocksWithIds(editor.state.doc, [blockId])[0] ?? null
}

/**
 * Scrolls a block to the middle of its pane and flashes it in a hue (the
 * brand when none). True when the block is in the doc and on the page (the
 * live editor shows once its copy has arrived).
 */
export function jumpToBlock(editor: Editor, blockId: string, hue: CampHue | null): boolean {
  if (editor.isDestroyed) return false
  const block = findBlockById(editor, blockId)
  if (!block) return false
  const el = editor.view.nodeDOM(block.pos) as HTMLElement | null
  if (!el || !el.getClientRects || el.getClientRects().length === 0) return false
  el.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
  const range = [{ from: block.pos, to: block.pos + block.node.nodeSize }]
  showEffect(editor.view, "link-flash", range, { class: hue ? `block-link-flash ${HUE_CLASS[hue]}` : "block-link-flash" }, 1800)
  return true
}
