"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { cn } from "@/lib/utils/helpers/cn"

/** Which task moves count: "" for any project, any status. */
export interface TaskMoveFilter {
  projectId: string
  toStatus: string
}

export const ANY_MOVE: TaskMoveFilter = { projectId: "", toStatus: "" }

/** Radix Select cannot hold "", so "any" travels as this and never leaves here. */
const ANY = "__any__"

/**
 * "In project … moves into …" for anything that runs when a task changes
 * status: a workflow, an agent. The status list is the chosen project's own
 * statuses under the built-in one each counts as, or the built-in ones when
 * any project will do. The server resolves and checks what is saved.
 */
export function TaskMoveFilterFields({
  value,
  onChange,
  projects,
}: {
  value: TaskMoveFilter
  onChange: (v: TaskMoveFilter) => void
  projects: { project_uuid: string; project_name: string }[]
}) {
  const { options } = useProjectStatuses(value.projectId || undefined)
  const unknown = value.toStatus && !options.some((o) => o.value === value.toStatus)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-sm font-normal">In project</Label>
        <Select
          value={value.projectId || ANY}
          // A project's own status belongs to that project only.
          onValueChange={(v) => onChange({ projectId: v === ANY ? "" : v, toStatus: "" })}
        >
          <SelectTrigger aria-label="In project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.project_uuid} value={p.project_uuid}>
                {p.project_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-normal">Moves into</Label>
        <Select value={value.toStatus || ANY} onValueChange={(v) => onChange({ ...value, toStatus: v === ANY ? "" : v })}>
          <SelectTrigger aria-label="Moves into">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className={cn(o.custom && "pl-6")}>
                {o.label}
              </SelectItem>
            ))}
            {/* A status named by an AI draft or saved earlier and not in this list: kept, checked on save. */}
            {unknown && <SelectItem value={value.toStatus}>{value.toStatus}</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
