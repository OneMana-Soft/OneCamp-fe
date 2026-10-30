"use client"

// Intake forms, owner side (package 9 R4): a project's admins build a form,
// with pages, questions that show on earlier answers and answers that fill
// the task's own fields, share its link, and read what comes in. Every answer
// arrives as a task in the project, with the files its visitor added, or as a
// row of a table the form fills (R4b). A table keeps forms of its own too
// (tables B5, TableFormsDialog): the same dialog, each answer a row of that
// table. A dialog on a computer, with the form as visitors will see it beside
// the questions; on a phone the bottom sheet, its actions pinned
// (ResponsiveDialog).

import * as React from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Tile } from "@/components/ui/graphics/Tile"
import { Pick } from "@/components/ui/pick"
import { RowMenu, StateWord } from "@/components/admin/connectParts"
import { FormPages } from "@/components/forms/FormPages"
import { ItemCard } from "@/components/project/forms/FormItemCard"
import { FormResponses } from "@/components/project/forms/FormResponses"
import { Check, CircleAlert, CircleCheck, ClipboardList, Columns3, Copy, ExternalLink, Eye, ListTodo, PanelTop, Pencil, Plus, Table2, Trash2 } from "@/lib/icons"
import { projectFormsKey, tableFormsKey, useFormTables, useFormsAt, useTableColumns, type SavedForm } from "@/hooks/useProjectForms"
import { useToast } from "@/hooks/use-toast"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"
import { useConfirm } from "@/hooks/useConfirm"
import { useProjectFields } from "@/hooks/useProjectFields"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { blankForm, formHue, formUrl, moveField, newFieldId, type FormField, type ProjectForm } from "@/lib/forms/forms"
import { MAX_QUESTIONS, MAX_SECTIONS, columnsAsQuestions, formProblem, questionFor, rowNeeds, tidyForm, withoutItem, type FormColumn } from "@/lib/forms/build"
import type { TaskField } from "@/lib/tasks/fields"
import { LookSection, lookShown, type Picked } from "@/components/project/forms/LookSection"

/** Forms are Projects': their tiles sit on its hue (lib/areas' projects, once that lands). */
const PROJECTS_HUE: CampHue = "moss"
/** The most forms a project, or a table, keeps (business/Form). */
const MAX_FORMS = 20

type Problem = { index: number; message: string }
/** Where its answers go: a task in the project, or a row of a table (picked or not yet). */
type Target = "task" | "table"
type Editing = { kind: "edit"; draft: ProjectForm; target: Target; open: string | null; problem: Problem | null; pane: "questions" | "preview" }
type View = { kind: "list" } | Editing | { kind: "answers"; form: ProjectForm }

