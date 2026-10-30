"use client"

import { useState } from "react"
import { ChevronDown } from "@/lib/icons"
import { MenuCheck } from "@/components/ui/menuCheck"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import TaskTypeGlyph from "@/components/task/TaskTypeGlyph"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { propertyLabel, propertyRow, propertyValue } from "@/lib/ui/propertyRow"
import { projectTypesPath, setTaskType, type ProjectType } from "@/lib/work/keysApi"
import { cn } from "@/lib/utils/helpers/cn"
import type { TaskWorkType } from "@/types/task"

const TASK: TaskWorkType = { id: "", builtin: "task", name: "Task", icon: "task" }

/**
 * The panel's Type row (projects A8K, D-PJ-9): the task's type, a glyph and
 * its name, and for whoever may change the task a picker of the project's
 * types, the built-in ones first. A plain Task shows as Task.
 */
export function TaskTypeField({
  taskUUID,
  projectUUID,
  type,
  canEdit,
  onChanged,
}: {
  taskUUID: string
  projectUUID: string
  type?: TaskWorkType
  canEdit: boolean
  onChanged: (type: TaskWorkType | undefined) => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  // Read when the picker first opens: the row itself needs only the task's own type.
  // Its failure is said in the picker, so the read raises no toast of its own.
  const types = useFetch<{ data: ProjectType[] }>(open ? projectTypesPath(projectUUID) : "", undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const shown = type ?? TASK
  const pick = async (t: ProjectType) => {
    const next = t.builtin === "task" ? "" : t.id
    if ((type?.id ?? "") === next) return
    const before = type
    onChanged(next ? t : undefined)
    try {
      const now = await setTaskType(taskUUID, next)
      onChanged(now ?? undefined)
    } catch (e) {
      onChanged(before)
      toast({ title: "Couldn't change the type", description: apiErrorMessage(e, "It's back to what it was."), tone: "error" })
    }
  }
  const value = (
    <>
      <TaskTypeGlyph type={shown} className="text-ink-2" />
      <span className="truncate">{shown.name}</span>
    </>
  )
  return (
    <div className={propertyRow()} data-property="type">
      <span className={propertyLabel}>Type</span>
      <div className="min-w-0">
        {canEdit ? (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button type="button" className={propertyValue} aria-label={`Type: ${shown.name}. Change it`}>
                {value}
                <ChevronDown aria-hidden className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover/value:opacity-100 group-focus-visible/value:opacity-100 [@media(hover:none)]:opacity-100" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {types.isLoading && <p className="px-2 py-1.5 text-ui-sm text-ink-3">Loading types…</p>}
              {types.isError && <p className="px-2 py-1.5 text-ui-sm text-danger-ink">Couldn&apos;t load the types. Close and try again.</p>}
              {types.data?.data.map((t) => {
                const current = (type?.id ?? "") === (t.builtin === "task" ? "" : t.id)
                return (
                  <DropdownMenuItem key={t.id} onSelect={() => void pick(t)} className="gap-2">
                    <TaskTypeGlyph type={t} className="text-ink-2" />
                    <span className="flex-1 truncate">{t.name}</span>
                    <MenuCheck checked={current} />
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className={cn(propertyValue, "hover:bg-transparent")}>{value}</span>
        )}
      </div>
    </div>
  )
}
