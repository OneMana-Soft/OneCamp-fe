"use client"

// What a task waits on, and what waits on it, in the task's panel. Open the
// other task, take a dependency off, add one from the project's tasks (finish
// to start: it can start once the other is done), or change how one works:
// start to start, finish to finish or start to finish, and a lag. The
// keyboard's way to what the timeline draws as arrows.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useFetch } from "@/hooks/useFetch"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useTaskDependencies } from "@/hooks/useTaskDependencies"
import { Loader2, Plus, X } from "@/lib/icons"
import { isClosedStatus } from "@/lib/taskStatus"
import { DEPENDENCY_KINDS, KIND_LABEL, MAX_LAG, parseLag, wayOf, waySentence, wayShort, type DependencyKind, type DependencyWay } from "@/lib/tasks/dependency"
import { dotColor, type TimelineData } from "@/lib/timeline"
import { timelineKey } from "@/lib/timelineKey"
import { cn } from "@/lib/utils/helpers/cn"
import type { DependencyTask } from "@/types/task"

export function TaskDependencies({
  taskUUID,
  taskName,
  projectUUID,
  canEdit,
  waitingOn,
  blocking,
  onOpen,
}: {
  taskUUID: string
  taskName: string
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

  const change = async (waiting: string, on: string, remove: boolean, way?: DependencyWay) => {
    setBusy(true)
    await setDependency(waiting, on, remove, way)
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
            ends={(name) => ({ waiting: taskName, on: name })}
            onChangeWay={(id, way) => void change(taskUUID, id, false, way)}
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
            ends={(name) => ({ waiting: name, on: taskName })}
            onChangeWay={(id, way) => void change(id, taskUUID, false, way)}
          />
        )}
        {waitingOn.length === 0 && blocking.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? "Add a task this one can't start without. The timeline draws it as an arrow; you can then change how it waits."
              : "It doesn't wait on another task."}
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
  ends,
  onChangeWay,
}: {
  title: string
  tasks: DependencyTask[]
  options: ReturnType<typeof useProjectStatuses>["options"]
  canEdit: boolean
  busy: boolean
  onOpen: (taskUUID: string) => void
  onRemove: (taskUUID: string) => void
  removeLabel: (name: string) => string
  /** Which task waits and which it waits on, the other task being called name. */
  ends: (name: string) => { waiting: string; on: string }
  onChangeWay: (taskUUID: string, way: DependencyWay) => void
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
          <DependencyWayEditor way={wayOf(t)} {...ends(t.task_name)} canEdit={canEdit} busy={busy} onSave={(way) => onChangeWay(t.task_uuid, way)} />
          {canEdit && (
            <button
              type="button"
              onClick={() => onRemove(t.task_uuid)}
              disabled={busy}
              aria-label={removeLabel(t.task_name)}
              className="pointer-events-none shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-danger-ink focus:pointer-events-auto focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * How one dependency works, in a few words beside the other task's name; the
 * whole sentence on hover. A project's admins press it to change the kind or
 * the lag.
 */
function DependencyWayEditor({
  way,
  waiting,
  on,
  canEdit,
  busy,
  onSave,
}: {
  way: DependencyWay
  waiting: string
  on: string
  canEdit: boolean
  busy: boolean
  onSave: (way: DependencyWay) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<DependencyKind>(way.kind)
  const [lagText, setLagText] = React.useState("")
  const lagId = React.useId()
  const lag = parseLag(lagText)
  const short = wayShort(way)
  const chip = "shrink-0 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground tabular-nums"

  if (!canEdit) {
    return (
      <span className={cn(chip, "bg-muted")} title={waySentence(way, waiting, on)}>
        {short}
      </span>
    )
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setKind(way.kind)
          setLagText(way.lag ? String(way.lag) : "")
        }
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title={waySentence(way, waiting, on)}
          aria-label={`${waySentence(way, waiting, on)} Change how`}
          className={cn(chip, "bg-muted transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          {short}
        </button>
      </PopoverTrigger>
      {/* Short enough for a laptop's screen below the row; it scrolls inside, never off the page. */}
      <PopoverContent className="max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto" align="end" collisionPadding={8}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (lag === null) return
            setOpen(false)
            if (kind !== way.kind || lag !== way.lag) onSave({ kind, lag })
          }}
        >
          <div className="grid gap-1.5">
            <Label id={`${lagId}-kind`}>Kind</Label>
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as DependencyKind)} className="grid-cols-2 gap-1" aria-labelledby={`${lagId}-kind`}>
              {DEPENDENCY_KINDS.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/50">
                  <RadioGroupItem value={k} />
                  {KIND_LABEL[k]}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={lagId}>Lag in days</Label>
            <Input
              id={lagId}
              type="number"
              step={1}
              min={-MAX_LAG}
              max={MAX_LAG}
              placeholder="0"
              value={lagText}
              onChange={(e) => setLagText(e.target.value)}
              aria-invalid={lag === null}
              aria-describedby={`${lagId}-says`}
              className="h-8 w-24"
            />
          </div>
          <p id={`${lagId}-says`} aria-live="polite" className={cn("rounded-md bg-muted/60 px-2.5 py-2 text-xs", lag === null ? "text-danger-ink" : "text-muted-foreground")}>
            {lag === null ? `A whole number of days, up to ${MAX_LAG} either way.` : waySentence({ kind, lag }, waiting, on)}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={lag === null}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
