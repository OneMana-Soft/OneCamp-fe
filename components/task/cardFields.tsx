"use client"

// The fields a board's cards show. Apart from fieldValue.tsx, which every
// list loads, so the board's own code comes with the board, a chunk of its
// own (app/firstLoad.test.ts).

import { createContext, useContext } from "react"
import { Check } from "@/lib/icons"
import { optionOf, type FieldValue, type FieldValues, type TaskField } from "@/lib/tasks/fields"
import { FieldValueView, OptionPill } from "@/components/task/fieldValue"

/** How many of a field's choices a card shows before "+N". */
const CARD_OPTIONS = 2

/** The fields a board's cards show (those marked "On cards"), from the board. */
export const CardFieldsContext = createContext<{ fields: TaskField[]; nameOf?: (id: string) => string | undefined }>({ fields: [] })

/** A card's values of the fields its board shows: a choice as its pill, a
 * ticked box as its name, anything else after its name. */
export function CardFields({ values }: { values?: FieldValues }) {
  const { fields, nameOf } = useContext(CardFieldsContext)
  const shown = fields.filter((f) => f.on_card && hasValue(values?.[f.id]))
  if (shown.length === 0) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
      {shown.map((f) => {
        const v = values![f.id]
        if (f.type === "checkbox") {
          return (
            <span key={f.id} className="inline-flex items-center gap-0.5">
              <Check className="h-3 w-3" aria-hidden />
              {f.name}
            </span>
          )
        }
        if (f.type === "select" || f.type === "multi_select") {
          // Each choice as the list draws it: a neutral chip with its colour's
          // dot (design v3 §3.5). A card wrote "Email" as bare text (PTC-31).
          const options = (Array.isArray(v) ? v : [String(v)]).flatMap((id) => optionOf(f, id) ?? [])
          const shownOptions = options.slice(0, CARD_OPTIONS)
          return (
            <span key={f.id} title={f.name} data-card-field={f.id} className="inline-flex min-w-0 max-w-full items-center gap-1">
              <span className="sr-only">{f.name}: </span>
              {shownOptions.map((o) => (
                <OptionPill key={o.id} label={o.label} color={o.color} className="h-5 text-2xs" />
              ))}
              {options.length > shownOptions.length && <span className="shrink-0 text-ink-3">+{options.length - shownOptions.length}</span>}
            </span>
          )
        }
        return (
          <span key={f.id} className="inline-flex min-w-0 max-w-full items-center gap-1">
            <span className="shrink-0">{f.name}</span>
            <FieldValueView field={f} value={v} nameOf={nameOf} className="font-medium text-foreground" />
          </span>
        )
      })}
    </div>
  )
}

const hasValue = (v: FieldValue | undefined) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
