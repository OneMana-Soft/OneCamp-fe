/**
 * The open task's actions for the command palette (linear-28: Linear's ⌘K
 * acts on the issue you are on). The task's panel offers these as "This
 * task" (lib/ui/paletteEntries), made from what the panel holds, and each
 * pick goes to the panel's own handler: a status, priority or assignee set
 * from the palette paints, is checked and is put back exactly as one set on
 * the panel.
 *
 * Permissions are the panel's: the changes are offered only to someone the
 * panel lets edit the task (canEditTask), and the copies to anyone who can
 * see it.
 *
 * Each action wears its own mark and each choice the app's mark for it, as
 * the panel's own menus draw them (DESIGN-BUILD-57); the palette draws them
 * from their names (components/ui/paletteMark). Assign to lists whom the
 * panel's assignee picker lists: the project's people, then the workspace's
 * AI teammates, from the panel's one read of them (CR-127).
 *
 * Its tags, cycle and milestone (H1b) are read as their page opens, through
 * the panel's rows' own reads, and a pick goes to the row's own change. There
 * is no move to another project in the app: a cycle and a milestone are its
 * moves.
 *
 * The selected tasks' actions (H1b: Linear's ⌘K acts on the selected issues)
 * are made here too, by the same code: the list's selection bar offers its
 * own fields, with its keys, and each pick goes to the bar's own change.
 *
 * This module is a chunk of its own, which the palette fetches as it opens
 * (lib/ui/paletteSurfaces), so the task page's first load carries none of it.
 * It brings nothing a route has already (app/firstLoad.test.ts): the panel
 * hands in the task page's address and the rule people are named by.
 */

import type { PaletteChoice, PaletteEntry } from "@/lib/ui/paletteEntries"
import type { StatusLike } from "@/components/task/taskStatusCell"
import type { ListField } from "@/lib/listKeys"
import { taskBranchName } from "@/lib/work/taskBranchName"

interface Option {
  value: string
  label: string
}

/** A row's choices, read as its page opens: what it offers, as the row labels them, and what the task has now ("" for none). */
export interface RowChoices {
  options: Option[]
  /** Undefined marks none: a selection's tasks may differ. */
  current?: string
}

export interface Member {
  user_uuid: string
  user_name: string
  user_full_name?: string
}

export interface TaskForPalette<M extends Member = Member> {
  taskUUID: string
  taskKey?: string
  taskName: string
  /** The task page's address, as the panel's Copy link writes it (lib/work/taskLinks). */
  link: string
  canEdit: boolean
  status?: string
  /** The project's statuses, each with what its glyph is drawn by (its category and hue). */
  statusOptions: StatusLike[]
  onStatus(value: string): void
  priority?: string
  priorityOptions: Option[]
  onPriority(value: string): void
  assigneeUUID?: string
  members: M[]
  /** The workspace's AI teammates a task can be handed to, which the panel's picker lists after the project's people. */
  aiTeammates?: M[]
  /** A member's name, by the app's one rule (lib/personName). */
  nameOf(member: M): string
  /** The member picked, or undefined to leave it unassigned. */
  onAssignee(member: M | undefined): void
  /** The task's tags and the project's, as its tag picker lists them, read as the page opens; current: on the task. */
  tags(): Promise<{ name: string; current: boolean }[]>
  /** Puts the tag on the task, or takes it off: the tag picker's own change. */
  onTag(tag: string): void
  /** The Cycle row's choices, read as the page opens. */
  cycles(): Promise<RowChoices>
  /** The Cycle row's own change; "" takes the task out of its cycle. */
  onCycle(id: string): void
  /** The Milestone row's choices, read as the page opens. */
  milestones(): Promise<RowChoices>
  /** The Milestone row's own change; "" takes the task off its milestone. */
  onMilestone(id: string): void
  copy(text: string, message: string): void
}

/**
 * The selected tasks, as the list's selection bar (components/task/BulkTaskBar)
 * hands them in. Each change is the bar's own: it changes only the tasks this
 * person may change, and says how many it did.
 */