/** How many pages a form's sections make: a page before the first section, when anything comes before it. */
const pageCount = (fields: FormField[]) => fields.filter((f) => f.type === "section").length + (fields[0] && fields[0].type !== "section" ? 1 : 0)

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`

/** Where a dialog's forms live: a project's (tasks or rows of any table), or a table's own (its rows alone). */
type Home = { kind: "project"; id: string } | { kind: "table"; id: string; name: string }

export function ProjectFormsDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!open) return null
  return <FormsDialog home={{ kind: "project", id: projectId }} onClose={() => onOpenChange(false)} />
}

/** A table's own forms (tables B5): each answer adds a row to the table; its managers make them. */
export function TableFormsDialog({ tableId, tableName, open, onOpenChange }: { tableId: string; tableName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!open) return null
  return <FormsDialog home={{ kind: "table", id: tableId, name: tableName }} onClose={() => onOpenChange(false)} />
}

function FormsDialog({ home, onClose }: { home: Home; onClose: () => void }) {
  const own = home.kind === "table" ? home : null
  const projectId = own ? "" : home.id
  const url = own ? tableFormsKey(own.id) : projectFormsKey(home.id)
  const { forms, loaded, isLoading, isError, refresh: mutate } = useFormsAt(url, OWN_ERRORS)
  const fields = useProjectFields(own ? undefined : projectId)
  const [view, setView] = React.useState<View>({ kind: "list" })
  // The tables: named in the list, and picked from in the editor; a table's own forms name only it.
  const tableForms = forms.some((f) => f.target_table)
  const { tables: listed } = useFormTables(!own && (tableForms || (view.kind === "edit" && view.target === "table")))
  const ownId = own?.id
  const ownName = own?.name ?? ""
  const tables = React.useMemo(() => (ownId ? [{ id: ownId, name: ownName }] : listed), [ownId, ownName, listed])
  const tableName = (id?: string | null) => tables.find((t) => t.id === id)?.name ?? "a table"
  const { columns } = useTableColumns(own ? own.id : view.kind === "edit" && view.target === "table" ? view.draft.target_table : null)
  const [saving, setSaving] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const { toast } = useToast()
  const confirm = useConfirm()
  // A field mapping is checked against the project's fields only once they're read.
  const project = fields.isLoading || fields.isError ? undefined : fields.fields

  const editing = (patch: Partial<Editing>) => setView((v) => (v.kind === "edit" ? { ...v, ...patch } : v))
  // What lands after a wait (a picture's upload) patches the draft as it is then, so an edit made meanwhile stays,
  // and only the form it was for (by id; "" for a new one).
  const patchDraft = (patch: Partial<ProjectForm>, forId: string) =>
    setView((v) => (v.kind === "edit" && (v.draft.id ?? "") === forId ? { ...v, draft: { ...v.draft, ...patch }, problem: null } : v))
  const edit = (form: ProjectForm) =>
    setView({ kind: "edit", draft: { ...form, confirmation: form.confirmation ?? "" }, target: own || form.target_table ? "table" : "task", open: null, problem: null, pane: "questions" })
  /** A new form: a table's own asks for each of its columns from the start. */
  const blank = (): ProjectForm => (own ? { ...blankForm(), fields: columns ? columnsAsQuestions([], columns) : [], title_field: "", target_table: own.id } : blankForm())

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(formUrl(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast({ title: "Couldn't copy", description: formUrl(token), tone: "error" })
    }
  }
  const remove = (f: SavedForm) =>
    confirm({
      title: `Delete the form “${f.title}”?`,
      description: `Its link stops working for anyone who has it. ${f.submissions ? (own ? `The ${plural(f.submissions, "row", "rows")} its answers added stay in the table.` : `The ${plural(f.submissions, "task", "tasks")} its answers made stay in the project.`) : "Nobody has answered it yet."}`,
      confirmText: "Delete form",
      destructive: true,
      onConfirm: async () => {
        try {
          await axiosInstance.post(`${url}/${f.id}/delete`, {}, OWN_ERRORS)
          offerUndo(deletedTitle(f.title), () => restore(axiosInstance, "form", f.id, mutate), own ? "Rows it added stay in the table." : "Tasks it made stay in the project.")
          void mutate()
        } catch (e) {
          toast({ title: "Couldn't delete it", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        }
      },
    })
  const save = async () => {
    if (view.kind !== "edit") return
    const tidy = tidyForm(view.draft)
    const problem = view.target === "table" && !tidy.target_table ? { index: -1, message: "Pick the table its answers go to." } : formProblem(tidy, project, columns)
    if (problem) return editing({ problem, open: problem.index >= 0 ? tidy.fields[problem.index]?.id ?? view.open : view.open, pane: "questions" })
    setSaving(true)
    editing({ problem: null })
    try {
      const res = await axiosInstance.post(url, tidy)
      const saved = (res.data as { data?: ProjectForm }).data
      toast({ title: view.draft.id ? "Saved" : "Form ready", description: saved?.token ? formUrl(saved.token) : undefined })
      await mutate()
      setView({ kind: "list" })
    } catch (e) {
      editing({ problem: { index: -1, message: apiErrorMessage(e, "Try again in a moment.") } })
    } finally {
      setSaving(false)
    }
  }

  let title = "Forms"
  let description = own
    ? `Share a form with anyone: each answer adds a row to ${own.name}, its questions filling the columns you choose.`
    : "Share a form with anyone: each answer becomes a task here, or a row in a table, filled in as you choose."
  let body: React.ReactNode
  let footer: React.ReactNode = <Button type="button" variant="ghost" onClick={onClose}>Close</Button>

  if (view.kind === "edit") {
    title = view.draft.id ? "Edit form" : "New form"
    description = view.target === "table"
      ? "Sections make pages, a question can show on an earlier answer, and each answer fills a column of the row."
      : "Sections make pages, a question can show on an earlier answer, and answers can fill the task's own fields."
    body = <Editor view={view} project={fields.fields} tables={tables} columns={columns} onChange={editing} onDraft={patchDraft} fixedTable={own?.name} />
    footer = (
      <>
        {view.problem && <p role="alert" className="text-xs text-danger-ink sm:mr-auto sm:self-center">{view.problem.message}</p>}
        <Button type="button" variant="ghost" onClick={() => setView({ kind: "list" })} disabled={saving}>Back</Button>
        <Button type="button" onClick={() => void save()} busy={saving}>{saving ? "Saving…" : view.draft.id ? "Save" : "Create form"}</Button>
      </>
    )
  } else if (view.kind === "answers") {
    title = `Answers: ${view.form.title}`
    description = view.form.target_table ? `The latest, newest first. Each one added a row to ${tableName(view.form.target_table)}.` : "The latest, newest first. Each one made a task in the project."
    body = <FormResponses url={url} projectId={projectId} form={view.form} hue={formHue(view.form.title, view.form.token)} />
    footer = <Button type="button" variant="ghost" onClick={() => setView({ kind: "list" })}>Back</Button>
  } else if (isError && !loaded) {
    body = <ErrorState compact subject={own ? "this table's forms" : "this project's forms"} onRetry={() => void mutate()} />
  } else if (isLoading || !loaded) {
    body = (
      <div role="status" aria-label="Loading forms" className="space-y-2">
        {[0, 1].map((i) => <Skeleton key={i} className="h-[68px] w-full rounded-xl" />)}
      </div>
    )
  } else {
    body = forms.length === 0 ? (
      <EmptyState icon={ClipboardList} hue={PROJECTS_HUE} title="No forms yet"
        description={own
          ? `Make one for sign-ups, orders or requests. A visitor answers it, page by page, and the answer lands in ${own.name} as a row.`
          : "Make one for requests, bug reports or sign-ups. A visitor answers it, page by page, and the answer lands here as a task."} />
    ) : (
      <ul aria-label="Forms" className="space-y-2">
        {forms.map((f) => {
          const questions = f.fields.filter((x) => x.type !== "section").length
          const pages = pageCount(f.fields)
          const answers = f.submissions ?? 0
          return (
            <li key={f.id} data-form-row={f.id} className="flex items-start gap-3 rounded-xl bg-raised p-3 shadow-e1">
              <Tile hue={PROJECTS_HUE} size="md" className="max-sm:hidden"><ClipboardList /></Tile>
              <div className="min-w-0 flex-1">
                {/* The title has its own line (two at most); each fact under it stays whole. */}
                <button type="button" aria-label={`Edit ${f.title}`} onClick={() => edit(f)} className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="line-clamp-2 break-words text-sm font-semibold text-ink">{f.title}</span>
                </button>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-3">
                  <StateWord tone={f.active ? "success" : "neutral"}>{f.active ? "Taking answers" : "Off"}</StateWord>
                  {f.target_table && !own && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Table2 aria-hidden="true" className="size-3.5" />
                      Adds rows to {tableName(f.target_table)}
                    </span>
                  )}
                  <span className="whitespace-nowrap tabular-nums">{plural(questions, "question", "questions")}</span>
                  {pages > 1 && <span className="whitespace-nowrap tabular-nums">{plural(pages, "page", "pages")}</span>}
                  {/* Answers to read open; none yet is plain words, with nothing to open (design review). */}
                  {answers ? (
                    <Button type="button" variant="link" size="xs" className="h-11 whitespace-nowrap px-0 tabular-nums md:h-6" onClick={() => setView({ kind: "answers", form: f })}>
                      {plural(answers, "answer", "answers")}
                    </Button>
                  ) : (
                    <span className="whitespace-nowrap">No answers yet</span>
                  )}
                </span>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:size-8" aria-label={`Copy the link to ${f.title}`} onClick={() => void copy(f.token!)}>
                {copied === f.token ? <Check /> : <Copy />}
              </Button>
              <RowMenu label={`More for ${f.title}`} items={[
                { label: "Edit", icon: Pencil, onSelect: () => edit(f) },
                { label: "Open the form", icon: ExternalLink, onSelect: () => window.open(formUrl(f.token!), "_blank", "noopener") },
                { label: "Delete", icon: Trash2, onSelect: () => remove(f), destructive: true, separated: true },
              ]} />
            </li>
          )
        })}
      </ul>
    )
    const full = forms.length >= MAX_FORMS
    footer = (
      <>
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        <Button type="button" className="gap-1.5" disabled={full} disabledReason={full ? `A ${own ? "table" : "project"} keeps at most ${MAX_FORMS} forms. Delete one to make another.` : undefined} onClick={() => edit(blank())}>
          <Plus className="size-4" /> New form
        </Button>
      </>
    )
  }

  return (
    <ResponsiveDialog title={title} description={description} onClose={onClose} xl={view.kind === "edit"} wide focusSelf footer={footer}>
      <div data-project-forms="" data-table-forms={own ? "" : undefined}>{body}</div>
    </ResponsiveDialog>
  )
}

/** The editor: the questions on the left, the form as visitors see it on the right; on a phone or a tablet, one or the other. */
function Editor({ view, project, tables, columns, onChange, onDraft, fixedTable }: {
  view: Editing
  project: TaskField[]
  tables: { id: string; name: string }[]
  columns?: FormColumn[]
  onChange: (patch: Partial<Editing>) => void
  /** Patches the draft as it is when called (FormsDialog patchDraft): for what lands after a wait. */
  onDraft: (patch: Partial<ProjectForm>, forId: string) => void
  /** A table's own form: the table its answers go to, named and never picked. */
  fixedTable?: string
}) {
  const { toast } = useToast()
  const f = view.draft
  // Pictures picked while the builder is open (LookSection), drawn from the browser's copies, let go when it closes.
  const [picked, setPicked] = React.useState<Picked>({})
  const copies = React.useRef<string[]>([])
  React.useEffect(() => () => copies.current.forEach((src) => URL.revokeObjectURL(src)), [])
  const look = lookShown(f, picked)
  const table = view.target === "table"
  const draft = (patch: Partial<ProjectForm>, open?: string | null) => onChange({ draft: { ...f, ...patch }, problem: null, ...(open !== undefined ? { open } : {}) })
  const questions = f.fields.filter((x) => x.type !== "section").length
  const sections = f.fields.length - questions
  const add = (section: boolean) => {
    const id = newFieldId(f.fields)
    const item: FormField = section ? { id, label: "", type: "section", required: false } : { id, label: "", type: "short_text", required: false }
    draft({ fields: [...f.fields, item] }, id)
  }
  const remove = (i: number) => {
    const { fields, released, titleField } = withoutItem(f.fields, i, f.title_field)
    draft({ fields, title_field: titleField })
    if (released.length) {
      toast({
        title: released.length === 1 ? `“${released[0]}” shows to everyone now` : `“${released[0]}” and ${released.length - 1} more show to everyone now`,
        description: "They showed only on the answer to the question you took out.",
      })
    }
  }
  // Each item's number: a question's among the questions, a section's the page it starts.
  let q = 0
  let page = f.fields[0]?.type === "section" ? 0 : 1
  const numbers = f.fields.map((x) => (x.type === "section" ? ++page : ++q))
  const named = f.fields.filter((x) => x.type !== "section" && x.type !== "checkbox" && x.type !== "file")
  const setsPriority = f.fields.some((x) => x.maps_to === "priority")
  /** Where its answers go, changed: what each question filled for the other kind lets go. */
  const retarget = (target: Target) => {
    if (target === view.target) return
    const fields = f.fields.map((x) => {
      const t = x.maps_to ?? ""
      if (target === "table" ? !t.startsWith("column:") : t.startsWith("column:")) {
        const out = { ...x }
        delete out.maps_to
        delete out.map
        return out
      }
      return x
    })
    onChange({ target, draft: { ...f, fields, target_table: target === "table" ? f.target_table : null }, problem: null })
  }

  return (
    // One column on a phone that never grows past the sheet (minmax(0, 1fr)):
    // an auto column took the width of a card's longest unwrapped chip
    // ("Shows when ‘What kind of request is it?’ is A bug") and ran 30px past
    // the screen at 390.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-6">
      <SegmentedControl aria-label="Show" className="lg:hidden" value={view.pane} onValueChange={(pane) => onChange({ pane })}
        options={[{ value: "questions", label: "Questions", icon: ListTodo }, { value: "preview", label: "Preview", icon: Eye }]} />
      <div className={cn("grid content-start gap-4", view.pane === "preview" && "max-lg:hidden")} data-form-editor="">
        <div className="grid gap-1.5">
          <Label htmlFor="form-title" className="text-xs text-ink-2">Title</Label>
          <Input id="form-title" value={f.title} maxLength={120} placeholder="Design requests" onChange={(e) => draft({ title: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="form-desc" className="text-xs text-ink-2">Intro <span className="font-normal text-ink-3">(optional)</span></Label>
          <Textarea id="form-desc" value={f.description} maxLength={2000} rows={2} className="resize-none" placeholder="What this form is for, and what happens next." onChange={(e) => draft({ description: e.target.value })} />
        </div>

        <LookSection
          form={f}
          picked={picked}
          onPicked={(kind, id, src) => {
            copies.current.push(src)
            setPicked((p) => ({ ...p, [id]: src }))
            onDraft(kind === "cover" ? { cover_id: id } : { logo_id: id }, f.id ?? "")
          }}
          onRemove={(kind) => draft(kind === "cover" ? { cover_id: "" } : { logo_id: "" })}
        />

        <section aria-labelledby="form-target" data-form-target="" className="grid gap-3 rounded-xl bg-sunken p-3">
          {fixedTable ? (
            <h3 id="form-target" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
              <Table2 aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 truncate">Each answer adds a row to {fixedTable}</span>
            </h3>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="form-target" className="text-sm font-semibold text-ink">Each answer becomes</h3>
              <SegmentedControl aria-labelledby="form-target" value={view.target} onValueChange={retarget}
                options={[{ value: "task", label: "A task", icon: ListTodo }, { value: "table", label: "A table row", icon: Table2 }]} />
            </div>
          )}
          {table && (
            <TableTarget fields={f.fields} tables={tables} tableId={f.target_table ?? ""} columns={columns} fixed={!!fixedTable}
              onTable={(id) => draft({ target_table: id })} onFields={(fields) => draft({ fields })} />
          )}
        </section>

        <div className="grid grid-cols-1 gap-2">
          <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
            Questions
            <span className="text-meta font-normal tabular-nums text-ink-3">{questions} of {MAX_QUESTIONS}{sections ? ` · ${plural(pageCount(f.fields), "page", "pages")}` : ""}</span>
          </h3>
          {f.fields.map((x, i) => (
            <ItemCard key={x.id} fields={f.fields} index={i} number={numbers[i]} titleField={f.title_field} hue={PROJECTS_HUE} project={project} table={table ? { columns } : undefined}
              open={view.open === x.id} onToggle={() => onChange({ open: view.open === x.id ? null : x.id })}
              onChange={(fields) => draft({ fields })} onRemove={() => remove(i)} onMove={(by) => draft({ fields: moveField(f.fields, i, by) })}
              problem={view.problem && view.problem.index === i ? view.problem.message : undefined} link={f.token ? formUrl(f.token) : undefined} />
          ))}
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" className="h-11 gap-1.5 text-brand-text md:h-8" disabled={questions >= MAX_QUESTIONS}
              disabledReason={questions >= MAX_QUESTIONS ? `A form asks at most ${MAX_QUESTIONS} questions.` : undefined} onClick={() => add(false)}>
              <Plus className="size-4" /> Add a question
            </Button>
            <Button type="button" variant="ghost" className="h-11 gap-1.5 text-ink-2 md:h-8" disabled={sections >= MAX_SECTIONS}
              disabledReason={sections >= MAX_SECTIONS ? `A form has at most ${MAX_SECTIONS} sections.` : undefined} onClick={() => add(true)}>
              <PanelTop className="size-4" /> Add a section
            </Button>
          </div>
        </div>

        <section aria-labelledby="form-sent" className="grid gap-3 rounded-xl bg-sunken p-3">
          <h3 id="form-sent" className="text-sm font-semibold text-ink">When it&apos;s sent</h3>
          {!table && <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-ink-2">The task is named by</span>
              <Pick label="Task name comes from" value={named.some((x) => x.id === f.title_field) ? f.title_field : named[0]?.id ?? ""}
                onChange={(title_field) => draft({ title_field })} options={named.map((x, i) => ({ value: x.id, label: x.label.trim() || `Question ${i + 1}` }))} className="w-full" />
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-ink-2">{setsPriority ? "Priority, when it isn't answered" : "Its priority"}</span>
              <Pick label="Priority" value={f.priority} onChange={(p) => draft({ priority: p as ProjectForm["priority"] })}
                options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} className="w-full" />
            </div>
          </div>}
          <div className="grid gap-1.5">
            <Label htmlFor="form-after" className="text-xs text-ink-2">After sending</Label>
            <Textarea id="form-after" value={f.confirmation ?? ""} maxLength={500} rows={2} className="resize-none"
              placeholder={`Thanks. The team behind “${f.title.trim() || "this form"}” has it now.`} onChange={(e) => draft({ confirmation: e.target.value })} />
            <p className="text-meta text-ink-3">What a visitor reads once it&apos;s sent. Left empty, it says the line above.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="form-redirect" className="text-xs text-ink-2">Or go to a page <span className="font-normal text-ink-3">(optional)</span></Label>
            <Input id="form-redirect" type="url" inputMode="url" value={f.redirect ?? ""} maxLength={500} placeholder="https://example.com/thanks"
              onChange={(e) => draft({ redirect: e.target.value })} />
            <p className="text-meta text-ink-3">Once it&apos;s sent, the visitor goes there instead of reading the message.</p>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-ink">
            <span>
              Taking answers
              <span className="block text-meta text-ink-3">Turn it off to close the form without deleting it.</span>
            </span>
            <Switch checked={f.active} onCheckedChange={(active) => draft({ active })} aria-label="Taking answers" />
          </label>
        </section>
      </div>
      <div className={cn("lg:sticky lg:top-0 lg:self-start", view.pane === "questions" && "max-lg:hidden")}>
        <FormPreview form={f} look={look} />
      </div>
    </div>
  )
}

/** The form as a visitor will answer it, working: answers open their questions and Next turns the page, but nothing is checked or sent. */
export function FormPreview({ form, look }: { form: Pick<ProjectForm, "title" | "description" | "fields" | "confirmation">; look?: { cover?: string; logo?: string } }) {
  const content = React.useMemo(() => {
    const tidy = tidyForm({ title_field: "", priority: "medium", active: true, ...form })
    return {
      ...tidy,
      title: tidy.title || "Untitled form",
      fields: tidy.fields.map((x) => ({ ...x, label: x.label || (x.type === "section" ? "Untitled section" : "Untitled question") })),
      cover: look?.cover,
      logo: look?.logo,
    }
  }, [form, look?.cover, look?.logo])
  return (
    <aside aria-label="Preview" data-form-preview="" className="grid content-start gap-2">
      <p className="text-xs font-medium text-ink-3">Preview <span className="font-normal">· answers open their questions, and Next turns the page</span></p>
      <FormPages form={content} hue={formHue(form.title)} preview onSend={async () => ""} />
    </aside>
  )
}

/**
 * A form that adds rows: the table its answers go to, a question for each
 * column to start from, and the columns every row needs, each saying whether
 * everyone is asked for it, with a question to add for one nobody is.
 */
function TableTarget({ fields, tables, tableId, columns, fixed, onTable, onFields }: {
  fields: FormField[]
  tables: { id: string; name: string }[]
  tableId: string
  columns?: FormColumn[]
  /** The table is the form's home: nothing to pick. */
  fixed?: boolean
  onTable: (id: string) => void
  onFields: (fields: FormField[]) => void
}) {
  const needs = columns ? rowNeeds(fields, columns) : []
  const add = (c: FormColumn) => {
    const q = questionFor(c, fields)
    if (q) onFields([...fields, q])
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!fixed && (
          <Pick label="Table" value={tableId} onChange={onTable} placeholder={tables.length ? "Pick a table" : "No tables you can add rows to"}
            options={tables.map((t) => ({ value: t.id, label: <span className="flex items-center gap-2"><Table2 aria-hidden="true" className="size-3.5 text-ink-3" />{t.name}</span> }))}
            className="w-full md:w-64" />
        )}
        {columns && (
          <Button type="button" variant="ghost" className="h-11 gap-1.5 text-ink-2 md:h-8" onClick={() => onFields(columnsAsQuestions(fields, columns))}>
            <Columns3 className="size-4" /> Ask for every column
          </Button>
        )}
      </div>
      {needs.length > 0 && (
        <div className="grid gap-1.5">
          <p id="form-needs" className="text-xs font-medium text-ink-2">Every row needs</p>
          <ul aria-labelledby="form-needs" className="grid gap-1">
            {needs.map(({ column, state }) => (
              <li key={column.id} aria-label={column.name} data-filled={state === "always" ? "yes" : "no"} className="flex min-h-11 items-center gap-2 text-ui-sm md:min-h-8">
                {state === "always" ? (
                  <CircleCheck aria-hidden="true" className="hue-moss size-4 shrink-0 text-hue" />
                ) : (
                  <CircleAlert aria-hidden="true" className="hue-sun size-4 shrink-0 text-hue" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{column.name}</span>
                  <span className="text-ink-3">
                    {state === "always" ? " · asked of everyone" : state === "sometimes" ? " · make its question required and always shown" : state === "never" ? " · a form can't fill it" : " · no question asks for it"}
                  </span>
                </span>
                {state === "missing" && (
                  <Button type="button" variant="ghost" className="h-11 shrink-0 text-brand-text md:h-7" onClick={() => add(column)}>
                    Ask for it
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
