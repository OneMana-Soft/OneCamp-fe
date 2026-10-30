/**
 * Filter a board by tag (miro-07 5): pick tags, and every note without one of
 * them fades back while the notes with them stay as they are, on the
 * picker's own screen only, until the filter is cleared. Miro's board search
 * can find tagged notes and select them, but shows the rest as they were.
 * These are the rules, pure so they are tested; components/board/tagFilter
 * draws them.
 */
import { isStickyNote, type BoardElementLike } from "@/lib/board/notes"
import { hasAnyTag, noteTags, tagKeys } from "@/lib/board/sticky"
import { sceneToLocal, type BoardView } from "@/lib/board/viewport"

type Note = BoardElementLike & { x: number; y: number; width: number; height: number; angle?: unknown; backgroundColor?: string }

/** The notes with any of `tags` (as a tag is matched everywhere, whatever its case), in the board's order. Pure. */
export function notesTagged<T extends Note>(elements: readonly T[], tags: readonly string[]): T[] {
  if (tags.length === 0) return []
  const wanted = tagKeys(tags)
  return elements.filter((el) => isStickyNote(el) && hasAnyTag(noteTags(el), wanted))
}

/** How far the clear space runs past a note's edge, in screen pixels, so the note reads whole against the veil. */
export const VEIL_MARGIN = 6

/**
 * The veil's holes: an outline for each note the filter keeps, turned as the
 * note is (Excalidraw turns an element about its middle), in canvas pixels
 * from the board's view. Each is its own shape, drawn black in the veil's
 * mask, so two kept notes that overlap stay clear where they meet (one path
 * filled even-odd painted the overlap again). Pure.
 */
export function veilHoles(view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">, notes: readonly Note[], margin = VEIL_MARGIN): string[] {
  const round = (n: number) => Math.round(n * 10) / 10
  const parts: string[] = []
  for (const n of notes) {
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    const pad = margin / view.zoom
    const hw = n.width / 2 + pad
    const hh = n.height / 2 + pad
    const angle = typeof n.angle === "number" ? n.angle : 0
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([dx, dy]) => sceneToLocal(view as BoardView, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos))
    parts.push(`M${corners.map((c) => `${round(c.left)} ${round(c.top)}`).join("L")}Z`)
  }
  return parts
}
