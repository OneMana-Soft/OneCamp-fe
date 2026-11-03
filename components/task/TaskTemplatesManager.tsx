"use client"

// The task templates' manager (linear-09): a project's admins keep its templates from the project's tools, and
// the workspace's admins keep the workspace's from Admin › Permissions. Each template presets a task's name,
// type, priority, labels, days, sub-tasks, body and the project's fields; asks for what its maker must fill;
// and may be the one each new task of its type starts from. The server says who keeps which.
//
// A lazy chunk with no shared core (LEAD-RULES 30 Oct 00:13): the page passes in only its HTTP client, and every
// read here goes through it (the project's fields, people, AI teammates and statuses: placeLists). Nothing it loads,
// now or on demand, reaches the shared core (app/firstLoad.test): the task's editor and assignee picker do, and
// their lazy imports here re-cut the /app shell (tt3, 3 Nov). So the body is written in Markdown with the codec's
// preview, and kept as HTML as a task's description is; and the assignee is picked on the shared Select from the
// server's lists, read on the page's client: the project's people and the AI teammates, and the read's assignee_who.
// It opens no lazy chunk of its own either: the shared combobox's menu would, and that re-cut the shell too.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { AnswerInput, taskFieldAnswer } from "@/components/forms/AnswerInput"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import TaskTypeGlyph from "@/components/task/TaskTypeGlyph"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { NobodyMark } from "@/components/ui/graphics/NobodyMark"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { htmlOfMarkdown } from "@/lib/codec/htmlMarkdown"
import { LayoutTemplate, Pencil, Plus, Trash2, X } from "@/lib/icons"
import type { TaskField } from "@/lib/tasks/fields"
import { botSubtitle } from "@/lib/botCopy"
import { displayNameOf } from "@/lib/personName"
import { sanitizeRichHtml } from "@/lib/sanitizeHtml"
import { inOrder } from "@/lib/statusOrder"
import { PRIORITY_NAMES } from "@/lib/tasks/priority"
import { BUILT_IN_STATUSES, statusOptions, type StatusOption } from "@/lib/taskStatus"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import type { ProjectType } from "@/lib/work/keysApi"
import { askable, draftOf, keptOf, MOST_DAYS, type Draft } from "@/lib/work/taskTemplateDraft"
import { askLabel, groupTemplates, type TaskTemplate, type TemplateList, type TemplateSummary } from "@/lib/work/taskTemplates"
import type { UserProfileDataInterface } from "@/types/user"
import { placeLists, templateKeep, type KeepHttp, type PlaceLists, type TemplateKeep } from "@/lib/work/taskTemplatesKeep"
import { deletedTitle, offerUndo, restoreBy } from "@/services/restoreService"

/** The server's limits on a template (business/TaskTemplate). */
const MOST = { name: 60, about: 280, subtasks: 50 }
const NONE = "none"
const PRIORITIES = PRIORITY_NAMES.map((label, i) => ({ value: i ? label.toLowerCase() : NONE, label }))

/** What the editor holds: the template it was read from (none: a new one), where it's kept, and the draft. */
interface Editing {
  template?: TaskTemplate
  workspace: boolean
  draft: Draft
}

/**
 * One place's list and the editing around it. A project's list holds the workspace's templates too: one of those
 * is kept through the workspace's calls, by whoever keeps the workspace's, and takes a built-in type only.
 */
