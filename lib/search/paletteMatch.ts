import type { ChannelInfoInterface } from "@/types/channel"
import type { UserDMInterface } from "@/types/user"
import type { ProjectInfoInterface } from "@/types/project"
import type { TeamInfoInterface } from "@/types/team"
import type { DocSidebarInfo } from "@/types/doc"
import type { BoardSidebarInfo } from "@/types/board"
import { displayNameOf } from "@/lib/personName"

/**
 * The palette's own matching, for what it can answer without asking the
 * server: commands, and the channels, people, projects, teams, docs and
 * boards already in the sidebar. Those answer on the keystroke, before the
 * search request has even left; the server's hits join them a moment later.
 * Pure, so the ranking is tested without a palette.
 */

/** Lower case, accents off, a leading # or @ dropped, spaces collapsed. */
export function normaliseQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[#@]+/, "")
}

/**
 * How well a label answers a query, 0 for not at all. The whole label, then
 * its start, then the start of each of its words ("q4 l" finds "Q4 launch"),
 * then anywhere in it, then its keywords.
 */
export function matchScore(query: string, label: string, keywords: readonly string[] = []): number {
  const q = normaliseQuery(query)
  if (!q) return 1
  const l = normaliseQuery(label)
  if (l === q) return 100
  if (l.startsWith(q)) return 80
  const words = l.split(/[\s\-_/·.,:]+/).filter(Boolean)
  if (q.split(" ").every((w) => words.some((x) => x.startsWith(w)))) return 60
  if (l.includes(q)) return 40
  const kws = keywords.map(normaliseQuery)
  if (kws.some((k) => k.startsWith(q))) return 30
  if (kws.some((k) => k.includes(q))) return 20
  return 0
}

/**
 * The score from which a query names the thing: the whole name, its start, or
 * the start of each of its words ("q4 l" for "Q4 launch"). Below it, the query
 * is only somewhere inside the name or in a keyword, a guess like the
 * search's own full-text hits, and it ranks under them.
 */
export const NAMED_MATCH = 60

export type TargetKind = "channel" | "chat" | "project" | "team" | "doc" | "board"

/** A place the palette can jump to without searching. */
export interface PaletteTarget {
  kind: TargetKind
  id: string
  label: string
  path: string
  /** Words it can also be found by, such as a DM's people. */
  keywords?: string[]
  /** For a channel: private ones carry a lock. */
  isPrivate?: boolean
  /** Whose colour it wears, when that isn't its own id: a DM, the person's. */
  hueId?: string
}

interface SidebarLike {
  userChannels?: ChannelInfoInterface[]
  userChats?: UserDMInterface[]
  userProjects?: ProjectInfoInterface[]
  userTeams?: TeamInfoInterface[]
  userDocs?: DocSidebarInfo[]
  userBoards?: BoardSidebarInfo[]
}

/** Everything in the sidebar, as places to jump to. Pure. */
export function paletteTargets(sidebar: SidebarLike, selfId: string | undefined): PaletteTarget[] {
  const out: PaletteTarget[] = []
  for (const c of sidebar.userChannels ?? []) {
    if (c?.ch_uuid && c.ch_name) out.push({ kind: "channel", id: c.ch_uuid, label: c.ch_name, path: `/app/channel/${c.ch_uuid}`, isPrivate: !!c.ch_private })
  }
  for (const dm of sidebar.userChats ?? []) {
    if (!dm?.dm_grouping_id) continue
    const others = (dm.dm_participants ?? []).filter((p) => p?.user_uuid && p.user_uuid !== selfId)
    const names = others.map((p) => displayNameOf(p)).filter(Boolean)
    if (names.length === 0) continue
    // A DM's grouping id is the two people's ids with a space between them.
    const isDirect = dm.dm_grouping_id.includes(" ")
    const path = isDirect ? `/app/chat/${others[0].user_uuid}` : `/app/chat/group/${dm.dm_grouping_id}`
    out.push({ kind: "chat", id: dm.dm_grouping_id, label: names.join(", "), path, keywords: others.map((p) => p.user_full_name || "").filter(Boolean), hueId: isDirect ? others[0].user_uuid : dm.dm_grouping_id })
  }
  for (const p of sidebar.userProjects ?? []) {
    if (p?.project_uuid && p.project_name) out.push({ kind: "project", id: p.project_uuid, label: p.project_name, path: `/app/project/${p.project_uuid}` })
  }
  for (const t of sidebar.userTeams ?? []) {
    if (t?.team_uuid && t.team_name) out.push({ kind: "team", id: t.team_uuid, label: t.team_name, path: `/app/team/${t.team_uuid}` })
  }
  for (const d of sidebar.userDocs ?? []) {
    if (d?.doc_uuid) out.push({ kind: "doc", id: d.doc_uuid, label: d.doc_title || "Untitled doc", path: `/app/doc/${d.doc_uuid}` })
  }
  for (const b of sidebar.userBoards ?? []) {
    if (b?.board_uuid) out.push({ kind: "board", id: b.board_uuid, label: b.board_title || "Untitled board", path: `/app/board/${b.board_uuid}` })
  }
  return out
}

/** The best matches for a query, best first, ties in sidebar order. Pure. */
export function rankTargets<T extends { label: string; keywords?: readonly string[] }>(query: string, items: readonly T[], limit = 6): T[] {
  if (!normaliseQuery(query)) return []
  return items
    .map((item, i) => ({ item, i, score: matchScore(query, item.label, item.keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item)
}
