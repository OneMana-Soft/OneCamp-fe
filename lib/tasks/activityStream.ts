/**
 * A task's activity as one stream (design v3, work.md W32): its history and
 * its comments in time order. Consecutive changes by one person within five
 * minutes read as one line ("Sam changed status, priority and due date"), so
 * a burst of edits is a sentence, not a wall. Pure, for its test.
 */
import type { TaskActivityInterface } from "@/types/task"

/** What a change names, for the collapsed line. Kinds not here are events that stand alone. */
const CHANGED: Record<string, string> = {
  statusUpdate: "status",
  priorityUpdate: "priority",
  assigneeUpdate: "assignee",
  startDateUpdate: "start date",
  endDateUpdate: "due date",
  nameUpdate: "title",
  labelUpdate: "labels",
  descUpdate: "description",
  estimate: "estimate",
  points: "points",
  typeUpdate: "type",
}

/** History kinds that are comments: the stream shows the comments themselves. */
const COMMENT_KINDS = new Set(["commentAdd", "commentUpdate", "commentDelete"])

export const COLLAPSE_MS = 5 * 60 * 1000

export interface HistoryLine {
  kind: "history"
  /** The first change, which a single line reads from. */
  first: TaskActivityInterface
  /** Every change folded into this line, oldest first. */
  changes: TaskActivityInterface[]
  at: number
}

/** The field a change names: a custom field's own name, else the kind's noun. */
export function changedField(a: TaskActivityInterface): string | null {
  if (a.activity_type === "fieldUpdate") return a.activity_next_state || "a field"
  return CHANGED[a.activity_type] ?? null
}

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

/**
 * The history, oldest first, with each run of one person's changes within
 * five minutes of the one before folded into a line. Events that are not
 * field changes (created the task, added an attachment) stand alone.
 */
export function collapseHistory(activities: TaskActivityInterface[] | undefined): HistoryLine[] {
  const sorted = [...(activities ?? [])].filter((a) => !COMMENT_KINDS.has(a.activity_type)).sort((a, b) => time(a.activity_time) - time(b.activity_time))
  const out: HistoryLine[] = []
  for (const a of sorted) {
    const prev = out[out.length - 1]
    const last = prev?.changes[prev.changes.length - 1]
    const foldable =
      prev &&
      last &&
      changedField(a) !== null &&
      changedField(last) !== null &&
      last.activity_by?.user_uuid === a.activity_by?.user_uuid &&
      time(a.activity_time) - time(last.activity_time) <= COLLAPSE_MS
    if (foldable) prev.changes.push(a)
    else out.push({ kind: "history", first: a, changes: [a], at: time(a.activity_time) })
  }
  return out
}

/** "status, priority and due date": the fields a folded line changed, each once. */
export function changedList(line: HistoryLine): string {
  const names = [...new Set(line.changes.map(changedField).filter((n): n is string => !!n))]
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export interface CommentRun {
  kind: "comments"
  /** Where the run starts in the task's comments, so their handlers keep the right index. */
  start: number
  end: number
  at: number
}

export type StreamItem = HistoryLine | CommentRun

/**
 * History lines and runs of comments, in time order. Comments that follow
 * one another with no history between stay one run, so they keep their
 * grouping as replies.
 */
export function buildStream(history: HistoryLine[], comments: { comment_created_at?: string }[]): StreamItem[] {
  const items: StreamItem[] = []
  let h = 0
  let c = 0
  while (h < history.length || c < comments.length) {
    const ct = c < comments.length ? time(comments[c].comment_created_at) : Infinity
    if (h < history.length && history[h].at <= ct) {
      items.push(history[h++])
      continue
    }
    const start = c
    while (c < comments.length && (h >= history.length || time(comments[c].comment_created_at) < history[h].at)) c++
    items.push({ kind: "comments", start, end: c, at: ct })
  }
  return items
}

/** "now", "5 m", "2 h", "3 d", then a date: the stream's quiet time. */
export function shortAgo(iso: string | undefined, now: number = Date.now()): string {
  const t = time(iso)
  if (!t) return ""
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)} m`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d`
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
