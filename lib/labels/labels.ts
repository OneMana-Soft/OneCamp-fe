/**
 * Sensitivity labels (miro-44 L): a workspace admin names labels, each with
 * rules; a label put on a board or a doc makes its rules hold, on the server.
 * This module is the whole of it, for the admin card and the tests: the shapes
 * (./labelTypes), the core a page reads and writes through (./labelCore), a
 * label's rules and their words (./labelRules), and the admin's drafts and calls.
 *
 * Who does what (the server decides; these screens follow it):
 * - workspace admins define, change and remove labels (Settings → Security);
 * - anyone who can edit a board or a doc puts a label on it;
 * - only the item's owner or an admin lowers or takes off its label (a label
 *   with fewer rules or a lower level), so an editor can't strip one to export;
 * - members see the label; guests never do (the routes are members' only).
 */

import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { LabelRoutes } from "@/services/endpoints/labels"
import type { LabelCatalogue, LabelHttp, SensitivityLabel } from "./labelTypes"

export type * from "./labelTypes"
export * from "./labelCore"
export * from "./labelRules"

/** A label as an admin defines or changes it. */
export interface LabelDraft {
  name: string
  colour: string
  rank: number
  rules: string[]
}

/** A draft as the server takes it: the name's spaces folded, the rules once each. Pure. */
export function draftBody(d: LabelDraft): LabelDraft {
  return { name: d.name.trim().replace(/\s+/g, " "), colour: d.colour, rank: d.rank, rules: Array.from(new Set(d.rules)) }
}

/** Why a draft can't be saved yet, in the card's words; "" when it can. Pure. */
export function draftProblem(d: LabelDraft, others: SensitivityLabel[] = [], self?: string): string {
  const name = d.name.trim().replace(/\s+/g, " ")
  if (!name) return "A label needs a name."
  if ([...name].length > 60) return "A label's name is at most 60 characters."
  if (!Number.isInteger(d.rank) || d.rank < 0 || d.rank > 100) return "A label's level is from 0 to 100."
  if (others.some((l) => l.id !== self && l.name.toLowerCase() === name.toLowerCase())) return "Another label has that name. Choose another."
  return ""
}

export async function loadLabels(http: LabelHttp): Promise<LabelCatalogue> {
  const res = await http.get<{ data?: Partial<LabelCatalogue> }>(LabelRoutes.Labels, OWN_ERRORS)
  return { labels: res.data?.data?.labels ?? [], rules: res.data?.data?.rules ?? [] }
}

export async function defineLabel(http: LabelHttp, d: LabelDraft): Promise<SensitivityLabel> {
  const res = await http.post<{ data: SensitivityLabel }>(LabelRoutes.Admin, draftBody(d), OWN_ERRORS)
  return res.data.data
}

export async function changeLabel(http: LabelHttp, id: string, d: LabelDraft): Promise<SensitivityLabel> {
  const res = await http.patch<{ data: SensitivityLabel }>(`${LabelRoutes.Admin}/${encodeURIComponent(id)}`, draftBody(d), OWN_ERRORS)
  return res.data.data
}

export async function removeLabel(http: LabelHttp, id: string): Promise<void> {
  await http.post(`${LabelRoutes.Admin}/${encodeURIComponent(id)}/remove`, undefined, OWN_ERRORS)
}
