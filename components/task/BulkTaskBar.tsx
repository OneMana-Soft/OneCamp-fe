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
import { projectTagsKey, useProjectTags, type ProjectTag } from "@/hooks/useProjectTags"
import { cn } from "@/lib/utils/helpers/cn"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useSWRConfig } from "swr"
import { useSelectedIds } from "@/hooks/useListSelection"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useBulkTaskUpdate, type BulkResult } from "@/hooks/useBulkTaskUpdate"
import { useDeleteTasks } from "@/hooks/useDeleteTasks"
import { DatePanel, quickDays } from "@/components/ui/date-field-panels"
import { shortDate } from "@/lib/utils/date/shortDate"
import { priorities } from "@/types/table"
import { ProjectsGet } from "@/services/endpoints/projects"
import { MAX_TAG_LENGTH, tagTone } from "@/lib/tags"
import { notDone, selectionTags, tagState, tasksCount, whyNotDone, type BulkChange } from "@/lib/bulkTasks"
import type { CycleChoice } from "@/lib/work/backlog"
import { useProjectMilestones } from "@/hooks/useProjectMilestones"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { milestoneChoiceLabel, milestonesPath, targetWords, type Milestone, type MilestonesAnswer } from "@/lib/work/milestones"
import { readInto } from "@/lib/http/readInto"
import { offerPaletteEntries } from "@/lib/ui/paletteEntries"
import { runWhenQuiet } from "@/lib/ui/whenQuiet"
import type { SelectionForPalette } from "@/lib/work/taskPaletteEntries"
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

/** The palette's actions for a task or a selection: a chunk of their own, the task panel's too (linear-28). */
const loadTaskActions = () => import("@/lib/work/taskPaletteEntries")

/** Where a project's people are read: the Assignee list's key, and the palette's. */
const membersKey = (projectId: string) => `${ProjectsGet.GetProjectMemberInfo}/${projectId}`

