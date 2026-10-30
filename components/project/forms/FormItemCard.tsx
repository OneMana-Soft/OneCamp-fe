"use client"

// One item of a form in its builder (components/project/ProjectFormsDialog):
// a question or a section, a calm row until it is opened, then all it can
// be: its kind, words and help, its choices, when it shows (on an earlier
// answer) and what its answer fills: a task's own fields, or a column of the
// table a form adds rows to. A question that takes files fills nothing: its
// files go on the task. Every change goes through lib/forms/build, which
// keeps the form whole: a choice renamed carries its priority and the
// conditions on it, a kind changed keeps what still fits.

import { useId } from "react"
import {
  AlignLeft, ArrowDown, ArrowUp, AtSign, CalendarClock, CalendarIcon, CheckSquare, ChevronDown, Circle, CircleDot, Columns3, Flag, GitBranch, Hash, Link2,
  ListTodo, PanelTop, Paperclip, Plus, Smartphone, Square, Table2, Tag, Trash2, Type, X, type LucideIcon,
} from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { CopyableCode } from "@/components/ui/copyable-code"
import { ix } from "@/lib/ui/interactive"
import { fieldKeyDown } from "@/lib/keys/ime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Pick } from "@/components/ui/pick"
import { Tile } from "@/components/ui/graphics/Tile"
import { ToggleChip } from "@/components/ui/toggleChip"
import type { TaskField } from "@/lib/tasks/fields"
import { FIELD_TYPES, hasChoices, linkFills, typeLabel, type FieldType, type FormField, type FormPriority, type ShowIf } from "@/lib/forms/forms"
import {
  MAX_CHOICES, canMove, choicesIn, choicesOf, columnOf, columnTargets, defaultPriorities, fillTargets, readsChoices, removeChoice, renameChoice, retype, showIfText,
  type FormColumn,
} from "@/lib/forms/build"
import { MAX_FILES } from "@/lib/forms/answers"

const GLYPH: Record<FieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  email: AtSign,
  phone: Smartphone,
  url: Link2,
  number: Hash,
  date: CalendarIcon,
  select: CircleDot,
  multi_select: ListTodo,
  checkbox: CheckSquare,
  file: Paperclip,
  section: PanelTop,
}

const PRIORITY_PICKS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

const OPS: Record<ShowIf["op"], string> = { is: "is", is_not: "isn't", any_of: "is any of", answered: "is answered" }

/** "Only the description" as a pick's value: a select's value can't be empty. */
const DESCRIPTION = "description"

/** How a question is filled by the form's link before the form has one: Hidden's help and the link switch's say it alike. */
const BEFORE_LINK = "Once the form is made, add this to its link with the answer after the =."

/** What an item fills, said: "Fills the priority", "Fills Vendor". */
function fillsText(f: FormField, project: TaskField[], columns?: FormColumn[]): [string, LucideIcon] | null {
  const t = f.maps_to ?? ""
  if (f.type === "file") return ["Goes on the task", Paperclip]
  if (t.startsWith("column:")) return [`Fills ${columns?.find((c) => c.id === columnOf(f))?.name ?? "a column"}`, Table2]
  if (t === "priority") return ["Fills the priority", Flag]
  if (t === "due") return ["Fills the due date", CalendarClock]
  if (t === "tags") return ["Fills tags", Tag]
  if (t.startsWith("field:")) return [`Fills ${project.find((p) => `field:${p.id}` === t)?.name ?? "a field"}`, Columns3]
  return null
}

export interface ItemCardProps {
  fields: FormField[]
  index: number
  /** Its number among the questions, or the page a section starts. */
  number: number
  titleField: string
  hue: CampHue
  open: boolean
  onToggle: () => void
  onChange: (fields: FormField[]) => void
  onRemove: () => void
  onMove: (by: -1 | 1) => void
  /** The project's own task fields, which answers can fill. */
  project: TaskField[]
  /** A form that adds table rows: its table's columns, which answers fill instead (none until a table is picked). */
  table?: { columns?: FormColumn[] }
  /** Why the form won't save, when it's about this item. */
  problem?: string
  /** The form's public link once it has one (formUrl), which the prefill hint copies whole. */
  link?: string
}

