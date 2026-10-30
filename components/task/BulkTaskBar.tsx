"use client"

import { displayNameOf, personKeywords } from "@/lib/personName"
import * as React from "react"
import { Plus, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { DesktopNavigationChatAvatar } from "@/components/navigationBar/desktop/desktopNavigationChatAvatar"
import { useProjectTags } from "@/components/tags/TagPicker"
import { cn } from "@/lib/utils/helpers/cn"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useSelectedIds } from "@/hooks/useListSelection"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useBulkTaskUpdate, type BulkResult } from "@/hooks/useBulkTaskUpdate"
import { useDeleteTasks } from "@/hooks/useDeleteTasks"
import { DatePanel } from "@/components/ui/date-field-panels"
import { shortDate } from "@/lib/utils/date/shortDate"
import { priorities } from "@/types/table"
import { ProjectsGet } from "@/services/endpoints/projects"
import { MAX_TAG_LENGTH, splitTags, tagTone } from "@/lib/tags"
import { notDone, tagState, tasksCount, whyNotDone, type BulkChange } from "@/lib/bulkTasks"
import type { CycleChoice } from "@/lib/work/backlog"
import { useProjectMilestones } from "@/hooks/useProjectMilestones"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { targetWords } from "@/lib/work/milestones"
import type { ListField } from "@/lib/listKeys"
import type { SelectionStore } from "@/lib/listSelection"
import type { StatusOption } from "@/lib/taskStatus"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { TaskInfoInterface } from "@/types/task"
import type { UserProfileDataInterface } from "@/types/user"

const FIELDS: { field: ListField; label: string; key: string }[] = [
  { field: "status", label: "Status", key: "S" },
  { field: "assignee", label: "Assignee", key: "A" },
  { field: "tags", label: "Tags", key: "T" },
  { field: "priority", label: "Priority", key: "P" },
  { field: "due", label: "Due date", key: "D" },
  { field: "cycle", label: "Cycle", key: "⇧C" },
  { field: "milestone", label: "Milestone", key: "⇧M" },
]

const kbd = "kbd"

/**
 * The selection's toolbar: how many are selected and what to change about
 * them, the pickers S, A, T and P open from the keyboard (and Shift+C, the
 * cycles of a project's backlog; Shift+M, a project's milestones). Changes only the tasks this person may
 * change (a project's admins), and says so for the rest.
 */
