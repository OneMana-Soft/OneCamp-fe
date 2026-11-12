"use client"

/**
 * A project's custom task fields, for its admins: add one, rename it, change
 * its options or currency, show it on cards, reorder, delete.
 *
 * A field's kind is chosen when it's made and stays: a value of one kind
 * means nothing as another. Options keep their identity through a rename, so
 * renaming "Blog" to "Blog post" changes it on every task; taking an option
 * away takes it off the tasks that had it, and the dialog says so first.
 */

import { useCallback, useId, useRef, useState } from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { OptionsEditor } from "@/components/fields/OptionsEditor"
import { Calendar, CheckSquare, ChevronDown, ChevronUp, CircleDot, Coins, Hash, Link, ListTodo, Plus, Sigma, Trash2, Type, User } from "@/lib/icons"
// The formula editor comes with this dialog's chunk, never a lazy group of its own (V-693/V-752: one re-cut the /app shell).
import { FormulaEditor, type FormulaInput } from "@/components/formula/FormulaEditor"
import { useToast } from "@/hooks/use-toast"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"
import { useProjectFields, type FieldInput } from "@/hooks/useProjectFields"
import { TASK_WRITER } from "@/lib/tasks/formulaShown"
import { FIELD_TYPES, typeLabel, type FieldBuiltin, type FieldOption, type FieldType, type TaskField } from "@/lib/tasks/fields"
import type { FormulaPreview } from "@/services/tableCalls"
import { STATUS_COLORS } from "@/lib/taskStatus"

/** As the server allows (business/TaskField). */
const MAX_FIELDS = 30
const MAX_OPTIONS = 50

/** An option as the dialog edits it: a saved one has its id, a new one a key
 * of its own until it's saved, so rows keep their names when one is removed. */
type DraftOption = Partial<FieldOption> & { label: string; color: string; key?: string }

let drafts = 0
const draftKey = () => `draft-${++drafts}`

/** Options as the server takes them: id (if saved), label, colour. */
const asSent = (options: DraftOption[]) => options.map(({ id, label, color }) => ({ id, label, color }))

/** How the one options editor (components/fields) edits a task field's options here. */
const OPTIONS = {
  keyOf: (o: DraftOption) => o.id ?? o.key ?? o.label,
  make: (label: string, options: DraftOption[]): DraftOption => ({ key: draftKey(), label, color: STATUS_COLORS[(options.length + 9) % STATUS_COLORS.length] }),
  max: MAX_OPTIONS,
  maxLength: 40,
}

const isChoice = (t: FieldType) => t === "select" || t === "multi_select"

const KIND_ICON: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  money: Coins,
  date: Calendar,
  select: CircleDot,
  multi_select: ListTodo,
  person: User,
  checkbox: CheckSquare,
  url: Link,
  formula: Sigma,
}

/** What a task's formula may read: the project's fields and the task's built-ins, each with its kind's glyph. */
const BUILTIN_GLYPH = { number: Hash, date: Calendar, text: Type, checkbox: CheckSquare } as const
const inputsOf = (fields: TaskField[], builtins: FieldBuiltin[]): FormulaInput[] => [
  ...fields.map((f) => ({ id: f.id, name: f.name, label: typeLabel(f.type), glyph: KIND_ICON[f.type] })),
  ...builtins.map((b) => ({ id: `builtin:${b.id}`, name: b.name, label: "Built in", glyph: BUILTIN_GLYPH[b.result] ?? Type })),
]
const HELP = "Fields go in braces, like {Spend} or {Due}. Use + − * / for numbers, & to join text, /* notes */ for yourself, and the functions below."
const NO_SAMPLES = "Sample values appear here once tasks have them."

type Formula = { inputs: FormulaInput[]; preview: (formula: string, fieldId?: string) => Promise<FormulaPreview> }