export interface SelectionForPalette<M extends Member = Member> {
  /** The bar's fields this person may use now, in its order, each with the key the bar shows ("⇧C"). */
  fields: { field: ListField; key: string }[]
  /** The project's statuses, as the bar's Status list offers them. */
  statusOptions: StatusLike[]
  onStatus(value: string): void
  priorityOptions: Option[]
  onPriority(value: string): void
  /** The project's people, read as the page opens: the bar's Assignee list. */
  people(): Promise<M[]>
  nameOf(member: M): string
  /** The member picked, or undefined to unassign them. */
  onAssignee(member: M | undefined): void
  /** The tags across the selection, then the project's, read as the page opens; current: on every one. */
  tags(): Promise<{ name: string; current: boolean }[]>
  /** Puts the tag on them all, or takes it off when every one has it. */
  onTag(tag: string): void
  /** The date picker's quick days, each as its day's ISO time. */
  dueDays: Option[]
  /** "" takes their due date off. */
  onDue(value: string): void
  /** The backlog's cycles (offered on a backlog). */
  cycles: Option[]
  /** "" moves them back to the backlog. */
  onCycle(id: string): void
  /** The project's milestones, read as the page opens. */
  milestones(): Promise<Option[]>
  /** "" takes them off their milestone. */
  onMilestone(id: string): void
}

/** The value the assignee page uses for "No one". */
export const UNASSIGNED = "__unassigned__"

/** Each field's action as both surfaces list it: the words it is found by, and its mark. */
const FIELDS: Record<ListField, { label: string; keywords: readonly string[]; mark: NonNullable<PaletteEntry["mark"]> }> = {
  status: { label: "Change status…", keywords: ["status", "state", "done", "complete", "progress"], mark: { glyph: "status" } },
  priority: { label: "Set priority…", keywords: ["priority", "urgent", "high", "medium", "low"], mark: { glyph: "priority" } },
  assignee: { label: "Assign to…", keywords: ["assign", "assignee", "owner", "unassign", "who", "ai", "agent"], mark: { glyph: "people" } },
  tags: { label: "Add or remove tag…", keywords: ["tag", "tags", "label", "labels"], mark: { glyph: "tag" } },
  due: { label: "Set due date…", keywords: ["due", "date", "deadline", "today", "tomorrow", "week"], mark: { glyph: "due" } },
  cycle: { label: "Move to cycle…", keywords: ["cycle", "sprint", "iteration", "move"], mark: { glyph: "cycle" } },
  milestone: { label: "Move to milestone…", keywords: ["milestone", "release", "target", "move"], mark: { glyph: "milestone" } },
}

/** A field's action: its choices, asked for as its page opens, and what takes the one picked; keys as the palette draws them ("⇧ C"). */
function fieldEntry(id: ListField, choices: () => PaletteChoice[] | Promise<PaletteChoice[]>, apply: (value: string) => void, key?: string): PaletteEntry {
  const { label, keywords, mark } = FIELDS[id]
  return { id, label, keywords: [...keywords], mark, choices, apply, ...(key ? { keys: [...key].join(" ") } : {}) }
}

function choicesOf<O extends Option>(options: O[], current: string | undefined, mark: (o: O) => PaletteChoice["mark"]): PaletteChoice[] {
  return options.map((o) => ({ value: o.value, label: o.label, current: o.value === current, mark: mark(o) }))
}

/** A row's choices as its select offers them: none first, then its options, the one the task has marked. */
function rowChoices({ options, current }: RowChoices, none: string): PaletteChoice[] {
  return [{ value: "", label: none }, ...options].map((o) => ({ value: o.value, label: o.label, current: o.value === current }))
}

/** No one, then the people, each by the app's name rule and avatar; current is whom it has (UNASSIGNED: no one). */
function peopleChoices<M extends Member>(people: M[], nameOf: (m: M) => string, current?: string): PaletteChoice[] {
  return [
    { value: UNASSIGNED, label: "No one", current: current === UNASSIGNED, mark: { person: null } },
    ...people.map((m) => ({ value: m.user_uuid, label: nameOf(m), current: m.user_uuid === current, mark: { person: m } })),
  ]
}

/** Hands the person picked to the change. Someone no longer listed (gone from the project while the page was open) changes nothing. */
function assign<M extends Member>(people: M[], onAssignee: (m: M | undefined) => void, value: string): void {
  if (value === UNASSIGNED) return onAssignee(undefined)
  const who = people.find((m) => m.user_uuid === value)
  if (who) onAssignee(who)
}

