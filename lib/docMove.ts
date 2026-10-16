// Moving a page asks before it changes who can open the page (PROGRAM §3.2).
// Every way of moving one plans here first: Move to… (a sheet on a phone), a
// page dropped on a breadcrumb, and the docs tree's drag and keys. The
// server's preview (POST /doc/move/preview) says what the move would do, and
// refuses whatever the move would.

import { previewDocMove } from "@/services/docGraphService"
import type { DocMovePreview, DocMoveTarget } from "@/types/docGraph"

/** What to do before a move. */
export type MovePlan =
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
