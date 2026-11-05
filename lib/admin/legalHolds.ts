/**
 * Retention rules and legal holds (gcal-new-audit-retention H2): the shapes
 * /admin/retention answers with, and the checks and words the admin card
 * (components/admin/LegalHoldsCard) shows. Pure, so the card only presents.
 *
 * A rule removes a kind's items for good once they ended that many days ago
 * (0: off). A hold keeps its people's items, deleted ones included, through
 * every rule until it is released. The server owns both; nothing here decides
 * what is removed.
 */
import type { AxiosInstance } from "axios"

import { localMidnight } from "@/lib/utils/date/localMidnight"

/** The page's own client, handed to the lazy card so the card reaches no shared core (LEAD-RULES, 30 Oct 00:13). */
export type RetentionHttp = Pick<AxiosInstance, "get" | "put" | "post" | "patch">

export interface RetentionRule {
  kind: string
  /** The items as a count reads them: "calendar events". */
  label: string
  help: string
  days: number
  min: number
  max: number
}

export interface RetentionKind {
  name: string
  label: string
  /** What an export writes, the default first ("ics", "json"). */
  formats: string[]
}

export interface RetentionRules {
  rules: RetentionRule[]
  kinds: RetentionKind[]
}

export interface RulePreview {
  days: number
  would_remove: number
}

export interface LegalHold {
  id: string
  name: string
  note: string
  created_by: string
  created_at: string
  updated_at: string
  released_at?: string
  released_by?: string
  people: string[]
}

export interface HeldItem {
  id: string
  title: string
  detail?: string
  start?: string
  end?: string
  start_date?: string
  end_date?: string
  repeats: boolean
  deleted_at?: string
}

export interface HoldQuery {
  q: string
  /** A day, 2026-11-02, or "" for open. */
  from: string
  to: string
}

/** A search answers at most this many items. An export has no cap: past the server's part size it comes in parts, each saying so (ExportPart). */
export const SEARCH_CAP = 200

/** A search's words, at most this long (the server's own limit). */
export const QUERY_MAX = 200

/** A rule's days as typed: a whole number within the rule's bounds (empty is 0, off), or why not. */
export function readDays(draft: string, rule: Pick<RetentionRule, "min" | "max" | "label">): { days: number; error?: undefined } | { error: string } {
  const typed = draft.trim()
  if (typed === "") return { days: 0 }
  if (!/^\d+$/.test(typed)) return { error: `Enter a whole number of days, or 0 to keep all ${rule.label}.` }
  const days = Number(typed)
  if (days < rule.min || days > rule.max) return { error: `Enter from ${rule.min} to ${rule.max.toLocaleString("en")} days.` }
  return { days }
}

/** The days a rule shows in its field: empty when it is off. */
export const daysDraft = (days: number) => (days > 0 ? String(days) : "")

/** What a rule would remove at the next sweep, said before it can be saved. */
export function previewWords(preview: RulePreview, label: string): string {
  if (preview.days === 0) return `Off: no ${label} are removed.`
  if (preview.would_remove === 0) return `None of the workspace's ${label} would be removed at the next sweep.`
  return `${preview.would_remove.toLocaleString("en")} of the workspace's ${label} would be removed at the next sweep.`
}

const upperFirst = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** A saved rule as its offer back names it: "Calendar events removed after 365 days". */
export function ruleWords(label: string, days: number): string {
  return `${upperFirst(label)} removed after ${days.toLocaleString("en")} ${days === 1 ? "day" : "days"}`
}

/** The kinds a hold's search can be for, as its choice names them: "Calendar events", "Boards". */
export function kindChoices(kinds: readonly RetentionKind[]): { value: string; label: string }[] {
  return kinds.map((k) => ({ value: k.name, label: upperFirst(k.label) }))
}

/** A search's own mistake, said before it is sent, in the server's words. */
export function queryError(query: HoldQuery): string | undefined {
  if (query.q.trim().length > QUERY_MAX) return `A search is at most ${QUERY_MAX} characters.`
  if (query.from && query.to && query.to < query.from) return "To comes after from."
  return undefined
}

/**
 * The query a search or an export sends: only what is set. The server keeps what starts from `from` and before
 * `to`, and reads a bare day as 00:00 UTC, so From goes as the admin's own midnight and To as the next day's: the
 * To day is kept whole, wherever the admin is. Text that isn't a day goes as typed, for the server to refuse.
 */
export function queryParams(query: HoldQuery, extra: Record<string, string> = {}): Record<string, string> {
  const params: Record<string, string> = { ...extra }
  const words = query.q.trim()
  if (words) params.q = words
  if (query.from) params.from = localMidnight(query.from) ?? query.from
  if (query.to) params.to = localMidnight(query.to, 1) ?? query.to
  return params
}

/** What a change to a hold's people sends: who joined and who left since it was read. */
export function peopleChange(before: readonly string[], after: readonly string[]): { add: string[]; remove: string[] } {
  const was = new Set(before)
  const now = new Set(after)
  return { add: after.filter((p) => !was.has(p)), remove: before.filter((p) => !now.has(p)) }
}

