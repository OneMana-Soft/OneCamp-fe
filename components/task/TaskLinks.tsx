"use client"

// A task's links to other tasks in its panel (jira-01 J-H): it relates to,
// duplicates or clones another, in the server's words, each with the other
// task's key, name and status and a way in. Whoever may change the task links
// one of its project's tasks, or takes a link off (the server keeps it,
// stamped with who); anyone else reads them. The server sends only tasks the
// reader may see. Blocking is no link: it is a dependency, just above.

import * as React from "react"
import { ProjectTaskPick } from "@/components/task/ProjectTaskPick"
import { useProjectTaskChoices } from "@/components/task/projectTaskChoices"
import { rowRemove, statusLead } from "@/components/task/TaskDependencies"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { Button } from "@/components/ui/button"
import { ChipChoice } from "@/components/ui/chipChoice"
import { PartRetry } from "@/components/ui/part-retry"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { Loader2, Plus, X } from "@/lib/icons"
import { isClosedStatus, statusOptionOf } from "@/lib/taskStatus"
import { inlineAdd } from "@/lib/ui/fieldRow"
import { panelSection } from "@/lib/ui/propertyRow"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { changeTaskLink, LINK_WAYS, taskLinksPath, type TaskLink } from "@/lib/work/hierarchy"

export function TaskLinks({
  taskUUID,
  projectUUID,
  canEdit,
  onOpen,
}: {
  taskUUID: string
  projectUUID: string
  canEdit: boolean
  onOpen: (taskUUID: string) => void
}) {
  const read = useFetch<{ links: TaskLink[]; count: number }>(taskLinksPath(taskUUID), undefined, undefined, OWN_ERRORS)
  const { options } = useProjectStatuses(projectUUID)
  const [busy, setBusy] = React.useState(false)
  const links = read.data?.links

  const change = async (link: Pick<TaskLink, "kind" | "direction"> & { other: string }, remove: boolean) => {
    setBusy(true)
    try {
      await changeTaskLink(taskUUID, link.other, link.kind, link.direction, remove)
      await read.mutate()
      return true
    } catch (e) {
      toast({ title: remove ? "The link wasn't taken off" : "The link wasn't made", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
      return false
    } finally {
      setBusy(false)
    }
  }

  // The links in the server's order, each kind under its words ("relates to").
  const groups = React.useMemo(() => {
    const by = new Map<string, TaskLink[]>()
    for (const l of links ?? []) by.set(l.label, [...(by.get(l.label) ?? []), l])
    return [...by]
  }, [links])

  return (
    <section className="mb-4" data-task-links="">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={panelSection}>Linked tasks</h3>
        {(busy || (read.isLoading && !links)) && <Loader2 aria-label="Loading" className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid gap-3">
        {read.isError && !links ? (
          <PartRetry what="the linked tasks" retry={() => void read.mutate()} />
        ) : (
          <>
            {groups.map(([label, list]) => (
              <div key={label} className="grid" data-link-group={label}>
                <p className="mb-0.5 text-meta text-ink-3">{label}</p>
                {list.map((l) => {
                  const status = statusOptionOf({ task_status: l.task.status }, options)
                  return (
                    <div key={`${l.kind}:${l.direction}:${l.task.uuid}`} data-task-link="" className="group -mx-1 flex h-[30px] items-center gap-2 rounded-md px-1 transition-colors hover:bg-hover">
                      {status ? <TaskStatusCell status={status} label="tip" /> : <span className="size-4 shrink-0" />}
                      {l.task.key && <span className="shrink-0 text-meta font-[510] tabular-nums text-ink-3">{l.task.key}</span>}
                      <button
                        type="button"
                        onClick={() => onOpen(l.task.uuid)}
                        className={cn("min-w-0 flex-1 truncate text-left text-sm font-[450]", isClosedStatus(l.task.status) && "text-ink-3 line-through decoration-ink-4")}
                      >
                        {l.task.name}
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => void change({ kind: l.kind, direction: l.direction, other: l.task.uuid }, true)}
                          disabled={busy}
                          aria-label={`Take off "${l.label} ${l.task.name}"`}
                          className={rowRemove}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            {links?.length === 0 && !canEdit && <p className="text-sm text-muted-foreground">It isn&apos;t linked to another task.</p>}
            {canEdit && links && <AddLink taskUUID={taskUUID} projectUUID={projectUUID} options={options} busy={busy} onAdd={(way, other) => change({ ...way, other }, false)} />}
          </>
        )}
      </div>
    </section>
  )
}

/** Each way a link reads, by its place in LINK_WAYS, as the chip row offers it. */
const WAY_CHOICES = LINK_WAYS.map((w, i) => ({ value: String(i), label: w.label }))

/** "Link a task": how it links, over the shared task picker (a sheet on a phone); the pick makes the link. */
function AddLink({
  taskUUID,
  projectUUID,
  options,
  busy,
  onAdd,
}: {
  taskUUID: string
  projectUUID: string
  options: ReturnType<typeof useProjectStatuses>["options"]
  busy: boolean
  onAdd: (way: (typeof LINK_WAYS)[number], other: string) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(false)
  const [way, setWay] = React.useState(0)
  // What it could link to: the project's tasks, read when the picker opens (Dependencies' read).
  const pick = useProjectTaskChoices(projectUUID, open, new Set([taskUUID]))
  const link = async (other: string) => {
    if (await onAdd(LINK_WAYS[way], other)) setOpen(false)
  }

  return (
    <ProjectTaskPick
      open={open}
      onOpenChange={setOpen}
      {...pick}
      // It closes once the link is made: a refused one leaves it open to pick again.
      keepOpen
      lead={statusLead(options)}
      head={
        <>
          <ChipChoice label="How it links" value={String(way)} onValueChange={(v) => setWay(Number(v))} options={WAY_CHOICES} />
          <p className="mt-2 text-meta text-ink-3">Blocking isn&apos;t a link: add it under Dependencies, where it moves the dates.</p>
        </>
      }
      onPick={(t) => void link(t.task_uuid)}
    >
      <Button type="button" variant="ghost" size="sm" className={cn(inlineAdd, "w-fit")} disabled={busy}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Link a task
      </Button>
    </ProjectTaskPick>
  )
}
