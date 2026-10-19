"use client"

// A field's settings page in its column menu (tables A1, PROGRAM.md §6): what
// it is for, what a new row's cell starts as, and whether rows added through
// the API, AI or a form must fill it in. Each saves as it changes, sending
// only what changed (FieldPatch). The default is read as the field's kind
// reads typed text (lib/fieldTypes), so what the server stores is what it
// shows here; the server refuses one its kind can't hold, and says why.

import * as React from "react"
import { DateField } from "@/components/ui/date-field"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { fieldKeyDown } from "@/lib/keys/ime"
import { typedNumberText } from "@/lib/format/number"
import { optionsOf, type FieldPatch, type TableField } from "@/services/tableService"

/** What the settings change: a field's description, default and whether it's required. */
type SettingsPatch = Pick<FieldPatch, "description" | "required" | "default_value">

/** The settings' fields: the shared field surface (raised at e1, a brand ring on focus, danger when invalid). */
const INPUT = "field-surface w-full rounded-lg px-2.5 text-ui text-ink outline-none"

/** A setting's caption, above its control. */
function Caption({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block px-1 pb-1 text-meta font-medium text-ink-3">
      {children}
    </label>
  )
}

/** A default as its input shows it: a number in the reader's signs, anything else as text. */
function defaultText(field: TableField): string {
  const v = field.default_value
  if (v === null || v === undefined) return ""
  return field.type === "number" ? typedNumberText(v) : String(v)
}

/** The default for a field whose cells are typed: read as its kind reads typing. */
function TypedDefault({ field, onSave }: { field: TableField; onSave: (patch: SettingsPatch) => void }) {
  const saved = defaultText(field)
  const [text, setText] = React.useState(saved)
  React.useEffect(() => setText(saved), [saved])
  const parse = fieldKind(field.type).parse
  const parsed = parse ? parse(text, field) : { value: text }
  const error = "error" in parsed ? parsed.error : null
  const commit = () => {
    if (text === saved || error) return
    const value = "value" in parsed ? parsed.value : null
    onSave({ default_value: value === "" ? null : value })
  }
  const id = `default-${field.id}`
  return (
    <div>
      <Caption htmlFor={id}>Default for new rows</Caption>
      <input
        id={id}
        value={text}
        inputMode={field.type === "number" ? "decimal" : undefined}
        // Esc puts a changed default back, and the column menu round it stays
        // (lib/keys/escapeOwn); with nothing to put back, it closes the menu.
        data-escape-own={text !== saved ? "" : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={fieldKeyDown((e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape" && text !== saved) {
            e.stopPropagation()
            setText(saved)
          }
        })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="None"
        className={cn(INPUT, "h-8")}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 pt-1 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** The default of a select: one of its options, or none. */
function OptionDefault({ field, onSave }: { field: TableField; onSave: (patch: SettingsPatch) => void }) {
  const id = `default-${field.id}`
  const current = typeof field.default_value === "string" ? field.default_value : ""
  return (
    <div>
      <Caption htmlFor={id}>Default for new rows</Caption>
      <select
        id={id}
        value={current}
        onChange={(e) => onSave({ default_value: e.target.value === "" ? null : e.target.value })}
        className={cn(INPUT, "h-8 appearance-none")}
      >
        <option value="">None</option>
        {optionsOf(field).map((o) => (
          <option key={o.id} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The default of a date: a day, or none. */
function DateDefault({ field, onSave }: { field: TableField; onSave: (patch: SettingsPatch) => void }) {
  const id = `default-${field.id}`
  const current = typeof field.default_value === "string" ? field.default_value : ""
  return (
    <div>
      <Caption htmlFor={id}>Default for new rows</Caption>
      <DateField id={id} value={current} onChange={(day) => onSave({ default_value: day === "" ? null : day })} className="h-8" dense />
    </div>
  )
}

export function FieldSettings({ field, onSave }: { field: TableField; onSave: (patch: SettingsPatch) => void }) {
  const kind = fieldKind(field.type)
  const saved = field.description ?? ""
  const [description, setDescription] = React.useState(saved)
  React.useEffect(() => setDescription(saved), [saved])
  const commitDescription = () => {
    const next = description.trim()
    if (next !== saved.trim()) onSave({ description: next })
  }
  const descriptionId = `description-${field.id}`

  return (
    <div className="space-y-3 px-1 pb-1.5">
      <div>
        <Caption htmlFor={descriptionId}>Description</Caption>
        <textarea
          id={descriptionId}
          rows={2}
          maxLength={2000}
          value={description}
          // Esc puts a changed description back, and the menu stays; with
          // nothing to put back, it closes the menu.
          data-escape-own={description !== saved ? "" : undefined}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Escape" && description !== saved) {
              e.stopPropagation()
              setDescription(saved)
            }
          })}
          placeholder="What this field is for"
          className={cn(INPUT, "resize-none py-1.5 leading-5")}
        />
      </div>

      {kind.defaults ? (
        field.type === "select" ? (
          <OptionDefault field={field} onSave={onSave} />
        ) : field.type === "date" ? (
          <DateDefault field={field} onSave={onSave} />
        ) : field.type === "checkbox" ? (
          <label className="flex min-h-8 items-center justify-between gap-3 rounded-lg px-1 text-ui text-ink">
            New rows start ticked
            <Switch checked={field.default_value === true} aria-label="New rows start ticked" onCheckedChange={(on) => onSave({ default_value: on ? true : null })} />
          </label>
        ) : (
          <TypedDefault field={field} onSave={onSave} />
        )
      ) : null}

      {kind.stored ? (
        <label className="flex min-h-8 items-start justify-between gap-3 rounded-lg px-1 text-ui text-ink">
          <span>
            Required
            <span className="block text-meta text-ink-3">Rows added through the API, AI or a form must fill it in</span>
          </span>
          <Switch className="mt-0.5" checked={!!field.required} aria-label="Required" onCheckedChange={(on) => onSave({ required: on })} />
        </label>
      ) : null}
    </div>
  )
}
