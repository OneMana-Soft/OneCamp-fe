/**
 * A project list's filters in its address (design v3, work.md W16): the ones
 * a person reads and shares as words, ?status=open, ?status=done,
 * ?assignee=<ids>, ?overdue=1 and ?due=week, and the rest (priority, custom
 * fields, the cycle) as JSON in ?filters=. A count in the header sets them
 * with a push, so Back takes the filter off again. Pure, for its test.
 */
import type { StatusOption } from "@/lib/taskStatus"

export interface ColumnFilter {
  id: string
  value: unknown
}

const OPEN = new Set(["backlog", "todo", "inProgress", "inReview"])
/** The client-side filter "due this week" (the server has no such filter, and ignores the id). */
export const DUE_WEEK = "due_week"
const WORDED = new Set(["task_status", "task_assignee_name", "overdue", DUE_WEEK])

const valuesIn = (options: StatusOption[], open: boolean) => options.filter((o) => (open ? OPEN.has(o.category) : o.category === "done")).map((o) => o.value)

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

export function filtersFromAddress(sp: URLSearchParams, options: StatusOption[]): ColumnFilter[] {
  let rest: ColumnFilter[] = []
  try {
    const parsed = JSON.parse(sp.get("filters") || "[]")
    if (Array.isArray(parsed)) rest = parsed.filter((f) => f && typeof f.id === "string" && !WORDED.has(f.id))
  } catch {
    /* a hand-edited address: no filters */
  }
  const out = [...rest]
  const status = sp.get("status")
  if (status) {
    const values = status === "open" ? valuesIn(options, true) : status === "done" ? valuesIn(options, false) : status.split(",").filter(Boolean)
    if (values.length) out.push({ id: "task_status", value: values })
  }
  const assignee = sp.get("assignee")
  if (assignee) out.push({ id: "task_assignee_name", value: assignee.split(",").filter(Boolean) })
  if (sp.get("overdue") === "1") out.push({ id: "overdue", value: "1" })
  if (sp.get("due") === "week") out.push({ id: DUE_WEEK, value: "1" })
  return out
}

/** Writes filters into params: the worded ones as words, the rest as JSON. Other params are left as they are. */
export function filtersToAddress(params: URLSearchParams, filters: ColumnFilter[], options: StatusOption[]): URLSearchParams {
  for (const k of ["status", "assignee", "overdue", "due", "filters"]) params.delete(k)
  const rest = filters.filter((f) => !WORDED.has(f.id))
  if (rest.length) params.set("filters", JSON.stringify(rest))
  for (const f of filters) {
    if (f.id === "task_status" && Array.isArray(f.value) && f.value.length) {
      const v = f.value.map(String)
      params.set("status", same(v, valuesIn(options, true)) ? "open" : same(v, valuesIn(options, false)) ? "done" : v.join(","))
    }
    if (f.id === "task_assignee_name" && Array.isArray(f.value) && f.value.length) params.set("assignee", f.value.map(String).join(","))
    if (f.id === "overdue") params.set("overdue", "1")
    if (f.id === DUE_WEEK) params.set("due", "week")
  }
  return params
}

/** The address a header count leads to: the list, filtered as the count says, from the current address. */
export function countAddress(current: URLSearchParams, kind: "open" | "overdue" | "week" | "done"): string {
  const p = new URLSearchParams(current.toString())
  for (const k of ["status", "assignee", "overdue", "due", "filters"]) p.delete(k)
  p.set("tab", "list")
  if (kind === "open" || kind === "done") p.set("status", kind)
  if (kind === "overdue") p.set("overdue", "1")
  if (kind === "week") p.set("due", "week")
  return p.toString()
}
