"use client"

// The editor for a table's formula field: written with the table's fields and
// functions to hand, and checked as you type against the first rows. The
// server checks and works it out (services/tableService previewFormula), so
// what the preview says is what the column will show.

import * as React from "react"
import { FORMULA_FUNCTIONS, fieldRef, insertAt, showFormulaValue, type FormulaShown } from "@/lib/tables/formula"
import { previewFormula, type FormulaPreview, type FormulaResult, type TableField } from "@/services/tableService"

const GIVES: Record<FormulaResult, string> = {
  number: "a number",
  text: "text",
  date: "a date",
  checkbox: "a yes or no",
}

function asWord(s: FormulaShown): string {
  switch (s.kind) {
    case "blank":
      return "blank"
    case "error":
      return "an error"
    case "checkbox":
      return s.checked ? "yes" : "no"
    default:
      return s.text
  }
}

export function FormulaEditor({
  tableId,
  fields,
  fieldId,
  value,
  onChange,
}: {
  tableId: string
  /** The table's fields, to put in the formula. */
  fields: TableField[]
  /** The formula field being edited; none for a new one. */
  fieldId?: string
  value: string
  onChange: (formula: string) => void
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = React.useState<FormulaPreview | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [showFunctions, setShowFunctions] = React.useState(false)

  // Checked once typing pauses; an answer to an older draft is dropped.
  const latest = React.useRef(0)
  React.useEffect(() => {
    const mine = ++latest.current
    if (!value.trim()) {
      setPreview(null)
      setChecking(false)
      return
    }
    setChecking(true)
    const timer = setTimeout(() => {
      previewFormula(tableId, value, fieldId)
        .then((p) => {
          if (mine === latest.current) setPreview(p)
        })
        .catch(() => {
          if (mine === latest.current) setPreview(null)
        })
        .finally(() => {
          if (mine === latest.current) setChecking(false)
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [tableId, fieldId, value])

  const insert = (text: string) => {
    const el = ref.current
    const next = insertAt(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, text)
    onChange(next.text)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(next.caret, next.caret)
    })
  }

  const others = fields.filter((f) => f.id !== fieldId)

  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        aria-label="Formula"
        placeholder="{Price} * {Quantity}"
        className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p
        aria-live="polite"
        className={preview?.error ? "text-2xs leading-snug text-destructive" : "text-2xs leading-snug text-muted-foreground"}
      >
        {!value.trim()
          ? "Fields go in braces, like {Price}. Use + − * / for numbers, & to join text, and the functions below."
          : preview?.error
            ? preview.error
            : preview
              ? `Gives ${GIVES[preview.result]}${
                  preview.values.length
                    ? `: ${preview.values.map((v) => asWord(showFormulaValue(v, preview.result))).join(", ")}`
                    : ""
                }`
              : checking
                ? "Checking…"
                : ""}
      </p>
      {others.length > 0 && (
        <div className="space-y-1">
          <p className="text-2xs font-medium text-muted-foreground">Fields</p>
          <div className="flex flex-wrap gap-1">
            {others.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => insert(fieldRef(f.name))}
                className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-2xs hover:bg-muted"
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <button
          type="button"
          aria-expanded={showFunctions}
          onClick={() => setShowFunctions((v) => !v)}
          className="text-2xs font-medium text-muted-foreground hover:text-foreground"
        >
          {showFunctions ? "Hide functions" : "Functions"}
        </button>
        {showFunctions && (
          <div className="mt-1 max-h-48 space-y-2 overflow-y-auto pr-1">
            {FORMULA_FUNCTIONS.map((g) => (
              <div key={g.group}>
                <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</p>
                {g.items.map((fn) => (
                  <button
                    key={fn.name}
                    type="button"
                    title={fn.syntax}
                    onClick={() => insert(`${fn.name}(`)}
                    className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-muted"
                  >
                    <span className="font-mono text-2xs">{fn.name}</span>
                    <span className="truncate text-2xs text-muted-foreground">{fn.about}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