function useTemplates(http: KeepHttp, projectId?: string) {
  // The place's lists, read once; a template opens only once they're in, so its draft holds the fields it sets.
  const lists = useRef<Promise<PlaceLists> | null>(null)
  const [place, setPlace] = useState<PlaceLists | null>(null)
  useEffect(() => {
    let live = true
    const read = placeLists(http, projectId)
    lists.current = read
    void read.then((got) => live && setPlace(got))
    return () => {
      live = false
    }
  }, [http, projectId])
  const own = useMemo(() => templateKeep(http, projectId), [http, projectId])
  const workspace = useMemo(() => templateKeep(http), [http])
  const [list, setList] = useState<TemplateList | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const read = useCallback(async () => {
    try {
      setList(await own.list())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [own])
  useEffect(() => void read(), [read])

  const isWorkspace = (t: Pick<TemplateSummary, "project_id">) => !projectId || !t.project_id
  const keepOf = (shared: boolean): TemplateKeep => (shared && projectId ? workspace : own)
  const fieldsOf = (shared: boolean, from: PlaceLists | null = place): readonly TaskField[] => (shared ? [] : (from?.fields ?? []))
  // A project's statuses in its order; the workspace's templates (and a project whose statuses didn't load) take the built-in ones.
  const statusesOf = (shared: boolean): StatusOption[] => (!shared && place?.statuses ? inOrder(statusOptions(place.statuses), place.statuses.order) : BUILT_IN_STATUSES)
  const canKeep = (t: Pick<TemplateSummary, "project_id">) => !!list && (projectId && !t.project_id ? !!list.can_manage_workspace : list.can_manage)
  const typesOf = (shared: boolean): ProjectType[] => (list?.types ?? []).filter((t) => !shared || !t.own)

  const run = async (what: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await what()
      return true
    } catch (err) {
      setError(apiErrorMessage(err, fallback))
      return false
    } finally {
      setBusy(false)
    }
  }
  return {
    list,
    failed,
    read,
    editing,
    busy,
    error,
    isWorkspace,
    canKeep,
    typesOf,
    fieldsOf,
    statusesOf,
    place,
    start: () => {
      setError(null)
      setEditing({ workspace: !projectId, draft: draftOf(undefined, fieldsOf(!projectId)) })
    },
    open: (t: TemplateSummary) => {
      const shared = isWorkspace(t)
      void run(async () => {
        const [template, got] = await Promise.all([keepOf(shared).get(t.id), lists.current])
        setEditing({ template, workspace: shared, draft: draftOf(template, fieldsOf(shared, got ?? place)) })
      }, `“${t.name}” couldn't be opened. Try again.`)
    },
    change: (draft: Draft) => setEditing((e) => (e ? { ...e, draft } : e)),
    close: () => {
      setEditing(null)
      setError(null)
    },
    save: async () => {
      if (!editing) return
      const out = keptOf(editing.draft, editing.template, fieldsOf(editing.workspace))
      if ("error" in out) return setError(out.error)
      const keep = keepOf(editing.workspace)
      const id = editing.template?.id
      const saved = await run(() => (id ? keep.change(id, out.kept) : keep.add(out.kept)), "The template wasn't saved. Try again.")
      if (!saved) return
      setEditing(null)
      await read()
    },
    remove: async (t: TemplateSummary) => {
      const keep = keepOf(isWorkspace(t))
      if (!(await run(() => keep.remove(t.id), `“${t.name}” couldn't be deleted. Try again.`))) return
      await read()
      offerUndo(deletedTitle(t.name, "template"), () => restoreBy(() => keep.restore(t.id), read))
    },
  }
}

type Templates = ReturnType<typeof useTemplates>

/** The templates, the project's own and then the workspace's, each with its type's default named. */
function TemplateRows({ at, inProject }: { at: Templates; inProject: boolean }) {
  const list = at.list
  if (!list) return null
  const groups = inProject ? groupTemplates(list.templates) : { project: [], workspace: list.templates }
  const typeOf = (id?: string) => list.types?.find((t) => t.id === id)
  const rows = (ts: TemplateSummary[], label: string) => (
    <ul role="list" aria-label={label} className="divide-y divide-line">
      {ts.map((t) => {
        const type = typeOf(t.default_for)
        // On a phone the badge goes under the name, so the name keeps the row's
        // width (DESIGN-BUILD-100, 3 Nov: "Feature br…" was cut beside a whole
        // "Default for Feature"); a computer keeps the row on one line.
        return (
          <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 md:flex md:gap-3">
            {type ? <TaskTypeGlyph type={type} className="size-4 shrink-0" /> : <LayoutTemplate className="size-4 shrink-0 text-ink-3" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-1">{t.name}</p>
              {t.description && <p className="truncate text-meta text-ink-2">{t.description}</p>}
            </div>
            {type && <span className="col-start-2 row-start-2 shrink-0 justify-self-start rounded-sm bg-muted px-2 py-0.5 text-meta text-ink-2">Default for {type.name}</span>}
            {at.canKeep(t) && (
              <div className={cn("flex shrink-0 gap-1", type && "row-span-2")}>
                <Button type="button" variant="ghost" size="icon" className="size-11 md:size-8" aria-label={`Edit ${t.name}`} disabled={at.busy} onClick={() => at.open(t)}>
                  <Pencil className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-11 md:size-8" aria-label={`Delete ${t.name}`} disabled={at.busy} onClick={() => void at.remove(t)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
  return (
    <div className="space-y-4">
      {inProject && <Group title="This project's">{groups.project.length ? rows(groups.project, "This project's templates") : <Empty>No templates of its own yet.</Empty>}</Group>}
      {(groups.workspace.length > 0 || !inProject) && (
        <Group title={inProject ? "The workspace's" : undefined} note={inProject && !list.can_manage_workspace ? "Kept by workspace admins in Admin › Permissions." : undefined}>
          {groups.workspace.length ? rows(groups.workspace, "The workspace's templates") : <Empty>No templates yet. Make one for the tasks your teams start most.</Empty>}
        </Group>
      )}
      {!list.can_manage && !inProject && <Empty>Only workspace admins keep the workspace&apos;s templates.</Empty>}
    </div>
  )
}

function Group({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      {title && <h3 className="text-meta font-medium text-ink-2">{title}</h3>}
      {children}
      {note && <p className="text-meta text-ink-3">{note}</p>}
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-sm text-ink-2">{children}</p>

/** One labelled box of the editor. */
function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-meta text-ink-3">{hint}</p>}
    </div>
  )
}

/** The row that takes the assignee off. */
const NOBODY = "__nobody__"

/** A person, as New task's Assignee chip draws one: their initials in their hue (a photo is a read of the shared core's). */
const Face = ({ who }: { who: UserProfileDataInterface }) => <IdentityMark variant="avatar" id={avatarSeed(who)} label={displayNameOf(who)} size={20} />

/**
 * Who a template's tasks are given to, on the shared Select, as Type, Priority and Status are: No one, the place's
 * people, then the AI teammates. A preset in neither list (someone who has since left the project, or one the lists
 * haven't brought yet) stays listed as the read names them, so the template keeps them until it's changed. The lists
 * are the server's, read on the page's client, and the server checks the pick when a task is made. An AI teammate (or
 * another bot) is listed by name under its heading, and the field names a picked one with its kind's line, as
 * pickers do (botSubtitle: an AI teammate only when an AI is behind it). Not the shared combobox: its menu is a lazy chunk of its own, a new async group from this one, and it
 * re-cut the /app shell (app/firstLoad.test); nor the shared agent piece (the agent's square and principal tag), which
 * re-cut it too (bisect-s, 3 Nov). A row is found by typing its name's first letters (textValue, so a face's initials
 * don't lead), not by a filter.
 */
function AssigneeField({ id, people, who, onPick }: { id: string; people: UserProfileDataInterface[]; who?: UserProfileDataInterface; onPick: (uuid: string) => void }) {
  const listed = !who || people.some((u) => u.user_uuid === who.user_uuid)
  const row = (u: UserProfileDataInterface, ai: boolean) => (
    <SelectItem key={u.user_uuid} value={u.user_uuid} textValue={displayNameOf(u)}>
      <span className="flex min-w-0 items-center gap-2">
        {!ai && <Face who={u} />}
        <span className="min-w-0 truncate">{displayNameOf(u)}</span>
      </span>
    </SelectItem>
  )
  return (
    <Select value={who?.user_uuid ?? NOBODY} onValueChange={(v) => onPick(v === NOBODY ? "" : v)}>
      <SelectTrigger id={id}>
        {/* A picked bot is named with its kind's line, as pickers name one (an AI teammate only when an AI is
            behind it); anyone else shows as their row does. */}
        <SelectValue>
          {who?.is_bot ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{displayNameOf(who)}</span>
              <span className="shrink-0 text-meta text-ink-3">{botSubtitle(who.user_bot_kind)}</span>
            </span>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NOBODY} textValue="No one">
          <span className="flex items-center gap-2 text-muted-foreground">
            <NobodyMark className="size-5" />
            No one
          </span>
        </SelectItem>
        {who && !listed && row(who, !!who.is_bot)}
        {people.length > 0 && (
          <SelectGroup>
            <SelectLabel>People</SelectLabel>
            {people.map((u) => row(u, false))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

/**
 * The body its tasks' description starts with, written in Markdown, and its preview as it's typed: the codec's own
 * HTML (lib/codec/htmlMarkdown), which is what the template keeps, drawn through the app's sanitiser.
 */
function BodyField({ id, value, onChange }: { id: string; value: string; onChange: (markdown: string) => void }) {
  const html = useMemo(() => htmlOfMarkdown(value), [value])
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Description</Label>
      <Textarea id={id} value={value} onChange={(v) => onChange(v.target.value)} aria-describedby={`${id}-hint`} placeholder="What its tasks' description starts with: steps, a checklist, headings…" className="min-h-[120px] max-h-80 overflow-auto" />
      <p id={`${id}-hint`} className="text-meta text-ink-3">
        In Markdown: <code>###</code> a heading, <code>1.</code> a step, <code>- [ ]</code> a checklist item, <code>**bold**</code>.
      </p>
      {html && (
        <section aria-labelledby={`${id}-preview`} className="grid gap-1 rounded-md bg-sunken px-3 py-2">
          <p id={`${id}-preview`} className="text-meta font-medium text-ink-3">
            Preview
          </p>
          <SafeHtml
            html={html}
            sanitizer={sanitizeRichHtml}
            className={cn(
              "break-words text-sm leading-[22px] text-ink-1",
              "[&_h1]:mb-1 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold",
              "[&_p]:mb-1 [&_strong]:font-semibold [&_a]:text-brand-text [&_a]:underline [&_code]:rounded [&_code]:bg-hover [&_code]:px-1",
              "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3",
              // A checklist as the task's editor draws one (minimal-tiptap lists.css): the sanitiser drops the checkbox, so
              // its label is the box, filled while checked, and a checked item's text is struck through.
              "[&_ul.task-list]:list-none [&_ul.task-list]:pl-0 [&_li.task-item]:flex [&_li.task-item]:items-start [&_li.task-item]:gap-2 [&_li.task-item>div]:min-w-0 [&_li.task-item>div]:flex-1",
              "[&_li.task-item>label]:mt-[3px] [&_li.task-item>label]:size-4 [&_li.task-item>label]:shrink-0 [&_li.task-item>label]:rounded-[3px] [&_li.task-item>label]:border [&_li.task-item>label]:border-input [&_li.task-item>label]:bg-background",
              "[&_li.task-item[data-checked=true]>label]:border-primary [&_li.task-item[data-checked=true]>label]:bg-primary [&_li.task-item[data-checked=true]>div]:line-through [&_li.task-item[data-checked=true]>div]:opacity-60",
            )}
          />
        </section>
      )}
    </div>
  )
}

/** The editor's boxes: what the template is, the task it makes, and what it asks for. */
function TemplateEditor({ at }: { at: Templates }) {
  const id = useId()
  const e = at.editing
  if (!e) return null
  const d = e.draft
  const set = (patch: Partial<Draft>) => at.change({ ...d, ...patch })
  const types = at.typesOf(e.workspace)
  const fields = [...at.fieldsOf(e.workspace)]
  const typeName = types.find((t) => t.id === d.type)?.name
  // Who may be given its tasks: a project's people and the AI teammates (the workspace's: the teammates, who work in
  // every project). One outside both lists shows as the server names them.
  const members = e.workspace ? [] : (at.place?.people ?? [])
  const teammates = at.place?.teammates ?? []
  const people = members.map((m) => ({ user_uuid: m.user_uuid, user_name: displayNameOf(m) || "A member" }))
  const who = !d.assignee ? undefined : ([...members, ...teammates].find((m) => m.user_uuid === d.assignee) ?? (e.template?.assignee_who?.user_uuid === d.assignee ? e.template.assignee_who : ({ user_uuid: d.assignee, user_name: "Someone outside this project" } as UserProfileDataInterface)))
  // A preset status the place no longer has stays listed, so the template keeps it until it's changed.
  const statuses = at.statusesOf(e.workspace)
  const status = statuses.find((s) => s.value.toLowerCase() === d.status.toLowerCase())
  const statusItems = !d.status || status ? statuses : [...statuses, { value: d.status, label: `${d.status} (not a status here)` }]
  return (
    <div className="grid gap-4">
      {at.place?.partial && <p role="status" className="text-sm text-ink-2">{"Some of this place's lists didn't load. What the template has stays as it is."}</p>}
      <Row id={`${id}-name`} label="Template name">
        <Input id={`${id}-name`} value={d.name} maxLength={MOST.name} onChange={(v) => set({ name: v.target.value })} placeholder="Bug report" />
      </Row>
      <Row id={`${id}-about`} label="What it's for">
        <Input id={`${id}-about`} value={d.about} maxLength={MOST.about} onChange={(v) => set({ about: v.target.value })} placeholder="What broke, and how to see it" />
      </Row>
      <Row id={`${id}-title`} label="Task name" hint="Left for whoever makes the task when empty.">
        <Input id={`${id}-title`} value={d.title} onChange={(v) => set({ title: v.target.value })} />
      </Row>
      <div className="grid gap-4 sm:grid-cols-2">
        <Row id={`${id}-type`} label="Type">
          <Select value={d.type || NONE} onValueChange={(v) => set({ type: v === NONE ? "" : v, isDefault: v === NONE ? false : d.isDefault })}>
            <SelectTrigger id={`${id}-type`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No type</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {/* Drawn beside the name, so it is read once ("Bug"), as the New task form's type picker does. */}
                    <span aria-hidden className="inline-flex">
                      <TaskTypeGlyph type={t} className="size-4" />
                    </span>
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row id={`${id}-priority`} label="Priority">
          <Select value={d.priority || NONE} onValueChange={(v) => set({ priority: v === NONE ? "" : v })}>
            <SelectTrigger id={`${id}-priority`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Row id={`${id}-status`} label="Status">
          <Select value={status?.value ?? (d.status || NONE)} onValueChange={(v) => set({ status: v === NONE ? "" : v })}>
            <SelectTrigger id={`${id}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{"The project's first"}</SelectItem>
              {statusItems.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row id={`${id}-assignee`} label="Assignee">
          <AssigneeField id={`${id}-assignee`} people={members} who={who} onPick={(assignee) => set({ assignee })} />
        </Row>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm text-ink-1">
        <span>{typeName ? `New ${typeName} tasks start from this template` : "Pick a type to make this its tasks' default"}</span>
        <Switch checked={d.isDefault && !!d.type} disabled={!d.type} onCheckedChange={(on) => set({ isDefault: on })} aria-label="The default for its type" />
      </label>
      <Row id={`${id}-labels`} label="Labels" hint="Separated by commas.">
        <Input id={`${id}-labels`} value={d.labels} onChange={(v) => set({ labels: v.target.value })} placeholder="bug, customer" />
      </Row>
      <div className="grid grid-cols-2 gap-4">
        <Row id={`${id}-start`} label="Starts, days after it's made">
          <Input id={`${id}-start`} inputMode="numeric" value={d.startDay} maxLength={3} onChange={(v) => set({ startDay: v.target.value })} placeholder={`0 to ${MOST_DAYS}`} />
        </Row>
        <Row id={`${id}-due`} label="Due, days after it's made">
          <Input id={`${id}-due`} inputMode="numeric" value={d.dueDay} maxLength={3} onChange={(v) => set({ dueDay: v.target.value })} placeholder={`0 to ${MOST_DAYS}`} />
        </Row>
      </div>
      <BodyField id={`${id}-body`} value={d.body} onChange={(body) => set({ body })} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-1">Sub-tasks</legend>
        {d.subtasks.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Sub-task ${i + 1}`} value={s} onChange={(v) => set({ subtasks: d.subtasks.map((x, j) => (j === i ? v.target.value : x)) })} />
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Remove sub-task ${i + 1}`} onClick={() => set({ subtasks: d.subtasks.filter((_, j) => j !== i) })}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-11 w-fit gap-1 md:h-8" disabled={d.subtasks.length >= MOST.subtasks} onClick={() => set({ subtasks: [...d.subtasks, ""] })}>
          <Plus className="size-4" />
          Add a sub-task
        </Button>
      </fieldset>
      {fields.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium text-ink-1">Fields</legend>
          {fields.map((f) => (
            <div key={f.id} className="grid gap-1.5">
              <span id={`${id}-f-${f.id}`} className="text-sm text-ink-1">
                {f.name}
              </span>
              <AnswerInput id={`${id}-fv-${f.id}`} labelledBy={`${id}-f-${f.id}`} value={d.fields[f.id]} onChange={(value) => set({ fields: { ...d.fields, [f.id]: value } })} {...taskFieldAnswer(f, people)} />
            </div>
          ))}
        </fieldset>
      )}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-1">Ask before the task is made</legend>
        {askable(fields).map((prop) => (
          <label key={prop} className="flex min-h-11 items-center justify-between gap-3 text-sm text-ink-1 md:min-h-8">
            <span>{askLabel(prop, fields)}</span>
            <Switch checked={d.asks.includes(prop)} onCheckedChange={(on) => set({ asks: on ? [...d.asks, prop] : d.asks.filter((a) => a !== prop) })} aria-label={`Ask for ${askLabel(prop, fields)}`} />
          </label>
        ))}
      </fieldset>
    </div>
  )
}

/** The editor's footer: what went wrong, then Cancel and Save. */
function EditorFooter({ at }: { at: Templates }) {
  return (
    <div className="grid w-full gap-1.5">
      {at.error && (
        <p role="alert" className="text-meta text-danger-ink">
          {at.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={at.close} disabled={at.busy}>
          Cancel
        </Button>
        <Button type="button" className="h-11 md:h-9" onClick={() => void at.save()} busy={at.busy}>
          Save template
        </Button>
      </div>
    </div>
  )
}

const editorTitle = (e: Editing) => (e.template ? `Edit “${e.template.name}”` : "New task template")

/** A project's templates, from its tools: one dialog (a sheet on a phone) whose body is the list or the editor. */
export function ProjectTaskTemplatesDialog({ http, projectId, onClose }: { http: KeepHttp; projectId: string; onClose(): void }) {
  const at = useTemplates(http, projectId)
  const e = at.editing
  return (
    <ResponsiveDialog
      title={e ? editorTitle(e) : "Task templates"}
      description={e ? undefined : "Start a task from a template: its fields, labels, sub-tasks and description filled in, and what it asks for."}
      onClose={e ? at.close : onClose}
      wide
      footer={
        e ? (
          <EditorFooter at={at} />
        ) : (
          <div className="grid w-full gap-1.5">
            {at.error && (
              <p role="alert" className="text-meta text-danger-ink">
                {at.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-11 md:h-9" onClick={onClose}>
                Done
              </Button>
              {at.list?.can_manage && (
                <Button type="button" className="h-11 gap-1 md:h-9" onClick={at.start}>
                  <Plus className="size-4" />
                  New template
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {e ? (
        <TemplateEditor at={at} />
      ) : at.failed ? (
        <SettingsCardError what="the task templates" onRetry={() => void at.read()} />
      ) : at.list ? (
        <TemplateRows at={at} inProject />
      ) : (
        <SettingsRowsSkeleton rows={3} control="button" />
      )}
    </ResponsiveDialog>
  )
}

/** The workspace's templates, in Admin › Permissions: the list in its card, the editor in a dialog (a sheet on a phone). */
export function WorkspaceTaskTemplatesCard({ http }: { http: KeepHttp }) {
  const at = useTemplates(http)
  return (
    <SettingsSection
      id="task-templates"
      title="Task templates"
      description="Templates every project can start a task from. A project's admins add its own in the project's tools."
      action={
        at.list?.can_manage ? (
          <Button type="button" variant="outline" size="sm" className={cn(sectionActionClass, "gap-1")} onClick={at.start}>
            <Plus className="size-4" />
            New template
          </Button>
        ) : undefined
      }
    >
      <SettingsCard aria-label={at.list ? undefined : "Loading the task templates"}>
        {at.failed ? (
          <SettingsCardError what="the task templates" onRetry={() => void at.read()} />
        ) : at.list ? (
          <div className="set-row">
            <TemplateRows at={at} inProject={false} />
            {at.error && !at.editing && (
              <p role="alert" className="text-meta text-danger-ink">
                {at.error}
              </p>
            )}
          </div>
        ) : (
          <SettingsRowsSkeleton rows={3} control="button" />
        )}
      </SettingsCard>
      {at.editing && (
        <ResponsiveDialog title={editorTitle(at.editing)} onClose={at.close} wide footer={<EditorFooter at={at} />}>
          <TemplateEditor at={at} />
        </ResponsiveDialog>
      )}
    </SettingsSection>
  )
}

/** The project tools' entry loads this chunk for its default: the project's dialog. */
export default ProjectTaskTemplatesDialog