/** The one formula editor, as a task field's (J-F WEB). */
function TaskFormula({ formula, fieldId, value, onChange }: { formula: Formula; fieldId?: string; value: string; onChange: (v: string) => void }) {
  return <FormulaEditor inputs={formula.inputs} preview={formula.preview} write={TASK_WRITER} help={HELP} noSamples={NO_SAMPLES} fieldId={fieldId} value={value} onChange={onChange} />
}

/** A field's kind as a 24 px tile with its icon, then its name (design v3, work.md W47). */
export function FieldKind({ type }: { type: FieldType }) {
  const Icon = KIND_ICON[type] ?? Type
  return (
    <span data-field-kind={type} className="inline-flex shrink-0 items-center gap-1.5 px-1 text-xs text-ink-3">
      <span className="flex size-6 items-center justify-center rounded-md bg-press text-ink-2">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      {typeLabel(type)}
    </span>
  )
}

export function ProjectFieldsDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { fields, builtins, create, update, reorder, remove, preview, refresh, refreshTasks, http } = useProjectFields(open ? projectId : undefined)
  // The last text the server couldn't work out: Save formula holds on it. Only
  // the answer for the text last checked moves it (answers come out of order).
  const [unworkable, setUnworkable] = useState<string | null>(null)
  const lastChecked = useRef("")
  const checked = useCallback(
    async (text: string, fieldId?: string) => {
      lastChecked.current = text
      const r = await preview(text, fieldId)
      if (lastChecked.current === text) setUnworkable(r.error ? text : null)
      return r
    },
    [preview],
  )
  const formula: Formula = { inputs: inputsOf(fields, builtins ?? []), preview: checked }
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await fn()
      if (done) toast({ title: done })
      return true
    } catch {
      // The request layer has said what went wrong.
      return false
    } finally {
      setBusy(false)
    }
  }

  // One row open at a time; its actions, or else Add field, in the footer.
  const [editing, setEditing] = useState<RowEdit | null>(null)
  const row = editing ? fields.find((f) => f.id === editing.id) : undefined
  const add = useNewField((input) => run(() => create(input), `Added ${input.name}`))
  const addForm = useId()
  const close = () => setEditing(null)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const ids = fields.map((f) => f.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => reorder(ids))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Top-anchored: its height changes as rows open, and a centred dialog would move what was clicked. */}
      <DialogContent className="sm:max-w-xl mt-24">
        <DialogHeader>
          <DialogTitle>Fields</DialogTitle>
          <DialogDescription>
            Give this project&apos;s tasks fields of their own, like a budget, a channel or a reviewer. They show in each task&apos;s panel and as columns in the
            list, the list can be filtered by them, and cards show the ones you choose.
          </DialogDescription>
        </DialogHeader>

        <OverlayBody className="space-y-3">
          <div className="space-y-2">
            {fields.length === 0 && <p className="py-4 text-center text-sm text-ink-2">No fields yet. Add the first below: a select for stages, a number for points, a date for a deadline.</p>}
            {fields.map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                busy={busy}
                first={i === 0}
                last={i === fields.length - 1}
                formula={formula}
                edit={editing?.id === f.id ? editing : null}
                onEdit={setEditing}
                onMove={(dir) => move(i, dir)}
                onSave={(input) => run(() => update(f.id, input))}
              />
            ))}
          </div>

          {fields.length >= MAX_FIELDS ? (
            <p className="border-t border-line pt-3 text-sm text-muted-foreground">This project has {MAX_FIELDS} fields, the most it can have.</p>
          ) : (
            // One editor at a time: while a row is open its footer acts, so the add form waits (its draft kept).
            !row && <AddField add={add} formId={addForm} busy={busy} formula={formula} />
          )}
        </OverlayBody>

        {row && editing?.mode === "formula" ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              busy={busy}
              disabled={!editing.text.trim() || editing.text === row.formula || editing.text === unworkable}
              onClick={() => void run(() => update(row.id, { ...inputOf(row), formula: editing.text.trim() })).then((ok) => ok && close())}
            >
              Save formula
            </Button>
          </DialogFooter>
        ) : row && editing?.mode === "delete" ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  await remove(row.id)
                  offerUndo(deletedTitle(row.name), () => restore(http, "field", row.id, () => Promise.all([refresh(), refreshTasks()])))
                }).then((ok) => ok && close())
              }
            >
              Delete {row.name}
            </Button>
          </DialogFooter>
        ) : (
          fields.length < MAX_FIELDS && (
            <DialogFooter>
              <Button type="submit" form={addForm} className="gap-1" disabled={!add.ready} busy={busy}>
                <Plus className="h-4 w-4" />
                Add field
              </Button>
            </DialogFooter>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}

function inputOf(field: TaskField, patch: Partial<FieldInput> = {}): FieldInput {
  return { name: field.name, type: field.type, options: field.options, currency: field.currency, on_card: field.on_card, ...patch }
}

/** A row open to change its formula (the draft) or to be deleted. */
type RowEdit = { id: string; mode: "formula"; text: string } | { id: string; mode: "delete" }

function FieldRow({
  field,
  busy,
  first,
  last,
  formula,
  edit,
  onEdit,
  onMove,
  onSave,
}: {
  field: TaskField
  busy: boolean
  first: boolean
  last: boolean
  formula: Formula
  edit: RowEdit | null
  onEdit: (edit: RowEdit | null) => void
  onMove: (dir: -1 | 1) => void
  onSave: (input: FieldInput) => Promise<boolean>
}) {
  const [name, setName] = useState(field.name)
  const [currency, setCurrency] = useState(field.currency ?? "")

  const saveName = () => {
    const n = name.trim()
    if (!n || n === field.name) {
      setName(field.name)
      return
    }
    void onSave(inputOf(field, { name: n })).then((ok) => !ok && setName(field.name))
  }
  const saveCurrency = () => {
    const c = currency.trim().toUpperCase()
    if (c === (field.currency ?? "")) return
    void onSave(inputOf(field, { currency: c })).then((ok) => !ok && setCurrency(field.currency ?? ""))
  }

  return (
    <div className="rounded-lg bg-raised shadow-e1">
      <div className="flex flex-wrap items-center gap-1 p-1">
        <Input dense
          value={name}
          maxLength={40}
          aria-label="Field name"
          // Esc puts a changed name back; with nothing to put back, it closes the dialog.
          data-escape-own={name !== field.name ? "" : undefined}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setName(field.name)
          })}
          // The name keeps room for itself: on a phone the row's other controls wrap
          // to a second line instead of squeezing it to its first letter.
          className="h-8 min-w-32 flex-1 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input"
        />
        <FieldKind type={field.type} />
        {field.type === "money" && (
          <Input dense
            value={currency}
            maxLength={3}
            aria-label={`${field.name} currency`}
            disabled={busy}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            onBlur={saveCurrency}
            onKeyDown={fieldKeyDown((e) => e.key === "Enter" && e.currentTarget.blur())}
            className="h-8 w-16 text-xs uppercase"
          />
        )}
        {field.type === "formula" && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" aria-label={`Edit ${field.name}'s formula`} aria-expanded={edit?.mode === "formula"} disabled={busy} onClick={() => onEdit(edit?.mode === "formula" ? null : { id: field.id, mode: "formula", text: field.formula ?? "" })}>
            Edit
          </Button>
        )}
        <label className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Switch
            checked={field.on_card}
            disabled={busy}
            aria-label={`Show ${field.name} on cards`}
            onCheckedChange={(on) => void onSave(inputOf(field, { on_card: on }))}
          />
          On cards
        </label>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-7" aria-label={`Move ${field.name} up`} disabled={busy || first} onClick={() => onMove(-1)}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-7" aria-label={`Move ${field.name} down`} disabled={busy || last} onClick={() => onMove(1)}>
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-danger-ink"
          aria-label={`Delete ${field.name}`}
          disabled={busy}
          aria-expanded={edit?.mode === "delete"}
          onClick={() => onEdit(edit?.mode === "delete" ? null : { id: field.id, mode: "delete" })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isChoice(field.type) && (
        <div className="border-t border-line px-2 py-2">
          <OptionsEditor<DraftOption>
            {...OPTIONS}
            options={field.options}
            busy={busy}
            // A saved option taken away comes off every task that has it.
            removal={(o) => (o.id ? `“${o.label}” comes off every task that has it.` : null)}
            // A removal is named by id: the server keeps an option a save
            // leaves out (a dialog open before someone added one took it off
            // every task that had it).
            onChange={(options, removed) => void onSave(inputOf(field, { options: asSent(options), ...(removed.length ? { removed_options: removed } : {}) }))}
          />
        </div>
      )}

      {field.error && <p className="border-t border-line px-3 py-2 text-xs text-camp-sun-ink">{field.error}</p>}

      {field.type === "formula" && edit?.mode === "formula" && (
        <div className="border-t border-line px-2 py-2">
          <TaskFormula formula={formula} fieldId={field.id} value={edit.text} onChange={(text) => onEdit({ ...edit, text })} />
        </div>
      )}

      {edit?.mode === "delete" && (
        <p className="border-t border-line bg-sunken px-3 py-2 text-sm text-muted-foreground">Every task&apos;s {field.name} goes with it.</p>
      )}
    </div>
  )
}

