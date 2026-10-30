import { loadFailure } from "@/lib/http/loadFailure"
import { apiErrorStatus } from "@/lib/utils/apiError"
import type { GraphHop, GraphKind } from "@/lib/workGraph/workGraph"

/**
 * Who knows (DG9) as the web app reads it: GET /people/who-knows?q= names the
 * people whose work on some words the asker can read, each with up to three
 * items that show it; /people/who-knows/me is a person's own choice to be
 * left out. The server decides every item as the asker and counts nothing
 * they can't open, so nothing here filters; this module words what came back.
 * Shared by both editions: nothing here is AI. Pure, so it is tested without
 * a browser.
 */

export type EvidenceRole = "wrote" | "assigned" | "commented"

export interface WhoKnowsEvidence {
  kind: "doc" | "task" | "message"
  id: string
  title: string
  role: EvidenceRole
  data?: Record<string, unknown>
}

export interface WhoKnowsPerson {
  id: string
  name: string
  avatar_key?: string
  score: number
  /** Docs they wrote. */
  wrote: number
  /** Tasks they created. */
  created: number
  /** Channel messages they posted. */
  posted: number
  /** Tasks they're assigned. */
  assigned: number
  /** Comments they left. */
  commented: number
  evidence: WhoKnowsEvidence[]
}

export interface WhoKnowsAnswer {
  query: string
  considered: number
  people: WhoKnowsPerson[]
  you_hidden: boolean
}

/**
 * A person's line: what they did on the items, with the verbs their rows use
 * ("Wrote 2 · Created 1 · Assigned 1 · Commented on 3"); only what they did.
 */
export function countsLine(p: Partial<Pick<WhoKnowsPerson, "wrote" | "created" | "posted" | "assigned" | "commented">>): string {
  const parts: string[] = []
  if (p.wrote) parts.push(`Wrote ${p.wrote}`)
  if (p.created) parts.push(`Created ${p.created}`)
  if (p.posted) parts.push(`Posted ${p.posted}`)
  if (p.assigned) parts.push(`Assigned ${p.assigned}`)
  if (p.commented) parts.push(`Commented on ${p.commented}`)
  return parts.join(" · ")
}

/**
 * What a person did on an item, as its row says it: the verb fits the kind (a
 * doc is written, a task created or assigned, a message posted).
 */
export function roleLabel(role: EvidenceRole, kind: WhoKnowsEvidence["kind"]): string {
  if (role === "commented") return "Commented on"
  if (role === "assigned") return "Assigned"
  if (kind === "task") return "Created"
  if (kind === "message") return "Posted"
  return "Wrote"
}

/** An evidence item as the work graph's helpers read it (hrefOf, titleOf, KindTile). */
export function evidenceHop(e: WhoKnowsEvidence): GraphHop {
  return { rel: e.role, kind: e.kind as GraphKind, id: e.id, title: e.title, data: e.data }
}

/** What the panel's polite live region says once an answer is in. */
export function answerLabel(a: WhoKnowsAnswer | undefined, words: string): string {
  if (!a) return ""
  const n = a.people.length
  if (!n) return `No one yet for “${words}”`
  return `${n} ${n === 1 ? "person" : "people"} for “${words}”`
}

/** Whether a failed read was the server refusing the asker: not signed in (401), or not a member (no access). */
export function isRefused(error: unknown): boolean {
  return apiErrorStatus(error) === 401 || loadFailure(error) === "no-access"
}
