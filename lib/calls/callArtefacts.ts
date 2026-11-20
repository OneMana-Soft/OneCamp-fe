/**
 * What a call kept, wherever a list of calls shows it (an event's "Recordings & notes", meet-02; a board's calls,
 * miro-27): its transcript on its session's node, with its notes and where its recap went, and its recordings, each
 * by its key. The server answers both lists with the same rows (domain/Recording CallArtefact). Pure.
 */

export interface CallArtefact {
  key: string
  started_at?: string
  ended_at?: string
  lines: number
  notes_doc?: string
  recap_chat?: string
  recorded: boolean
  /** Its recap's words (summary and decisions, as the model wrote them), for whoever may read its transcript (gcal-new-event-notes). */
  recap?: string
  /** Its recap's action items, by their place in the list (the Make task route's index). */
  action_items?: ActionItem[]
}

/** One of a recap's action items: what, who when it names them, by when (YYYY-MM-DD), and its task once made. */
export interface ActionItem {
  text: string
  owner?: string
  due?: string
  task?: string
}

/** A recap's action items, a malformed one kept as an empty place so each keeps its index. Pure. */
function itemsOf(list: unknown): ActionItem[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined
  return list.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const it: ActionItem = { text: text(r.text) ?? "" }
    for (const f of ["owner", "due", "task"] as const) {
      const v = text(r[f])
      if (v) it[f] = v
    }
    return it
  })
}

const text = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined)

/** A list's artefacts, leaving out anything malformed. Pure. */
export function artefactsOf(list: unknown): CallArtefact[] {
  if (!Array.isArray(list)) return []
  const out: CallArtefact[] = []
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>
    const key = text(r.key)
    if (!key) continue
    const a: CallArtefact = { key, lines: typeof r.lines === "number" && r.lines > 0 ? r.lines : 0, recorded: r.recorded === true }
    for (const f of ["started_at", "ended_at", "notes_doc", "recap_chat", "recap"] as const) {
      const v = text(r[f])
      if (v) a[f] = v
    }
    const items = itemsOf(r.action_items)
    if (items) a.action_items = items
    out.push(a)
  }
  return out
}

/** The calls in an artefacts answer ({ data: [...] }), leaving out anything malformed. Pure. */
export const readArtefacts = (body: unknown): CallArtefact[] => artefactsOf((body as { data?: unknown } | null | undefined)?.data)
