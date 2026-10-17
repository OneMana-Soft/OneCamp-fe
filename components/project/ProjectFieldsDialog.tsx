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

import { useState } from "react"
import { fieldKeyDown } from "@/lib/keys/ime"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { OptionsEditor } from "@/components/fields/OptionsEditor"
import { Calendar, CheckSquare, ChevronDown, ChevronUp, CircleDot, Coins, Hash, Link, ListTodo, Plus, Trash2, Type, User } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useProjectFields, type FieldInput } from "@/hooks/useProjectFields"
import { FIELD_TYPES, typeLabel, type FieldOption, type FieldType, type TaskField } from "@/lib/tasks/fields"
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
  const { fields, create, update, reorder, remove } = useProjectFields(open ? projectId : undefined)
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

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const ids = fields.map((f) => f.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => reorder(ids))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Fields</DialogTitle>
          <DialogDescription>
            Give this project&apos;s tasks fields of their own, like a budget, a channel or a reviewer. They show in each task&apos;s panel and as columns in the
            list, the list can be filtered by them, and cards show the ones you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {fields.length === 0 && <p className="py-4 text-center text-sm text-ink-2">No fields yet. Add the first below: a select for stages, a number for points, a date for a deadline.</p>}
          {fields.map((f, i) => (
            <FieldRow
              key={f.id}
              field={f}
              busy={busy}
              first={i === 0}
              last={i === fields.length - 1}
              onMove={(dir) => move(i, dir)}
              onSave={(input) => run(() => update(f.id, input))}
              onDelete={() => run(() => remove(f.id), `Deleted ${f.name}`)}
            />
          ))}
        </div>

        {fields.length >= MAX_FIELDS ? (
          <p className="border-t border-line pt-3 text-sm text-muted-foreground">This project has {MAX_FIELDS} fields, the most it can have.</p>
        ) : (
          <AddField busy={busy} onAdd={(input) => run(() => create(input), `Added ${input.name}`)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function inputOf(field: TaskField, patch: Partial<FieldInput> = {}): FieldInput {
  return { name: field.name, type: field.type, options: field.options, currency: field.currency, on_card: field.on_card, ...patch }
}

function FieldRow({
  field,
  busy,
  first,
  last,
  onMove,
  onSave,
  onDelete,
}: {
  field: TaskField
  busy: boolean
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onSave: (input: FieldInput) => Promise<boolean>
  onDelete: () => void
}) {
  const [name, setName] = useState(field.name)
  const [currency, setCurrency] = useState(field.currency ?? "")
  const [deleting, setDeleting] = useState(false)

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
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setName(field.name)
          })}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 shadow-none focus-visible:border-input"
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
          onClick={() => setDeleting((d) => !d)}
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

      {deleting && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken px-3 py-2 text-sm">
          <span className="text-muted-foreground">Every task&apos;s {field.name} goes with it.</span>
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
              Delete {field.name}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddField({ busy, onAdd }: { busy: boolean; onAdd: (input: FieldInput) => Promise<boolean> }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<FieldType>("select")
  const [options, setOptions] = useState<DraftOption[]>([])
  const [currency, setCurrency] = useState("")
  const needsOptions = isChoice(type) && options.length === 0
  const submit = async () => {
    const n = name.trim()
    if (!n || needsOptions) return
    const ok = await onAdd({ name: n, type, options: isChoice(type) ? asSent(options) : undefined, currency: type === "money" ? currency.trim().toUpperCase() : undefined })
    if (ok) {
      setName("")
      setOptions([])
      setCurrency("")
    }
  }
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
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
        <Button type="submit" size="sm" className="h-8 gap-1" disabled={busy || !name.trim() || needsOptions}>
          <Plus className="h-4 w-4" />
          Add field
        </Button>
      </div>
      {isChoice(type) && (
        <div className="pl-1">
          <OptionsEditor<DraftOption> {...OPTIONS} options={options} busy={busy} onChange={(next) => setOptions(next)} />
          {needsOptions && <p className="mt-1 text-xs text-muted-foreground">Add its options first: what can be chosen.</p>}
        </div>
      )}
      {type === "money" && <p className="text-xs text-muted-foreground">Without a currency it takes the project&apos;s billing currency, or USD.</p>}
    </form>
  )
}