export function ItemCard({ fields, index, number, titleField, hue, open, onToggle, onChange, onRemove, onMove, project, table, problem, link }: ItemCardProps) {
  const uid = useId()
  const f = fields[index]
  const section = f.type === "section"
  const words = f.label.trim()
  const name = section ? `Section: ${words || "untitled"}` : `Question ${number}: ${words || "untitled"}`
  const set = (patch: Partial<FormField>) => onChange(fields.map((x, j) => (j === index ? { ...x, ...patch } : x)))
  const Glyph = GLYPH[f.type]
  const fills = section || (table && f.type === "file") ? null : fillsText(f, project, table?.columns)
  const namesTask = !table && f.id === titleField && f.type !== "file"
  const up = index > 0 ? canMove(fields, index, -1) : ""
  const down = index < fields.length - 1 ? canMove(fields, index, 1) : ""
  const lastQuestion = !section && fields.filter((x) => x.type !== "section").length === 1
  const meta = section ? [`Starts page ${number}`] : [typeLabel(f.type), f.required ? "Required" : "", f.hidden ? "Hidden, filled by its link" : "", namesTask ? "Names the task" : ""].filter(Boolean)

  return (
    <div
      data-form-item={f.id}
      role={open ? "group" : undefined}
      aria-label={open ? name : undefined}
      className={cn(
        "min-w-0 rounded-xl transition-shadow duration-200",
        section ? "bg-sunken" : "bg-raised shadow-e1",
        open && "shadow-e2 ring-1 ring-inset ring-line",
        problem && "ring-1 ring-inset ring-danger-ink/50",
      )}
    >
      <button type="button" aria-expanded={open} aria-label={name} onClick={onToggle} {...ix("row")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left">
        {section ? (
          <Tile hue={hue} size="sm" className="bg-press text-ink-2"><Glyph /></Tile>
        ) : (
          <Tile hue={hue} size="sm"><Glyph /></Tile>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", words ? "text-ink" : "text-ink-3")}>{words || (section ? "Untitled section" : "Untitled question")}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3">
            <span>{meta.join(" · ")}</span>
            {!open && f.show_if && (
              <span className="chip max-w-full gap-1 truncate">
                <GitBranch aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">Shows when {showIfText(f.show_if, fields)}</span>
              </span>
            )}
            {!open && fills && (
              <span className="chip gap-1">
                {(() => {
                  const Icon = fills[1]
                  return <Icon aria-hidden="true" className="size-3 shrink-0" />
                })()}
                {fills[0]}
              </span>
            )}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid gap-3 px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {section ? (
              <span className="text-xs font-medium text-ink-2">A page of its own, with a title and a line of help</span>
            ) : (
              <Pick
                label="Kind"
                value={f.type}
                onChange={(t) => onChange(retype(fields, index, t as FieldType))}
                options={FIELD_TYPES.map((t) => {
                  const Icon = GLYPH[t.value]
                  // A table row keeps no files (yet): the kind is offered, and says so.
                  const off = !!table && t.value === "file"
                  return {
                    value: t.value,
                    disabled: off,
                    label: <span className="flex items-center gap-2"><Icon aria-hidden="true" className="size-3.5 text-ink-3" />{t.label}{off && <span className="text-ink-3"> · a table row keeps no files</span>}</span>,
                  }
                })}
                className="w-full md:w-48"
              />
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-11 md:size-8" aria-label="Move up" disabled={index === 0 || !!up} disabledReason={up || undefined} onClick={() => onMove(-1)}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-11 md:size-8" aria-label="Move down" disabled={index === fields.length - 1 || !!down} disabledReason={down || undefined} onClick={() => onMove(1)}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-11 text-ink-3 md:size-8" aria-label={section ? "Remove this section" : "Remove this question"}
                disabled={lastQuestion} disabledReason={lastQuestion ? "A form asks at least one question." : undefined} onClick={onRemove}>
                <Trash2 />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-label`} className="text-xs text-ink-2">{section ? "Section title" : "Question"}</Label>
            <Input id={`${uid}-label`} value={f.label} maxLength={section ? 120 : 200} placeholder={section ? "About you" : "What do you want to ask?"} onChange={(e) => set({ label: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-help`} className="text-xs text-ink-2">Help <span className="font-normal text-ink-3">(optional)</span></Label>
            <Input id={`${uid}-help`} value={f.help ?? ""} maxLength={300} placeholder={section ? "What this page is about" : "A line under the question"} onChange={(e) => set({ help: e.target.value })} />
          </div>

          {hasChoices(f.type) && <Choices fields={fields} index={index} project={project} columns={table?.columns} onChange={onChange} />}

          <div className="grid gap-3 rounded-lg bg-sunken p-3" data-form-logic="">
            <ShowsWhen fields={fields} index={index} onChange={onChange} />
            {f.type === "file" ? (
              <p className="flex items-start gap-1.5 text-meta text-ink-2" data-form-files-note="">
                <Paperclip aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                <span>Its files go on the task: up to {MAX_FILES}, 10 MB each. Programs and web pages are refused, and every file is checked as it comes.</span>
              </p>
            ) : table ? (
              !section && <Columns fields={fields} index={index} columns={table.columns} onChange={onChange} />
            ) : (
              !section && <Fills fields={fields} index={index} project={project} onChange={onChange} />
            )}
          </div>

          {!section && (
            <label className={cn("flex items-center gap-2 text-sm", f.hidden ? "text-ink-3" : "text-ink")}>
              <Switch checked={f.required} disabled={!!f.hidden} onCheckedChange={(required) => set({ required })} aria-label="Required" />
              Required
              {namesTask && <span className="text-meta text-ink-3">· its answer names the task</span>}
            </label>
          )}
          {/* Tables B5b: a question nobody sees, answered by the link (?prefill_<id>=…), never required. */}
          {linkFills(f.type) && (
            <div className="grid gap-1">
              <label className="flex items-center gap-2 text-sm text-ink">
                <Switch checked={!!f.hidden} onCheckedChange={(hidden) => set(hidden ? { hidden, required: false } : { hidden: undefined })} aria-label="Hidden, filled by its link" />
                Hidden, filled by its link
              </label>
              {f.hidden && (
                <div className="grid gap-1.5" data-prefill-hint="">
                  <p className="text-meta text-ink-3">
                    {link ? "Its link fills it: put the answer after the =." : BEFORE_LINK} A hidden question is never required, and any question takes a link&apos;s answer, shown or not.
                  </p>
                  <CopyableCode value={`${link ?? ""}?prefill_${f.id}=`} label="prefill link" />
                </div>
              )}
              {/* Tables B5c (main, 28 Oct): a link fills a shown question and hides it for its visit only where
                  the form's managers turn this on, question by question; it starts off. */}
              {!f.hidden && (
                // mt-2: its switch stands as far below Hidden's as Hidden's below Required's (a 32 px pitch),
                // so under a finger its reach (phone.css F3) never takes Hidden's taps (DB-27).
                <div className="mt-2 grid gap-1.5" data-hide-hint="">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Switch checked={!!f.link_hides} onCheckedChange={(on) => set({ link_hides: on || undefined })} aria-label="A link can fill and hide this" />
                    A link can fill and hide this
                  </label>
                  <p className="text-meta text-ink-3">
                    Use it for things like where a person came from, never for anything they must agree to.
                    {f.link_hides ? (link ? " Its link fills it and hides it: put the answer after the =." : ` ${BEFORE_LINK}`) : ""}
                  </p>
                  {f.link_hides && <CopyableCode value={`${link ?? ""}?hide_${f.id}=true&prefill_${f.id}=`} label="fill and hide link" />}
                </div>
              )}
            </div>
          )}
          {problem && <p className="text-meta text-danger-ink">{problem}</p>}
        </div>
      )}
    </div>
  )
}

/** A choice question's choices: each with the priority it sets when the question fills the priority, or the project field's or the column's own options when it fills one. */
function Choices({ fields, index, project, columns, onChange }: { fields: FormField[]; index: number; project: TaskField[]; columns?: FormColumn[]; onChange: (fields: FormField[]) => void }) {
  const f = fields[index]
  const field = project.find((p) => `field:${p.id}` === f.maps_to && (p.type === "select" || p.type === "multi_select"))
  const column = columns?.find((c) => c.id === columnOf(f) && (c.type === "select" || c.type === "multi_select"))
  const theirs = field ? { name: field.name, options: field.options.map((o) => o.label) } : column ? { name: column.name, options: column.options } : null
  if (theirs) {
    return (
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-ink-2">Choices</p>
        <p className="text-meta text-ink-3">Its choices are {theirs.name}&apos;s options, so what&apos;s picked is always one of them.</p>
        <div className="flex flex-wrap gap-1.5">{theirs.options.map((o) => <span key={o} className="chip">{o}</span>)}</div>
      </div>
    )
  }
  const options = f.options ?? []
  const priority = f.maps_to === "priority"
  const add = (at: number) => {
    const next = [...options.slice(0, at), "", ...options.slice(at)]
    onChange(fields.map((x, j) => (j === index ? { ...x, options: next } : x)))
    // The new choice's box takes the typing.
    requestAnimationFrame(() => document.getElementById(`${f.id}-choice-${at}`)?.focus())
  }
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-ink-2">Choices</legend>
      {options.map((o, k) => (
        <div key={k} className="flex items-center gap-2">
          {f.type === "select" ? <Circle aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" /> : <Square aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />}
          <Input id={`${f.id}-choice-${k}`} aria-label={`Choice ${k + 1}`} value={o} maxLength={100} placeholder={`Choice ${k + 1}`}
            onChange={(e) => onChange(renameChoice(fields, index, k, e.target.value))}
            onKeyDown={fieldKeyDown((e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              if (options.length < MAX_CHOICES) add(k + 1)
            })}
            className="min-w-0 flex-1" />
          {priority && (
            <Pick label={`Priority for ${o.trim() || `choice ${k + 1}`}`} value={f.map?.[o] ?? "medium"}
              onChange={(v) => onChange(fields.map((x, j) => (j === index ? { ...x, map: { ...x.map, [o]: v as FormPriority } } : x)))}
              options={PRIORITY_PICKS} className="w-28 shrink-0" />
          )}
          <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-ink-3 md:size-8" aria-label={`Remove choice ${k + 1}`}
            disabled={options.length <= 2} disabledReason={options.length <= 2 ? "A choice question offers at least two." : undefined}
            onClick={() => onChange(removeChoice(fields, index, k).fields)}>
            <X />
          </Button>
        </div>
      ))}
      {options.length < MAX_CHOICES && (
        <Button type="button" variant="ghost" className="h-11 justify-self-start gap-1.5 text-brand-text md:h-8" onClick={() => add(options.length)}>
          <Plus className="size-4" /> Add a choice
        </Button>
      )}
    </fieldset>
  )
}

/** A condition on a question: its choices, starting from the first. */
const conditionOn = (q: FormField): ShowIf => (readsChoices(q) && choicesOf(q).length ? { question: q.id, op: "is", values: [choicesOf(q)[0]] } : { question: q.id, op: "answered" })

/** When an item shows: always, or on an earlier question's answer, read back as a sentence. */
function ShowsWhen({ fields, index, onChange }: { fields: FormField[]; index: number; onChange: (fields: FormField[]) => void }) {
  const f = fields[index]
  const earlier = fields.slice(0, index).filter((x) => x.type !== "section")
  const c = f.show_if
  const on = earlier.find((x) => x.id === c?.question)
  const setC = (next?: ShowIf) =>
    onChange(fields.map((x, j) => {
      if (j !== index) return x
      const out = { ...x }
      delete out.show_if
      return next ? { ...out, show_if: next } : out
    }))
  const start = () => {
    // The nearest earlier choice reads best ("show the steps when it's a bug").
    const choice = [...earlier].reverse().find((q) => readsChoices(q) && choicesOf(q).length)
    const q = choice ?? earlier[earlier.length - 1]
    return q ? conditionOn(q) : undefined
  }
  const setOp = (op: ShowIf["op"]) => {
    if (!c) return
    if (op === "answered") return setC({ question: c.question, op })
    const first = on ? choicesOf(on)[0] : undefined
    const values = op === "any_of" ? (c.values?.length ? c.values : [first]) : [c.values?.[0] ?? first]
    setC({ question: c.question, op, values: values.filter((v): v is string => !!v) })
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-xs font-medium text-ink-2 md:w-14">Shows</span>
        <Pick label="Shows" value={c ? "when" : "always"} onChange={(v) => setC(v === "when" ? start() : undefined)}
          options={[{ value: "always", label: "Always" }, { value: "when", label: "Only when an earlier answer says so", disabled: !earlier.length }]}
          className="w-full md:w-auto md:min-w-56" />
      </div>
      {c && (
        <div className="flex flex-wrap items-center gap-2 md:pl-16">
          <Pick label="On the answer to" value={c.question} onChange={(id) => {
            const q = earlier.find((x) => x.id === id)
            if (q) setC(conditionOn(q))
          }} options={earlier.map((q) => ({ value: q.id, label: q.label.trim() || "Untitled question" }))} className="w-full md:w-56" />
          <Pick label="Comparison" value={c.op} onChange={(op) => setOp(op as ShowIf["op"])}
            options={(on && readsChoices(on) ? (["is", "is_not", "any_of", "answered"] as const) : (["answered"] as const)).map((op) => ({ value: op, label: OPS[op] }))}
            className="w-full md:w-32" />
          {on && (c.op === "is" || c.op === "is_not") && (
            <Pick label="Choice it shows on" value={c.values?.[0] ?? ""} onChange={(v) => setC({ ...c, values: [v] })}
              options={choicesOf(on).map((v) => ({ value: v, label: v }))} className="w-full md:w-40" />
          )}
          {on && c.op === "any_of" && (
            <div role="group" aria-label="Choices it shows on" className="flex w-full flex-wrap gap-1.5">
              {choicesOf(on).map((v) => (
                <ToggleChip tone="neutral" offMark="plus" key={v} pressed={!!c.values?.includes(v)}
                  onPressedChange={(next) => setC({ ...c, values: next ? [...(c.values ?? []), v] : (c.values ?? []).filter((x) => x !== v) })}>
                  {v}
                </ToggleChip>
              ))}
            </div>
          )}
        </div>
      )}
      {c ? (
        <p className="flex items-start gap-1.5 text-meta text-ink-2 md:pl-16">
          <GitBranch aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
          <span>Shows when {showIfText(c, fields)}</span>
        </p>
      ) : !earlier.length ? (
        <p className="text-meta text-ink-3 md:pl-16">A question before it can decide whether it shows.</p>
      ) : null}
    </div>
  )
}

/** What a question's answer fills besides the description: the priority, the due date, tags, or one of the project's fields of its kind. */
function Fills({ fields, index, project, onChange }: { fields: FormField[]; index: number; project: TaskField[]; onChange: (fields: FormField[]) => void }) {
  const f = fields[index]
  const targets = fillTargets(f, fields, project)
  const choose = (v: string) => {
    const next: FormField = { ...f }
    delete next.maps_to
    delete next.map
    if (v !== DESCRIPTION) next.maps_to = v
    if (v === "priority") next.map = defaultPriorities(choicesIn(f))
    const field = project.find((p) => `field:${p.id}` === v)
    // A choice that fills a field of choices offers the field's own options (the server does the same as it saves).
    if (field && (field.type === "select" || field.type === "multi_select") && hasChoices(f.type)) next.options = field.options.map((o) => o.label)
    onChange(fields.map((x, j) => (j === index ? next : x)))
  }
  const hint =
    f.maps_to === "priority"
      ? "Each choice sets a priority: pick it beside the choice."
      : f.maps_to === "due"
      ? "The day it names becomes the task's due date, where the visitor is."
      : f.maps_to === "tags"
      ? "Each choice picked becomes a tag on the task."
      : "Every answer goes into the task's description too."
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-xs font-medium text-ink-2 md:w-14">Fills</span>
        <Pick label="Fills" value={f.maps_to || DESCRIPTION} onChange={choose}
          options={targets.map((t) => ({ value: t.value || DESCRIPTION, label: t.taken ? `${t.label} · ${t.taken}` : t.label, disabled: !!t.taken }))}
          className="w-full md:w-auto md:min-w-56" />
      </div>
      <p className="text-meta text-ink-3 md:pl-16">{hint}</p>
    </div>
  )
}

/** Which column of the form's table a question's answer goes in: one of a kind it suits, each filled by one question. */
function Columns({ fields, index, columns, onChange }: { fields: FormField[]; index: number; columns?: FormColumn[]; onChange: (fields: FormField[]) => void }) {
  const f = fields[index]
  const targets = columns ? columnTargets(f, fields, columns) : []
  const choose = (v: string) => {
    const next: FormField = { ...f, maps_to: v }
    delete next.map
    const c = columns?.find((x) => `column:${x.id}` === v)
    // A choice takes the column's own options (the server does the same as it saves).
    if (c && (c.type === "select" || c.type === "multi_select") && hasChoices(f.type) && c.options.length) next.options = [...c.options]
    onChange(fields.map((x, j) => (j === index ? next : x)))
  }
  const hint = !columns
    ? "Pick the table first: its columns are what answers fill."
    : !targets.length
    ? "No column of this table takes this kind of answer: ask it another way."
    : "Its answer goes in this column of each new row."
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-xs font-medium text-ink-2 md:w-14">Fills</span>
        <Pick label="Fills" value={f.maps_to?.startsWith("column:") ? f.maps_to : ""} onChange={choose} placeholder="Pick a column"
          options={targets.map((t) => ({ value: t.value, label: t.taken ? `${t.label} · ${t.taken}` : t.label, disabled: !!t.taken }))}
          className="w-full md:w-auto md:min-w-56" />
      </div>
      <p className="text-meta text-ink-3 md:pl-16">{hint}</p>
    </div>
  )
}