/**
 * The selection's toolbar: how many are selected and what to change about
 * them, the pickers S, A, T and P open from the keyboard (and Shift+C, the
 * cycles of a project's backlog; Shift+M, a project's milestones). Changes only the tasks this person may
 * change (a project's admins), and says so for the rest. While tasks are
 * selected, the palette (⌘K) offers the same fields, first, and a pick there
 * is this bar's own change (linear-28: Linear's ⌘K acts on the selection).
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

  // Each field's change, the pickers' below and the palette's: the request for
  // the tasks this person may change, then what it did, said once.
  const n = editable.length
  const run = async (change: BulkChange, done: string) => {
    onPicker(null)
    const r = await bulk(editable, change)
    report(r, done)
  }
  const change = {
    status: (value: string) => run({ field: "status", value, options }, `${moved(n)} to ${options.find((o) => o.value === value)?.label ?? value}`),
    priority: (value: string) => run({ field: "priority", value }, `Set ${tasksCount(n)} to ${priorities.find((p) => p.value === value)?.label ?? value} priority`),
    assignee: (user: UserProfileDataInterface | null) =>
      run({ field: "assignee", user }, user ? `Assigned ${tasksCount(n)} to ${displayNameOf(user)}` : `Unassigned ${tasksCount(n)}`),
    /** An ISO time, or "" to take the due date off. */
    due: (value: string) => run({ field: "due", value }, value ? `Set ${tasksCount(n)} due ${shortDate(new Date(value))}` : `Took the due date off ${tasksCount(n)}`),
    cycle: (value: string) => run({ field: "cycle", value }, `${moved(n)} to ${cycles?.find((c) => c.id === value)?.label ?? "the backlog"}`),
    milestone: (value: string, name: string) =>
      run({ field: "milestone", value }, value ? `Put ${tasksCount(n)} in ${name}` : `Took ${tasksCount(n)} out of their milestone`),
    tag: (tag: string, add: boolean) => run({ field: "tags", tag, add }, add ? `Tagged ${tasksCount(n)} “${tag}”` : `Took “${tag}” off ${tasksCount(n)}`),
  }
  // The fields this list offers: the buttons below, and the palette's actions.
  const fields = FIELDS.filter(({ field }) => (field !== "cycle" || cycles) && (field !== "milestone" || !!listProjectId))

  // The palette acts on the selection (linear-28 H1b). What it lists is made
  // from this render's handlers as it opens, reading what a page needs (the
  // people, the tags, the milestones) through the keys the pickers below read.
  const { mutate: rowsCache } = useSWRConfig()
  const paletteSelection = React.useRef<SelectionForPalette<UserProfileDataInterface> | null>(null)
  React.useEffect(() => {
    let read: Milestone[] = []
    paletteSelection.current =
      n === 0
        ? null
        : {
            // Assigning asks for the tasks of one project, as the A button does.
            fields: fields.filter(({ field }) => field !== "assignee" || !!project).map(({ field, key }) => ({ field, key })),
            statusOptions: options,
            onStatus: (value) => void change.status(value),
            priorityOptions: [...priorities].reverse(),
            onPriority: (value) => void change.priority(value),
            people: async () => (project ? ((await readInto<ProjectInfoRawInterface>(rowsCache, membersKey(project))).data?.project_members ?? []) : []),
            nameOf: displayNameOf,
            onAssignee: (who) => void change.assignee(who ?? null),
            tags: async () =>
              selectionTags(editable, project ? ((await readInto<{ data?: ProjectTag[] | null }>(rowsCache, projectTagsKey(project))).data ?? []) : []),
            onTag: (tag) => void change.tag(tag, tagState(editable, tag) !== "all"),
            // Asked for as the page opens, so a selection kept past midnight still starts at today.
            get dueDays() {
              return quickDays().map((q) => ({ value: q.day.toISOString(), label: q.label }))
            },
            onDue: (value) => void change.due(value),
            cycles: (cycles ?? []).map((c) => ({ value: c.id, label: c.dates ? `${c.label} · ${c.dates}` : c.label })),
            onCycle: (id) => void change.cycle(id),
            milestones: async () => {
              read = project ? ((await readInto<MilestonesAnswer>(rowsCache, milestonesPath(project))).data?.milestones ?? []) : []
              return read.map((m) => ({ value: m.id, label: milestoneChoiceLabel(m) }))
            },
            onMilestone: (id) => void change.milestone(id, read.find((m) => m.id === id)?.name ?? ""),
          }
  })
  // One offer while tasks are selected, under how many; its chunk is fetched once the page is quiet.
  const count = selected.length
  React.useEffect(() => {
    if (count === 0) return
    const stop = offerPaletteEntries({
      id: "tasks",
      group: `${tasksCount(count)} selected`,
      lead: true,
      load: loadTaskActions,
      entries: (code) => (paletteSelection.current ? code.selectionPaletteEntries(paletteSelection.current) : []),
    })
    const cancel = runWhenQuiet([loadTaskActions])
    return () => {
      cancel()
      stop()
    }
  }, [count])

  if (selected.length === 0) return null
  const readOnly = selected.length - editable.length

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
          fields.map(({ field, label, key }) => {
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
                      onPick={change.status}
                    />
                  )}
                  {field === "priority" && (
                    <OptionList
                      placeholder="Set priority…"
                      items={[...priorities].reverse().map((p) => ({ value: p.value, search: p.label, node: <TaskPriorityCell priority={p} /> }))}
                      onPick={change.priority}
                    />
                  )}
                  {field === "assignee" && project && (
                    <AssigneeList
                      projectId={project}
                      onPick={change.assignee}
                    />
                  )}
                  {field === "due" && (
                    // The one date picker (components/ui/date-field-panels), as every date the app asks for.
                    <DatePanel
                      clearable
                      onPick={(d) => {
                        void change.due(d.toISOString())
                        onPicker(null)
                      }}
                      onClear={() => {
                        void change.due("")
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
                      onPick={change.cycle}
                    />
                  )}
                  {field === "milestone" && project && (
                    <MilestoneList
                      projectId={project}
                      onPick={change.milestone}
                    />
                  )}
                  {field === "tags" && <TagList projectId={project} tasks={editable} onPick={change.tag} />}
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
  const info = useFetch<ProjectInfoRawInterface>(membersKey(projectId))
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
  // The palette's Add or remove tag… lists the same tags (lib/bulkTasks).
  const names = React.useMemo(() => selectionTags(tasks, known).map((t) => t.name), [tasks, known])
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
