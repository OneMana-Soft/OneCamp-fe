// A new task's address (/app/create/task?title=…&project=Q4), as Linear's
// linear.new: the form opens with what it names, and nothing is made until
// the person sends it, so the server checks it as it checks anything typed.
// It loads only when a link names something (hooks/useTaskAddress), so the
// pages that make tasks don't carry it.

import { TASK_PRIORITIES } from "@/types/taskScale"
import { dayDate, localDay } from "@/lib/utils/timeZone"
import { escapeText } from "@/lib/codec/htmlEscape"
import { TASK_ADDRESS_NAMES } from "@/lib/task/taskAddressParams"

/** What an address names, as the New task form starts from it: "" (or none) for what it doesn't name, or names in a shape no task has. */
export interface PlacedAddress {
  name: string
  /** As the editor holds it: a paragraph a line, as text, never markup. */
  description: string
  /** Midnight of the named day (YYYY-MM-DD) where the reader is. */
  due?: Date
  priority: string
  /** As the form takes them: "launch, web". */
  tags: string
  /** As typed: "2h". */
  estimate: string
  /** The task goes to whoever opens the address (assignee=me). */
  toMe: boolean
  /** The project it names, by key ("Q4", any case) or id. */
  project: string
  /** That project among the reader's. */
  projectAmong<P extends { project_uuid: string; project_key?: string }>(projects: P[] | undefined): P | undefined
  /** The named status's value among a project's, by key ("inReview") or name ("In review"), any case; "" for none. */
  statusAmong(options: readonly { value: string; label: string }[]): string
  /** The named member's id among a project's, by id or a name only one has; "" for none, or for me. Not by email: the list carries none. */
  memberAmong(members: readonly { user_uuid: string; user_name?: string }[] | undefined): string
}

function first(q: URLSearchParams, names: readonly string[]): string {
  for (const n of names) {
    const v = q.get(n)?.trim()
    if (v) return v
  }
  return ""
}

/** What a query's new-task fields name, under Linear's names or ours. Pure. */
export function placeAddress(query: string): PlacedAddress {
  const q = new URLSearchParams(query)
  const priority = first(q, TASK_ADDRESS_NAMES.priority).toLowerCase()
  const day = first(q, TASK_ADDRESS_NAMES.due)
  const due = dayDate(day)
  const description = first(q, TASK_ADDRESS_NAMES.description)
  const project = first(q, TASK_ADDRESS_NAMES.project)
  const status = first(q, TASK_ADDRESS_NAMES.status).toLowerCase()
  const assignee = first(q, TASK_ADDRESS_NAMES.assignee)
  const toMe = assignee.toLowerCase() === "me"
  return {
    name: first(q, TASK_ADDRESS_NAMES.name),
    description: description ? description.split(/\r?\n/).map((line) => `<p>${escapeText(line)}</p>`).join("") : "",
    // dayDate rolls a day no month has (02-30) into the next month.
    due: due && localDay(due) === day ? due : undefined,
    priority: TASK_PRIORITIES.some((p) => p.value === priority) ? priority : "",
    tags: first(q, TASK_ADDRESS_NAMES.tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", "),
    estimate: first(q, TASK_ADDRESS_NAMES.estimate),
    toMe,
    project,
    projectAmong<P extends { project_uuid: string; project_key?: string }>(projects: P[] | undefined): P | undefined {
      if (!project) return undefined
      const key = project.toUpperCase()
      return projects?.find((p) => p.project_uuid === project || p.project_key?.toUpperCase() === key)
    },
    statusAmong(options) {
      return (status && options.find((o) => o.value.toLowerCase() === status || o.label.toLowerCase() === status)?.value) || ""
    },
    memberAmong(members) {
      if (!assignee || toMe || !members) return ""
      if (members.some((m) => m.user_uuid === assignee)) return assignee
      const n = assignee.toLowerCase()
      const byName = members.filter((m) => m.user_name?.toLowerCase() === n)
      return byName.length === 1 ? byName[0].user_uuid : ""
    },
  }
}
