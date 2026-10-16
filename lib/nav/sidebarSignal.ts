import { formatCount } from "@/lib/utils/helpers/formatCount"
import type { DesktopChildrenNavType } from "@/types/nav"

/**
 * What a sidebar row, or a folded section, says beside its name (decisions
 * D-S3 and D-S4): "does anyone need me?" answered at a glance.
 *
 * - A channel with unread posts is bold, with no number.
 * - Mentions of you add "@2" on the brand badge, a muted channel's too.
 * - A DM shows its count on the brand badge.
 * - A muted row is never bold.
 * - A folded section shows the badge if a row in it has one, else a dot when
 *   something in it is unread.
 */
export interface SidebarSignal {
  /** The brand badge's text: "@2" for mentions of you, "3" for a DM's unread. */
  badge?: string
  /** Unread with nothing that needs you: the row is bold, a folded section shows a dot. */
  unread: boolean
  /** What a screen reader hears after the name: ", 2 mentions", ", 3 unread", ", unread". */
  spoken: string
}

type Row = Pick<DesktopChildrenNavType, "unread_count" | "mentions" | "badge" | "muted">

const mentionWords = (n: number) => `, ${n} ${n === 1 ? "mention" : "mentions"}`

/** A row's signal. Pure. */
export function rowSignal(row: Row): SidebarSignal {
  const unread = Math.max(0, row.unread_count || 0)
  const mentions = Math.max(0, row.mentions || 0)
  if (row.badge) {
    return { badge: unread ? formatCount(unread) : undefined, unread: unread > 0 && !row.muted, spoken: unread ? `, ${unread} unread` : "" }
  }
  if (mentions) return { badge: `@${formatCount(mentions)}`, unread: !row.muted, spoken: mentionWords(mentions) }
  const bold = unread > 0 && !row.muted
  return { unread: bold, spoken: bold ? ", unread" : "" }
}

/** A folded section's signal: its rows' badges added up, else a dot for anything unread. Pure. */
export function sectionSignal(rows: readonly Row[]): SidebarSignal {
  let dms = 0
  let mentions = 0
  let unread = false
  for (const row of rows) {
    if (row.badge) dms += Math.max(0, row.unread_count || 0)
    else mentions += Math.max(0, row.mentions || 0)
    unread ||= rowSignal(row).unread
  }
  if (dms + mentions === 0) return { unread, spoken: unread ? ", unread" : "" }
  // A section holds channels or conversations, so one of the two is 0.
  if (!dms) return { badge: `@${formatCount(mentions)}`, unread, spoken: mentionWords(mentions) }
  return { badge: formatCount(dms + mentions), unread, spoken: `, ${dms + mentions} unread` }
}