export function BulkTaskBar({
  store,
  tasks,
  canEdit,
  listProjectId,
  statusOptions,
  cycles,
  picker,
  onPicker,
  placement,
}: {
  store: SelectionStore
  tasks: TaskInfoInterface[]
  canEdit: (task: TaskInfoInterface) => boolean
  /** The list's project, when the list is one project's. */
  listProjectId?: string
  /** That project's statuses, built-in and its own. */
  statusOptions?: StatusOption[]
  /** The project's open cycles, on its backlog: the selection moves into one, or back to the backlog. */
  cycles?: CycleChoice[]
  picker: ListField | null
  onPicker: (field: ListField | null) => void
  /** Under a table that scrolls with the page, or over a board that fills it. */
  placement: "sticky" | "overlay"
}) {
  const selectedIds = useSelectedIds(store)
  const selected = React.useMemo(() => tasks.filter((t) => selectedIds.has(t.task_uuid)), [tasks, selectedIds])
  const editable = React.useMemo(() => selected.filter(canEdit), [selected, canEdit])
  const projects = React.useMemo(() => new Set(editable.map((t) => t.task_project?.project_uuid || listProjectId || "")), [editable, listProjectId])
  // People and statuses belong to a project: they are offered when the tasks share one.
  const project = listProjectId || (projects.size === 1 ? [...projects][0] : undefined) || undefined
  const own = useProjectStatuses(listProjectId ? undefined : project)
  const options = statusOptions ?? own.options
  const bulk = useBulkTaskUpdate(listProjectId)
  const deleteTasks = useDeleteTasks(listProjectId)

  // A key can ask for a picker the bar can't offer: nothing here this person
  // may change, or people to assign across several projects. Say so, rather
  // than open an empty box (or one that springs open later).
  const blocked = picker !== null && (editable.length === 0 || (picker === "assignee" && !project))
  React.useEffect(() => {
    if (!blocked) return
    onPicker(null)
    toast({
      title: editable.length === 0 ? "Only a project's admins can change its tasks" : "Pick tasks from one project to assign them",
    })
  }, [blocked, editable.length, onPicker])

  if (selected.length === 0) return null
  const readOnly = selected.length - editable.length

  const run = async (change: BulkChange, done: string) => {
    onPicker(null)
    const r = await bulk(editable, change)
    report(r, done)
  }

  return (
    <div
      className={cn(
        "z-20 flex justify-center",
        placement === "sticky" ? "sticky bottom-4 mt-3" : "pointer-events-none absolute inset-x-0 bottom-4",
      )}
    >
      <div
        role="toolbar"
        aria-label={`${tasksCount(selected.length)} selected`}
        // A floating bar's material (design v3: --pop and e3, no border, no blur: PTC-34).
        className="pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto rounded-xl bg-pop p-1.5 pl-3 shadow-e3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
      >
        <span className="mr-1 whitespace-nowrap text-sm font-medium tabular-nums">{selected.length} selected</span>
        {readOnly > 0 && (
          <span className="mr-1 whitespace-nowrap text-xs text-muted-foreground" title="Only a project's admins can change its tasks.">
            {editable.length === 0 ? "· only a project's admins can change these" : `· ${readOnly} you can't change`}
          </span>
        )}
        {editable.length > 0 &&
          FIELDS.filter(({ field }) => (field !== "cycle" || cycles) && (field !== "milestone" || !!listProjectId)).map(({ field, label, key }) => {
            const needsProject = field === "assignee" && !project
            return (
              <Popover key={field} open={picker === field && !needsProject} onOpenChange={(o) => onPicker(o ? field : null)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    disabled={needsProject}
                    title={needsProject ? "Pick tasks from one project to assign them" : `${label} (${key})`}
                  >
                    {label}
                    <kbd className={kbd}>{key}</kbd>
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" className={cn(field === "due" ? "w-auto" : "w-64", "p-0")}>
                  {field === "status" && (
                    <OptionList
                      placeholder="Move to…"
                      items={options.map((o) => ({ value: o.value, search: `${o.label} ${o.value}`, node: <TaskStatusCell status={o} />, indent: o.custom }))}
                      onPick={(value) =>
                        run({ field: "status", value, options }, `${moved(editable.length)} to ${options.find((o) => o.value === value)?.label ?? value}`)
                      }
                    />
                  )}
                  {field === "priority" && (
                    <OptionList
                      placeholder="Set priority…"
                      items={[...priorities].reverse().map((p) => ({ value: p.value, search: p.label, node: <TaskPriorityCell priority={p} /> }))}
                      onPick={(value) => run({ field: "priority", value }, `Set ${tasksCount(editable.length)} to ${priorities.find((p) => p.value === value)?.label ?? value} priority`)}
                    />
                  )}
                  {field === "assignee" && project && (
                    <AssigneeList
                      projectId={project}
                      onPick={(user) =>
                        run({ field: "assignee", user }, user ? `Assigned ${tasksCount(editable.length)} to ${displayNameOf(user)}` : `Unassigned ${tasksCount(editable.length)}`)
                      }
                    />
                  )}
                  {field === "due" && (
                    // The one date picker (components/ui/date-field-panels), as every date the app asks for.
                    <DatePanel
                      clearable
                      onPick={(d) => {
                        run({ field: "due", value: d.toISOString() }, `Set ${tasksCount(editable.length)} due ${shortDate(d)}`)
                        onPicker(null)
                      }}
                      onClear={() => {
                        run({ field: "due", value: "" }, `Took the due date off ${tasksCount(editable.length)}`)
                        onPicker(null)
                      }}
                    />
                  )}
                  {field === "cycle" && cycles && (
                    <OptionList
                      placeholder="Move to…"
                      items={[
                        ...cycles.map((c) => ({ value: c.id, search: `${c.label} ${c.dates}`, node: <ChoiceItem label={c.label} detail={c.dates} /> })),
                        { value: "", search: "Backlog", node: <span>Backlog</span> },
                      ]}
                      onPick={(value) => run({ field: "cycle", value }, `${moved(editable.length)} to ${cycles.find((c) => c.id === value)?.label ?? "the backlog"}`)}
                    />
                  )}
                  {field === "milestone" && project && (
                    <MilestoneList
                      projectId={project}
                      onPick={(value, name) =>
                        run({ field: "milestone", value }, value ? `Put ${tasksCount(editable.length)} in ${name}` : `Took ${tasksCount(editable.length)} out of their milestone`)
                      }
                    />
                  )}
                  {field === "tags" && <TagList projectId={project} tasks={editable} onPick={(tag, add) => run({ field: "tags", tag, add }, add ? `Tagged ${tasksCount(editable.length)} “${tag}”` : `Took “${tag}” off ${tasksCount(editable.length)}`)} />}
                </PopoverContent>
              </Popover>
            )
          })}
        {editable.length > 0 && (
          // Deleted with Undo, as one task is (hooks/useDeleteTasks).
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-danger-ink hover:text-danger-ink"
            onClick={() => {
              const these = editable
              onPicker(null)
              store.clear()
              void deleteTasks(these)
            }}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Delete
          </Button>
        )}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground" onClick={() => store.clear()}>
          Clear
          <kbd className={kbd}>Esc</kbd>
        </Button>
      </div>
    </div>
  )
}

const moved = (n: number) => (n === 1 ? "Moved 1 task" : `Moved ${n} tasks`)

function report(r: BulkResult, done: string) {
  if (r.failed > 0) {
    toast({
      variant: "destructive",
      title: notDone(r.failed, r.changed, "changed"),
      description: whyNotDone(r.error),
    })
    return
  }
  if (r.changed > 0) toast({ title: done })
}

/** A cycle as the picker offers it: its name, and when it runs. */
function ChoiceItem({ label, detail }: { label: string; detail?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
      <span className="truncate">{label}</span>
      {detail ? <span className="shrink-0 text-meta tabular-nums text-ink-3">{detail}</span> : null}
    </span>
  )
}

/** "No milestone", then the project's milestones, read as the picker opens, each with its target day: the panel's Milestone row's order. */
function MilestoneList({ projectId, onPick }: { projectId: string; onPick: (id: string, name: string) => void }) {
  const { read, milestones } = useProjectMilestones(projectId)
  if (read.isError && milestones === undefined) return <ErrorState compact subject="the milestones" onRetry={() => void read.mutate()} />
  if (milestones === undefined)
    return (
      <div role="status" aria-label="Reading the milestones" className="p-2">
        <SkeletonRows rows={3} />
      </div>
    )
  const items = milestones.map((m) => {
    const target = targetWords(m)?.text
    return { value: m.id, search: `${m.name} ${target ?? ""}`, node: <ChoiceItem label={m.name} detail={target} /> }
  })
  return (
    <OptionList
      placeholder={milestones.length ? "Put in…" : "This project has no milestones yet"}
      items={[{ value: "", search: "No milestone", node: <span>No milestone</span> }, ...items]}
      onPick={(value) => onPick(value, milestones.find((m) => m.id === value)?.name ?? "")}
    />
  )
}

/** A searchable list of choices, focused as it opens so the keyboard carries on. */
function OptionList({
  placeholder,
  items,
  onPick,
}: {
  placeholder: string
  items: { value: string; search: string; node: React.ReactNode; indent?: boolean }[]
  onPick: (value: string) => void
}) {
  return (
    <Command>
      <CommandInput placeholder={placeholder} autoFocus />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup>
          {items.map((i) => (
            <CommandItem key={i.value} value={i.search} onSelect={() => onPick(i.value)} className={i.indent ? "pl-6" : undefined}>
              {i.node}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

function AssigneeList({ projectId, onPick }: { projectId: string; onPick: (user: UserProfileDataInterface | null) => void }) {
  const info = useFetch<ProjectInfoRawInterface>(`${ProjectsGet.GetProjectMemberInfo}/${projectId}`)
  const members = info.data?.data.project_members ?? []
  return (
    <Command>
      <CommandInput placeholder="Assign to…" autoFocus />
      <CommandList>
        <CommandEmpty>{info.isLoading ? "Loading people…" : "No one by that name."}</CommandEmpty>
        <CommandGroup>
          <CommandItem value="no one unassign nobody" onSelect={() => onPick(null)} className="gap-2 text-muted-foreground">
            <span aria-hidden className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/50" />
            No one
          </CommandItem>
          {members.map((m) => (
            <CommandItem key={m.user_uuid} value={m.user_uuid} keywords={personKeywords(m)} onSelect={() => onPick(m)} className="gap-2">
              <DesktopNavigationChatAvatar userInfo={m} />
              <span className="truncate">{displayNameOf(m)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/**
 * Tags across the selection: a tag every task has comes off them all; one
 * that some or none have goes on the rest. Typing makes a new one.
 */
function TagList({ projectId, tasks, onPick }: { projectId: string | undefined; tasks: TaskInfoInterface[]; onPick: (tag: string, add: boolean) => void }) {
  const [query, setQuery] = React.useState("")
  const { tags: known } = useProjectTags(projectId)
  const names = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of tasks) for (const tag of splitTags(t.task_label)) seen.set(tag.toLowerCase(), tag)
    for (const k of known) if (!seen.has(k.name.toLowerCase())) seen.set(k.name.toLowerCase(), k.name)
    return [...seen.values()]
  }, [tasks, known])
  const typed = query.trim().slice(0, MAX_TAG_LENGTH)
  const isNew = typed !== "" && !names.some((n) => n.toLowerCase() === typed.toLowerCase())
  return (
    <Command>
      <CommandInput placeholder="Find or make a tag…" value={query} onValueChange={setQuery} maxLength={MAX_TAG_LENGTH} autoFocus />
      <CommandList>
        <CommandEmpty>{typed ? null : "No tags yet."}</CommandEmpty>
        {isNew && (
          <CommandGroup>
            <CommandItem value={`__new__${typed}`} onSelect={() => onPick(typed, true)}>
              <Plus className="mr-2 h-4 w-4" />
              Tag them <span className={cn("ml-1 truncate rounded px-1.5 text-xs font-medium", tagTone(typed))}>{typed}</span>
            </CommandItem>
          </CommandGroup>
        )}
        {names.length > 0 && (
          <CommandGroup>
            {names.map((name) => {
              const state = tagState(tasks, name)
              return (
                <CommandItem key={name} checked={state === "all" ? true : state === "some" ? "indeterminate" : false} value={name} onSelect={() => onPick(name, state !== "all")}>
                  <span className={cn("truncate rounded px-1.5 text-xs font-medium", tagTone(name))}>{name}</span>
                  <span className="sr-only">{state === "all" ? ", on all of them" : state === "some" ? ", on some of them" : ""}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