/** Tags as the tag picker lists them, each wearing its own hue. */
const tagChoices = (tags: { name: string; current: boolean }[]): PaletteChoice[] =>
  tags.map((g) => ({ value: g.name, label: g.name, current: g.current, mark: { tag: g.name } }))

const statusMark = (o: StatusLike): PaletteChoice["mark"] => ({ status: o })
const priorityMark = (o: Option): PaletteChoice["mark"] => ({ priority: o.value })

export function taskPaletteEntries<M extends Member>(t: TaskForPalette<M>): PaletteEntry[] {
  const people = [...t.members, ...(t.aiTeammates ?? [])]
  const changes: PaletteEntry[] = !t.canEdit
    ? []
    : [
        fieldEntry("status", () => choicesOf(t.statusOptions, t.status, statusMark), (value) => t.onStatus(value)),
        fieldEntry("priority", () => choicesOf(t.priorityOptions, t.priority, priorityMark), (value) => t.onPriority(value)),
        fieldEntry("assignee", () => peopleChoices(people, t.nameOf, t.assigneeUUID || UNASSIGNED), (value) => assign(people, t.onAssignee, value)),
        fieldEntry("tags", async () => tagChoices(await t.tags()), (value) => t.onTag(value)),
        fieldEntry("cycle", async () => rowChoices(await t.cycles(), "No cycle"), (value) => t.onCycle(value)),
        fieldEntry("milestone", async () => rowChoices(await t.milestones(), "No milestone"), (value) => t.onMilestone(value)),
      ]

  const copies: PaletteEntry[] = [
    ...(t.taskKey
      ? [
          {
            id: "copy-key",
            label: `Copy key ${t.taskKey}`,
            keywords: ["copy", "key", "id"],
            mark: { glyph: "key" } as const,
            run: () => t.copy(t.taskKey!, `Copied ${t.taskKey}`),
          },
        ]
      : []),
    {
      id: "copy-link",
      label: "Copy link",
      keywords: ["copy", "link", "url", "share"],
      mark: { glyph: "link" },
      run: () => t.copy(t.link, "Link copied"),
    },
    {
      id: "copy-branch",
      label: "Copy branch name",
      keywords: ["copy", "branch", "git", "github"],
      mark: { glyph: "branch" },
      run: () => t.copy(taskBranchName(t.taskUUID, t.taskName), "Branch name copied"),
    },
  ]

  return [...changes, ...copies]
}

/**
 * The selected tasks' actions: the bar's fields, in its order and with its
 * keys. Nothing is marked current, since the tasks may differ, except a tag
 * every one of them has (picking it takes it off them all, as the bar does).
 */
export function selectionPaletteEntries<M extends Member>(s: SelectionForPalette<M>): PaletteEntry[] {
  return s.fields.map(({ field, key }) => {
    switch (field) {
      case "status":
        return fieldEntry(field, () => choicesOf(s.statusOptions, undefined, statusMark), (value) => s.onStatus(value), key)
      case "priority":
        return fieldEntry(field, () => choicesOf(s.priorityOptions, undefined, priorityMark), (value) => s.onPriority(value), key)
      case "assignee": {
        // Who is listed is what the page read as it opened.
        let listed: M[] = []
        return fieldEntry(field, async () => peopleChoices((listed = await s.people()), s.nameOf), (value) => assign(listed, s.onAssignee, value), key)
      }
      case "tags":
        return fieldEntry(field, async () => tagChoices(await s.tags()), (value) => s.onTag(value), key)
      case "due":
        // The date picker's quick days, then none, as it lists Clear after them.
        return fieldEntry(field, () => [...s.dueDays, { value: "", label: "No due date" }].map((o) => ({ value: o.value, label: o.label })), (value) => s.onDue(value), key)
      case "cycle":
        return fieldEntry(field, () => rowChoices({ options: s.cycles }, "Backlog"), (value) => s.onCycle(value), key)
      case "milestone":
        return fieldEntry(field, async () => rowChoices({ options: await s.milestones() }, "No milestone"), (value) => s.onMilestone(value), key)
    }
  })
}
