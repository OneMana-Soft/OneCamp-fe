// Moving a page asks before it changes who can open the page (PROGRAM §3.2).
// Every way of moving one plans here first: Move to… (a sheet on a phone), a
// page dropped on a breadcrumb, and the docs tree's drag and keys. The
// server's preview (POST /doc/move/preview) says what the move would do, and
// refuses whatever the move would. Move to… moves here too (moveAll), with
// the Undo that puts things back where they were.

import { moveDoc, previewDocMove } from "@/services/docGraphService"
import type { DocMovePreview, DocMoveRequest, DocMoveResult, DocMoveTarget, DocSpace } from "@/types/docGraph"

/**
 * Something being moved, and where it is now: under a page or a folder, or
 * (null) at the top of its space; after the sibling it follows there (null:
 * first), when its row knows. Undo puts it back there, or at the end of where
 * it was when its place among its siblings isn't known.
 */
export interface MoveItem {
  id: string
  title: string
  from: string | null
  after?: string | null
}

/** A place on the way down: a page or a folder, or (null) the top of the space. */
export interface MoveStop {
  id: string | null
  title: string
}

/** Where Undo puts an item: back where it was, keeping its own access. Pure. */
export function placeBack(item: MoveItem, space: DocSpace): DocMoveRequest {
  return {
    doc_uuid: item.id,
    ...(item.from ? { parent_uuid: item.from } : { space }),
    ...(item.after ? { after_uuid: item.after } : { place: item.after === null ? "first" : "last" }),
    access: "keep",
  }
}

/** What moveAll did: what moved before any failure, and how to put that back (null once one took its new parent's access). */
export interface Moved {
  moved: MoveItem[]
  results: DocMoveResult[]
  error?: unknown
  undo: (() => Promise<void>) | null
}

/**
 * Moves items one after another, each where to says, and stops at the first
 * the server refuses. Undo puts each back where it was (placeBack), the last
 * first: an item's after is a sibling that isn't moving, so a run of
 * neighbours lands back in its order. A page that took its new parent's
 * access can't be put back by a move, so then there's no Undo.
 */
export async function moveAll(items: MoveItem[], to: (item: MoveItem) => DocMoveRequest, space: DocSpace): Promise<Moved> {
  const moved: MoveItem[] = []
  const results: DocMoveResult[] = []
  let error: unknown
  try {
    for (const item of items) {
      results.push(await moveDoc(to(item)))
      moved.push(item)
    }
  } catch (e) {
    error = e
  }
  const undo = !results.some((r) => r.access === "adopt")
    ? async () => {
        for (const item of [...moved].reverse()) await moveDoc(placeBack(item, space))
      }
    : null
  return { moved, results, error, undo }
}

/** What to do before a move. */
type MovePlan =
  /** Nobody's access changes, or the server can't say: move at once, with this access. */
  | { ask: false; access: "keep" | "adopt" }
  /** The move changes who can open the page: ask first, with the preview. */
  | { ask: true; preview: DocMovePreview }

/**
 * Whether a move must be asked about before it is made. offerAdopt is whether
 * the question can offer the new parent's access (Move to… and a crumb can;
 * the tree's drag keeps the page's own): into a page, the preview is then of
 * adopting it.
 */
export async function planMove(req: DocMoveTarget, offerAdopt: boolean): Promise<MovePlan> {
  const adopt = offerAdopt && !!req.parent_uuid
  return movePlanOf(await previewDocMove({ ...req, access: adopt ? "adopt" : "keep" }), adopt)
}

/** planMove's rule, from a preview of the move with adopting offered or not. Pure. */
export function movePlanOf(p: DocMovePreview, adopt: boolean): MovePlan {
  if (!p.available) return { ask: false, access: "keep" }
  // Only full access adopts. Without it the page keeps its access, which a
  // move that leaves its space alone doesn't change (and the server refuses
  // a move into another space without full access).
  if (adopt && p.can_adopt === false) return { ask: false, access: "keep" }
  if (p.lose || p.gain || p.everyone) return { ask: true, preview: p }
  return { ask: false, access: adopt ? "adopt" : "keep" }
}

/**
 * Why a move changes who can open a page whatever becomes of its own access,
 * as the question before it says: the space it goes into, or the one it
 * leaves. Null when only taking the new parent's access would change it. Pure.
 */
export function moveReason(p: Pick<DocMovePreview, "space" | "was">, page: string): string | null {
  if (p.space) return `“${page}” goes into “${p.space.name}”, and everyone in it can open it there.`
  if (p.was) return `“${page}” leaves “${p.was.name}”, and being in it no longer lets people open it.`
  return null
}