function useNewField(onAdd: (input: FieldInput) => Promise<boolean>) {
  const [name, setName] = useState("")
  const [type, setType] = useState<FieldType>("select")
  const [options, setOptions] = useState<DraftOption[]>([])
  const [currency, setCurrency] = useState("")
  const [text, setText] = useState("")
  const needsOptions = isChoice(type) && options.length === 0
  const needsFormula = type === "formula" && !text.trim()
  const submit = async () => {
    const n = name.trim()
    if (!n || needsOptions || needsFormula) return
    const ok = await onAdd({
      name: n,
      type,
      options: isChoice(type) ? asSent(options) : undefined,
      currency: type === "money" ? currency.trim().toUpperCase() : undefined,
      ...(type === "formula" ? { formula: text.trim(), on_card: false } : {}),
    })
    if (ok) {
      setName("")
      setOptions([])
      setCurrency("")
      setText("")
    }
  }
  const ready = !!name.trim() && !needsOptions && !needsFormula
  return { name, setName, type, setType, options, setOptions, currency, setCurrency, text, setText, needsOptions, ready, submit }
}

/** The new field's form; its submit is the footer's. */
function AddField({ add, formId, busy, formula }: { add: ReturnType<typeof useNewField>; formId: string; busy: boolean; formula: Formula }) {
  const { name, setName, type, setType, options, setOptions, currency, setCurrency, text, setText, needsOptions } = add
  return (
    <form
      id={formId}
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        void add.submit()
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <Input
          value={name}
          maxLength={40}
          placeholder="New field, e.g. Budget"
          aria-label="New field name"
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          className="h-8 min-w-0 flex-1"
        />
        <Select value={type} onValueChange={(v) => setType(v as FieldType)} disabled={busy}>
          <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs" aria-label="Kind of field">
            {/* The kind's name only: with its hint the trigger read "Select · One of a". */}
            <SelectValue>{FIELD_TYPES.find((t) => t.value === type)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
                <span className="ml-1 text-muted-foreground">· {t.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {type === "money" && (
          <Input dense
            value={currency}
            maxLength={3}
            placeholder="INR"
            aria-label="Currency"
            disabled={busy}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="h-8 w-16 text-xs uppercase"
          />
        )}
      </div>
      {isChoice(type) && (
        <div className="pl-1">
          <OptionsEditor<DraftOption> {...OPTIONS} options={options} busy={busy} onChange={(next) => setOptions(next)} />
          {needsOptions && <p className="mt-1 text-xs text-muted-foreground">Add its options first: what can be chosen.</p>}
        </div>
      )}
      {type === "formula" && <TaskFormula formula={formula} value={text} onChange={setText} />}
      {type === "money" && <p className="text-xs text-muted-foreground">Without a currency it takes the project&apos;s billing currency, or USD.</p>}
    </form>
  )
}
