// Where a composer writes, for its "@" list (chat P3, MC-89): its container's
// data-mention-place ("channel:<id>", "dm:<id>", "group:<id>") and, in a
// thread, data-mention-thread, read from the editor's DOM, never the URL.

export type MentionPlaceKind = "channel" | "dm" | "group"

export interface MentionPlace {
  kind: MentionPlaceKind
  id: string
  thread: boolean
}

const PLACE = "data-mention-place"
const THREAD = "data-mention-thread"

/** The attributes a composer's container carries for place. Pure. */
export function mentionPlaceAttrs(kind: MentionPlaceKind, id: string, thread = false): Record<string, string> {
  if (!id) return {}
  return thread ? { [PLACE]: `${kind}:${id}`, [THREAD]: "" } : { [PLACE]: `${kind}:${id}` }
}

/** A place as its attribute writes it, or null. Pure. */
export function parseMentionPlace(value: string | null | undefined, thread: boolean): MentionPlace | null {
  if (!value) return null
  const at = value.indexOf(":")
  const kind = value.slice(0, at)
  const id = value.slice(at + 1)
  if (at < 1 || !id || (kind !== "channel" && kind !== "dm" && kind !== "group")) return null
  return { kind, id, thread }
}

type PlaceEditor = { view?: { dom?: Element | null } } | null | undefined

/** The place of the composer editor writes in: the nearest container that says, or a marker beside one. */
export function mentionPlaceOf(editor: PlaceEditor): MentionPlace | null {
  for (let el = editor?.view?.dom ?? null; el; el = el.parentElement) {
    const at = el.hasAttribute(PLACE) ? el : el.querySelector(`:scope > [${PLACE}]`)
    if (at) return parseMentionPlace(at.getAttribute(PLACE), at.hasAttribute(THREAD))
  }
  return null
}
