/**
 * Notes on a board, read the way people see them: a sticky is a shape with
 * text bound inside it, and the text is a separate element. Selecting either
 * one means "this note". Pure, so turning notes into tasks is tested.
 */

export interface BoardElementLike {
  id: string
  type: string
  text?: string
  isDeleted?: boolean
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  customData?: Record<string, unknown>
}

export interface SelectedNote {
  /** The element that represents the note: the container if there is one. */
  noteId: string
  text: string
  /** Set when this note already became a task, so it is not created twice. */
  taskUuid?: string
}

/** The notes behind a selection, one per note, in scene order, with clean text. */
export function selectedNotes(elements: readonly BoardElementLike[], selectedIds: Record<string, boolean>): SelectedNote[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const out: SelectedNote[] = []
  for (const el of elements) {
    if (el.isDeleted) continue
    let note: BoardElementLike | undefined
    let textEl: BoardElementLike | undefined
    if (el.type === "text") {
      textEl = el
      note = el.containerId ? byId.get(el.containerId) ?? el : el
    } else {
      const bound = el.boundElements?.find((b) => b.type === "text")
      if (!bound) continue
      note = el
      textEl = byId.get(bound.id)
    }
    if (!note || !textEl || note.isDeleted || textEl.isDeleted || seen.has(note.id)) continue
    if (!selectedIds[el.id] && !selectedIds[note.id] && !selectedIds[textEl.id]) continue
    const text = (textEl.text ?? "").replace(/\s+/g, " ").trim()
    if (!text) continue
    seen.add(note.id)
    const taskUuid = typeof note.customData?.taskUuid === "string" ? (note.customData.taskUuid as string) : undefined
    out.push({ noteId: note.id, text: text.slice(0, 200), taskUuid })
  }
  return out
}
