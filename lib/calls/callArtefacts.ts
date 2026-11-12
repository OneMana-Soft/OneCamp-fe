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
    for (const f of ["started_at", "ended_at", "notes_doc", "recap_chat"] as const) {
      const v = text(r[f])
      if (v) a[f] = v
    }
    out.push(a)
  }
  return out
}

/** The calls in an artefacts answer ({ data: [...] }), leaving out anything malformed. Pure. */
export const readArtefacts = (body: unknown): CallArtefact[] => artefactsOf((body as { data?: unknown } | null | undefined)?.data)
