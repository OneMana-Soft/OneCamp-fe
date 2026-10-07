"use client"

// What a task waits on, and what waits on it (finish to start: a task can
// start once the tasks it waits on are done), in the task's panel. Open the
// other task, take a dependency off, or add one from the project's tasks: the
// keyboard's way to what the timeline draws as arrows.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useFetch } from "@/hooks/useFetch"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useTaskDependencies } from "@/hooks/useTaskDependencies"
import { Loader2, Plus, X } from "@/lib/icons"
import { isClosedStatus } from "@/lib/taskStatus"
import { dotColor, type TimelineData } from "@/lib/timeline"
import { timelineKey } from "@/lib/timelineKey"
import { cn } from "@/lib/utils/helpers/cn"
import type { DependencyTask } from "@/types/task"

export function TaskDependencies({
  taskUUID,
  projectUUID,
  canEdit,
  waitingOn,
  blocking,
  onOpen,
}: {
  taskUUID: string
  projectUUID: string
  canEdit: boolean
  waitingOn: DependencyTask[]
  blocking: DependencyTask[]
  onOpen: (taskUUID: string) => void
}) {
  const setDependency = useTaskDependencies(projectUUID)
  const { options } = useProjectStatuses(projectUUID)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  // What it could wait on: the project's tasks, from the timeline's list, read when the picker opens.
  const project = useFetch<{ data: TimelineData }>(open ? timelineKey(projectUUID) : "")
  const taken = React.useMemo(
    () => new Set([taskUUID, ...waitingOn.map((t) => t.task_uuid), ...blocking.map((t) => t.task_uuid)]),
    [taskUUID, waitingOn, blocking],
  )
  const choices = (project.data?.data.tasks ?? []).filter((t) => !taken.has(t.task_uuid) && t.task_status !== "canceled" && !t.task_uuid.startsWith("temp-"))

  const change = async (waiting: string, on: string, remove: boolean) => {
    setBusy(true)
    await setDependency(waiting, on, remove)
    setBusy(false)
  }
  const stillOpen = waitingOn.filter((t) => !isClosedStatus(t.task_status)).length

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="inline">Dependencies</Label>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid gap-3">
        {waitingOn.length > 0 && (
          <DependencyGroup
            title={stillOpen > 0 ? `Waiting on (${stillOpen} still open)` : "Waiting on"}
            tasks={waitingOn}
            options={options}
            canEdit={canEdit}
            busy={busy}
            onOpen={onOpen}
            onRemove={(id) => void change(taskUUID, id, true)}
            removeLabel={(name) => `Stop waiting on ${name}`}
          />
        )}
        {blocking.length > 0 && (
          <DependencyGroup
            title="Blocking"
            tasks={blocking}
            options={options}
            canEdit={canEdit}
            busy={busy}
            onOpen={onOpen}
            onRemove={(id) => void change(id, taskUUID, true)}
            removeLabel={(name) => `Stop ${name} waiting on this task`}
          />
        )}
        {waitingOn.length === 0 && blocking.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {canEdit ? "Add a task this one can't start without. The timeline draws it as an arrow." : "It doesn't wait on another task."}
          </p>
        )}
        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-fit gap-1.5 px-2 text-xs" disabled={busy}>
                <Plus className="h-3.5 w-3.5" />
                Waits on…
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Find a task in this project" />
                <CommandList>
                  <CommandEmpty>{project.isLoading ? "Loading…" : "No task to pick."}</CommandEmpty>
                  <CommandGroup>
                    {choices.map((t) => (
                      <CommandItem
                        key={t.task_uuid}
                        value={`${t.task_name} ${t.task_uuid}`}
                        onSelect={() => {
                          setOpen(false)
                          void change(taskUUID, t.task_uuid, false)
                        }}
                      >
                        <span aria-hidden className={cn("mr-2 h-2 w-2 shrink-0 rounded-full", dotColor(t, options))} />
                        <span className="truncate">{t.task_name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

function DependencyGroup({
  title,
  tasks,
  options,
  canEdit,
  busy,
  onOpen,
  onRemove,
  removeLabel,
}: {
  title: string
  tasks: DependencyTask[]
  options: ReturnType<typeof useProjectStatuses>["options"]
  canEdit: boolean
  busy: boolean
  onOpen: (taskUUID: string) => void
  onRemove: (taskUUID: string) => void
  removeLabel: (name: string) => string
}) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs text-muted-foreground">{title}</p>
      {tasks.map((t) => (
        <div key={t.task_uuid} className="group flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 transition-colors hover:bg-accent/40">
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dotColor(t, options))} />
          <button
            type="button"
            onClick={() => onOpen(t.task_uuid)}
            className={cn("min-w-0 flex-1 truncate text-left text-sm", isClosedStatus(t.task_status) && "text-muted-foreground line-through")}
          >
            {t.task_name}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(t.task_uuid)}
              disabled={busy}
              aria-label={removeLabel(t.task_name)}
              className="pointer-events-none shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
