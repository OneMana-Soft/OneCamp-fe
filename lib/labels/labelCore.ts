// What a page that shows a sensitivity label loads first (miro-44 L): the cache
// keys, a label from an answer, and the write. A label's rules are ./labelRules;
// the admin card's whole is ./labels.

import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { LabelRoutes } from "@/services/endpoints/labels"
import type { LabelHttp, LabelKind, SensitivityLabel } from "./labelTypes"

/** The workspace's labels, as a cache key (useFetch). */
export const labelsKey: string = LabelRoutes.Labels

/** The label on one item, as a cache key; "" (no read) without an id. */
export function itemLabelKey(kind: LabelKind, id: string | null | undefined): string {
  return id ? `${LabelRoutes.Items}/${kind}/${encodeURIComponent(id)}` : ""
}

/** A label from an answer, or null for anything that isn't one (none, or an answer of another shape). Pure. */
export function asLabel(v: unknown): SensitivityLabel | null {
  const l = v as Partial<SensitivityLabel> | null | undefined
  if (!l || typeof l.id !== "string" || !l.id || typeof l.name !== "string") return null
  return { id: l.id, name: l.name, colour: typeof l.colour === "string" ? l.colour : "", rank: typeof l.rank === "number" ? l.rank : 0, rules: Array.isArray(l.rules) ? l.rules.filter((r): r is string => typeof r === "string") : [] }
}

/** Puts a label on an item, or takes its label off (null), and answers the label it carries after. */
export async function putItemLabel(http: LabelHttp, kind: LabelKind, id: string, labelId: string | null): Promise<SensitivityLabel | null> {
  const res = await http.put<{ data?: unknown }>(itemLabelKey(kind, id), { label_id: labelId }, OWN_ERRORS)
  return asLabel(res.data?.data)
}
