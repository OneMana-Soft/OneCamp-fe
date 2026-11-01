/**
 * What the board's Add from OneCamp panel offers (miro-13 2): the things a card
 * draws (lib/board/cards CARD_KINDS), found by the workspace search or listed
 * from a project, each with the link its card keeps. Where a search hit opens
 * is lib/search/resultPath's one mapping, so the panel offers exactly what a
 * hit would open. The server has already decided what this reader may find,
 * and every card reads its thing again as each reader may see it. Pure.
 */
import { resultPath } from "@/lib/search/resultPath"
import { entityOfHref } from "@/lib/liveEntity/href"
import { CARD_KINDS, cardLink } from "@/lib/board/cards"
import { displayNameOf, type PersonNameFields } from "@/lib/personName"
import type { SearchResult } from "@/services/searchService"

/** One thing the panel offers: what draws its card, and how its row names it. */
export interface WorkPick {
  kind: string
  id: string
  title: string
  /** The row's second line: a task's project or key and who has it; what a doc or a project is. */
  meta: string
  /** A task's status category, for its glyph. */
  status?: string
  /** The card's link: the thing's page on the app's own origin. */
  link: string
}

const joined = (...parts: (string | undefined | null)[]) => parts.filter((p) => !!p && p.trim()).join(" · ")

/** A search hit as the panel offers it, or null for a hit with no card (a channel, a message, a person, a board). */
export function workOfResult(r: SearchResult, origin: string): WorkPick | null {
  const path = resultPath(r, "")
  const ref = path ? entityOfHref(path, origin) : null
  if (!ref || !CARD_KINDS.has(ref.kind)) return null
  const link = cardLink(origin, ref.kind, ref.id)
  if (ref.kind === "task") {
    const t = r.task ?? {}
    return { kind: "task", id: ref.id, title: t.task_name || "Untitled task", meta: joined(t.task_project_name, t.task_assignee_user_full_name), status: t.task_status, link }
  }
  if (ref.kind === "doc") return { kind: "doc", id: ref.id, title: r.doc?.doc_title || "Untitled doc", meta: "Doc", link }
  return { kind: ref.kind, id: ref.id, title: r.project?.project_name || "Untitled project", meta: joined("Project", r.project?.project_team_name), link }
}

/** A project's task as the panel offers it: its key and who has it. */
export function workOfTask(
  t: { task_uuid: string; task_name?: string; task_status?: string; task_key?: string; task_assignee?: PersonNameFields | null },
  origin: string,
): WorkPick | null {
  if (!t.task_uuid) return null
  return {
    kind: "task",
    id: t.task_uuid,
    title: t.task_name || "Untitled task",
    meta: joined(t.task_key, displayNameOf(t.task_assignee)),
    status: t.task_status,
    link: cardLink(origin, "task", t.task_uuid),
  }
}
