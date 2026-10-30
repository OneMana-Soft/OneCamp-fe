import { answerLimit, answerProblem } from "@/lib/forms/answers"
import type { Answers } from "@/lib/forms/branch"
import { linkFills, type FormField } from "@/lib/forms/forms"

/** The questions a link can answer, by id and by label (any case; a label two share names the first). */
function linkNames(fields: FormField[]): Map<string, FormField> {
  const byName = new Map<string, FormField>()
  for (const f of fields) {
    if (!linkFills(f.type)) continue
    byName.set(f.id.toLowerCase(), f)
    if (!byName.has(f.label.trim().toLowerCase())) byName.set(f.label.trim().toLowerCase(), f)
  }
  return byName
}

/**
 * A form link's answers given ahead (tables B5b, Airtable's prefill_): each
 * `prefill_<question>=<value>` in the link's query, the question named by its
 * id or its label (any case). A tick takes true, 1 or yes; a multi-select its
 * choices split by commas; a choice must be one of its options. Sections and
 * file questions take nothing, and a value the question can't take is left
 * out, so the visitor (or, for a hidden question, nobody) answers it. Pure.
 */
export function prefilled(fields: FormField[], query: string): Answers {
  const out: Answers = {}
  const byName = linkNames(fields)
  new URLSearchParams(query).forEach((raw, key) => {
    if (!key.toLowerCase().startsWith("prefill_")) return
    const f = byName.get(key.slice("prefill_".length).trim().toLowerCase())
    const value = raw.trim()
    if (!f || !value || f.id in out) return
    switch (f.type) {
      case "checkbox":
        if (/^(true|1|yes)$/i.test(value)) out[f.id] = true
        return
      case "select": {
        const o = f.options?.find((x) => x.toLowerCase() === value.toLowerCase())
        if (o) out[f.id] = o
        return
      }
      case "multi_select": {
        const picked = value.split(",").map((v) => f.options?.find((x) => x.toLowerCase() === v.trim().toLowerCase())).filter((x): x is string => !!x)
        if (picked.length) out[f.id] = [...new Set(picked)]
        return
      }
      default:
        out[f.id] = value.slice(0, answerLimit(f.type))
    }
  })
  return out
}

/**
 * The form's questions as a link shows them (tables B5c, Airtable's hide_): each
 * `hide_<question>=true` (or 1, yes) in the link's query, the question named as
 * prefill_ names it, is hidden for that visit, as a hidden question is: never
 * drawn, its link's answer sent unseen. Only a question its managers marked
 * (link_hides; main, 28 Oct): any other stays in sight, its prefill there to
 * change. It hides only while its answer passes the check Send makes
 * (answerProblem): a required one the link doesn't answer (`filled`, from
 * prefilled) stays, since nobody else could answer it, and so does any the link
 * answers in a way it can't take, so the visitor can put it right rather than
 * meet a refusal about a question they can't see. Pure.
 */
export function linkHides(fields: FormField[], query: string, filled: Answers): FormField[] {
  const byName = linkNames(fields)
  const hide = new Set<string>()
  new URLSearchParams(query).forEach((raw, key) => {
    if (!key.toLowerCase().startsWith("hide_") || !/^(true|1|yes)$/i.test(raw.trim())) return
    const f = byName.get(key.slice("hide_".length).trim().toLowerCase())
    if (f?.link_hides && !f.hidden && !answerProblem(f, filled[f.id])) hide.add(f.id)
  })
  return hide.size ? fields.map((f) => (hide.has(f.id) ? { ...f, hidden: true } : f)) : fields
}