/**
 * What a change to a hold sends: its name and note as typed (trimmed), who joined and who left; null when it changes
 * nothing, so nothing is sent or offered back (the server records nothing for such a change either).
 */
export function holdChange(
  hold: Pick<LegalHold, "name" | "note" | "people">,
  to: { name: string; note: string; people: readonly string[] },
): { name: string; note: string; add: string[]; remove: string[] } | null {
  const change = { name: to.name.trim(), note: to.note.trim(), ...peopleChange(hold.people, to.people) }
  const same = change.name === hold.name && change.note === hold.note && change.add.length === 0 && change.remove.length === 0
  return same ? null : change
}

/** The file an export saves as, named after the hold as a board's picture is named after the board. */
export function holdFileName(holdName: string, kindLabel: string, format: string, part?: ExportPart): string {
  const base = `${holdName.trim() || "Legal hold"} - ${kindLabel}`.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim()
  const which = part && isPartial(part) ? ` - part ${part.part}` : ""
  return `${base.slice(0, 120).trim()}${which}.${format}`
}

/**
 * One part of a hold's export, as its answer says (X-Exported-Items, X-Export-Part, X-Export-Next): how many items
 * its file holds (null when the answer doesn't say), its number from 1, and the token for the next part, "" when
 * this part is the last.
 */
export interface ExportPart {
  count: number | null
  part: number
  next: string
}

/** An export's part from its answer's headers (axios's, lower-case); a server before parts answers part 1 of 1. */
export function exportPartOf(headers: Record<string, unknown>): ExportPart {
  const count = Number(headers["x-exported-items"])
  const part = Number(headers["x-export-part"])
  const next = headers["x-export-next"]
  return {
    count: headers["x-exported-items"] != null && Number.isInteger(count) && count >= 0 ? count : null,
    part: Number.isInteger(part) && part >= 1 ? part : 1,
    next: typeof next === "string" ? next : "",
  }
}

/** Whether an export's part is one of several: a later part, or one with more after it. */
export const isPartial = (p: ExportPart) => p.part > 1 || p.next !== ""

/**
 * The parts of an export made so far with `made` in its place: one of each part, in order. `replaced` is the
 * one it takes over from (a part made again), so its file can go; every other part made stays (V-431).
 */
export function putPart<T extends { part: ExportPart }>(parts: readonly T[], made: T): { parts: T[]; replaced: T | null } {
  const replaced = parts.find((p) => p.part.part === made.part.part) ?? null
  return { parts: [...parts.filter((p) => p !== replaced), made].sort((a, b) => a.part.part - b.part.part), replaced }
}

/** Where part `n` of an export starts: part 1 at the start (""), any other where the part before it ends; null when no part before it says. */
export function partCursor(parts: readonly { part: ExportPart }[], n: number): string | null {
  if (n === 1) return ""
  return parts.find((p) => p.part.part === n - 1)?.part.next || null
}

/**
 * The first part whose next part was made from somewhere it no longer ends (it was made again after the hold's
 * items changed), so the two don't join up; null when every part starts where the one before it ends.
 */
export function partGap<T extends { part: ExportPart; from: string }>(parts: readonly T[]): T | null {
  return parts.find((p, i) => i + 1 < parts.length && parts[i + 1].from !== p.part.next) ?? null
}

/** What a gap after part `p` means, and the part to make again so the parts join up. */
export function partGapLine(p: ExportPart): string {
  if (!p.next) return `Part ${p.part} now holds all the rest that match, so the parts after it repeat some of it.`
  return `Part ${p.part} came out different when it was made again, so part ${p.part + 1} no longer starts where it ends. Export part ${p.part + 1} again.`
}

/** What a saved export says it holds; a part says which, and whether more remain, so it never passes for the whole. */
export function exportPartLine(p: ExportPart, kindLabel: string): string {
  const n = p.count === null ? "" : p.count.toLocaleString("en-US")
  if (!isPartial(p)) return p.count === null ? "Saved as one file." : p.count === 1 ? "The one match is in this file." : `All ${n} ${kindLabel} that match are in this file.`
  if (p.next) return `Part ${p.part}: the ${p.part === 1 ? "first" : "next"} ${n} ${kindLabel} that match, not all of them. Export part ${p.part + 1} for the rest.`
  return `Part ${p.part}, the last: ${n} more ${kindLabel}. Parts 1 to ${p.part} hold all that match.`
}

/** When a held item happened: an all-day item's first day, else its start; null when it has neither. */
export function itemDay(item: Pick<HeldItem, "start" | "start_date">): Date | null {
  if (item.start_date) {
    const [y, m, d] = item.start_date.split("-").map(Number)
    if (y && m && d) return new Date(y, m - 1, d)
  }
  if (item.start) {
    const at = new Date(item.start)
    if (!Number.isNaN(at.getTime())) return at
  }
  return null
}
