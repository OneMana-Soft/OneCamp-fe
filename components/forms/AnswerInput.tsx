"use client"

import { Check, Plus } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import type { TaskField } from "@/lib/tasks/fields"
import { ix } from "@/lib/ui/interactive"
import { Input } from "@/components/ui/input"
import { DateField } from "@/components/ui/date-field"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * One answer's box by its kind, as value + onChange: a form's question
 * (components/forms/FormPages) and a field a task template asks for (New
 * task's TemplateAsks) draw the same one, so each kind answers the same way in
 * both. A choice answers with its value (an option's id, or a person's); the
 * words around the box (its label, help and what's wrong) are the caller's.
 */
export type AnswerKind = "short_text" | "long_text" | "email" | "phone" | "url" | "number" | "date" | "select" | "multi_select" | "checkbox" | "person"

/** One of a choice's options: what it answers with, and its words. */
export interface Choice {
  value: string
  label: string
}

export interface AnswerInputProps {
  id: string
  kind: AnswerKind
  value: unknown
  onChange: (value: unknown) => void
  /** A select's, a multi-select's or a person's options. */
  choices?: Choice[]
  /** The form's colour, for its chips and its tick. */
  hue?: CampHue
  invalid?: boolean
  describedBy?: string
  /** What names a multi-select's group of chips. */
  labelledBy?: string
  maxLength?: number
  /** The box's size, where the host is denser than a form's page (New task). */
  className?: string
}

type Box = { type: string; mode?: "decimal" | "tel" | "url" | "email"; auto?: string; spell?: boolean }
const TEXT: Box = { type: "text" }
/** Each typed kind's box: its type, keyboard and autofill. A number is typed
 * as text in the person's own signs ("1,5" in de-DE), and sent as typed: a
 * browser number input rewrote it in the browser's locale, or emptied it. */
const INPUT: Partial<Record<AnswerKind, Box>> = {
  email: { type: "email", mode: "email", auto: "email", spell: false },
  phone: { type: "tel", mode: "tel", auto: "tel" },
  url: { type: "url", mode: "url", auto: "url", spell: false },
  number: { type: "text", mode: "decimal" },
}

export function AnswerInput({ id, kind, value, onChange, choices = [], hue, invalid, describedBy, labelledBy, maxLength, className }: AnswerInputProps) {
  const str = typeof value === "string" ? value : ""
  const aria = { "aria-invalid": invalid || undefined, "aria-describedby": describedBy }
  switch (kind) {
    case "checkbox":
      return <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--hue)]" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...aria} />
    case "multi_select": {
      const picked = Array.isArray(value) ? (value as string[]) : []
      return (
        <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex flex-wrap gap-2">
          {choices.map((c, i) => {
            const on = picked.includes(c.value)
            return (
              <button
                key={c.value}
                id={i === 0 ? id : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? picked.filter((x) => x !== c.value) : [...picked, c.value])}
                data-touch-target=""
                {...ix("chip", { hue })}
                className="chip h-11 gap-1.5 px-3.5 text-sm sm:h-9 sm:px-3"
              >
                {on ? <Check aria-hidden="true" className="size-3.5" /> : <Plus aria-hidden="true" className="size-3.5 text-ink-3" />}
                {c.label}
              </button>
            )
          })}
        </div>
      )
    }
    case "select":
    case "person":
      return (
        <Select value={str} onValueChange={onChange}>
          <SelectTrigger id={id} className={className} {...aria}>
            <SelectValue placeholder={kind === "person" ? "Choose someone" : "Choose one"} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case "date":
      return <DateField id={id} value={str} onChange={onChange} {...aria} />
    case "long_text":
      return <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} rows={4} className={className} {...aria} />
    default: {
      const box = INPUT[kind] ?? TEXT
      return (
        <Input
          id={id}
          type={box.type}
          inputMode={box.mode}
          autoComplete={box.auto}
          spellCheck={box.spell}
          placeholder={kind === "url" ? "https://" : undefined}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={className}
          {...aria}
        />
      )
    }
  }
}

/** A task field's answer box, for each of its types: a choice by its options' ids, a person among the people
 * by id, text as a short answer, and money as a number (read in units, kept in cents: lib/tasks/fieldInput). */
export function taskFieldAnswer(
  field: Pick<TaskField, "type" | "options">,
  people: readonly { user_uuid: string; user_name?: string }[],
): Pick<AnswerInputProps, "kind" | "choices"> {
  switch (field.type) {
    case "person":
      return { kind: "person", choices: people.map((p) => ({ value: p.user_uuid, label: p.user_name || "Someone" })) }
    case "select":
    case "multi_select":
      return { kind: field.type, choices: field.options.map((o) => ({ value: o.id, label: o.label })) }
    case "text":
      return { kind: "short_text" }
    case "money":
      return { kind: "number" }
    default:
      return { kind: field.type }
  }
}
