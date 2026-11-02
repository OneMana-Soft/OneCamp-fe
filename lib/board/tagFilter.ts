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

type Note = BoardElementLike & { x: number; y: number; width: number; height: number; angle?: unknown; backgroundColor?: string }

/** The notes with any of `tags` (as a tag is matched everywhere, whatever its case), in the board's order. Pure. */
export function notesTagged<T extends Note>(elements: readonly T[], tags: readonly string[]): T[] {
  if (tags.length === 0) return []
  const wanted = tagKeys(tags)
  return elements.filter((el) => isStickyNote(el) && hasAnyTag(noteTags(el), wanted))
}
