"use client"

// The editor for a table's formula field: written with the table's fields and
// functions to hand, and checked as you type against the first rows. The
// server checks and works it out (services/tableService previewFormula), so
// what the preview says is what the column will show.

import * as React from "react"
import { AlertTriangle, ChevronRight } from "@/lib/icons"
import { fieldKind } from "@/lib/fieldTypes/registry"
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

/**
 * A formula's text in colour (T11): {fields} as neutral pills, function names
 * in sky ink, "text" in moss ink, numbers in sun ink, operators in ink-2.
 * Character for character the same text, so it lines up under the box.
 */
export function highlightFormula(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\{[^}]*\}?)|("(?:[^"\\]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([^{"\dA-Za-z_]+|[A-Za-z_][A-Za-z0-9_]*|\d)/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    const [all, field, str, num, fn] = m
    const key = i++
    if (field) out.push(<span key={key} data-field-pill="" className="rounded-[4px] bg-hover text-ink ring-1 ring-inset ring-line">{all}</span>)
    else if (str) out.push(<span key={key} className="text-camp-moss-ink">{all}</span>)
    else if (num) out.push(<span key={key} className="text-camp-sun-ink">{all}</span>)
    else if (fn) out.push(<span key={key} className="text-camp-sky-ink">{all}</span>)
    else out.push(<React.Fragment key={key}>{all}</React.Fragment>)
  }
  return out
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
  const backdrop = React.useRef<HTMLDivElement>(null)
  const message = !value.trim()
    ? "Fields go in braces, like {Price}. Use + − * / for numbers, & to join text, and the functions below."
    : preview?.error
      ? preview.error
      : preview
        ? `Gives ${GIVES[preview.result]}${
            preview.values.length ? `: ${preview.values.map((v) => asWord(showFormulaValue(v, preview.result))).join(", ")}` : ""
          }`
        : checking
          ? "Checking…"
          : ""

  return (
    <div className="space-y-2" data-formula-editor="">
      {/* The text as typed, coloured underneath a transparent box: fields as
          pills, functions sky, text moss, numbers sun (the camp ink cuts, so it
          reads the same in both themes). The box keeps the caret and the keys. */}
      <div className="relative rounded-lg bg-raised shadow-e1 focus-within:focus-halo">
        <div
          ref={backdrop}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-ui-sm leading-[21px] text-ink-2"
        >
          {highlightFormula(value)}
          {"\n"}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop
          }}
          rows={3}
          spellCheck={false}
          aria-label="Formula"
          placeholder="{Price} * {Quantity}"
          className="relative block min-h-[74px] w-full resize-y bg-transparent px-2.5 py-2 font-mono text-ui-sm leading-[21px] text-transparent caret-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <p
        aria-live="polite"
        data-formula-preview=""
        className={
          preview?.error
            ? "flex min-h-9 items-start gap-1.5 rounded-lg bg-sunken px-2.5 py-2 text-meta text-danger-ink"
            : "flex min-h-9 items-start gap-1.5 rounded-lg bg-sunken px-2.5 py-2 text-meta text-ink-3"
        }
      >
        {preview?.error ? <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> : null}
        <span>{message}</span>
      </p>
      {others.length > 0 && (
        <div className="space-y-1">
          <p className="text-meta font-medium text-ink-3">Fields</p>
          <div className="flex flex-wrap gap-1">
            {others.map((f) => {
              const Glyph = fieldKind(f.type).glyph
              return (
                <button
                  key={f.id}
                  type="button"
                  data-field-id={f.id}
                  onClick={() => insert(fieldRef(f.name))}
                  className="chip h-5 cursor-pointer gap-1 rounded-[5px] px-1.5 text-ink transition-colors hover:bg-press"
                >
                  <Glyph className="size-3 text-ink-3" aria-hidden />
                  {f.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <button
          type="button"
          aria-expanded={showFunctions}
          onClick={() => setShowFunctions((v) => !v)}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-meta font-medium text-ink-3 hover:bg-hover hover:text-ink"
        >
          <ChevronRight aria-hidden className={`size-3 transition-transform ${showFunctions ? "rotate-90" : ""}`} />
          {showFunctions ? "Hide functions" : "Show functions"}
        </button>
        {showFunctions && (
          <div className="mt-1 max-h-48 space-y-2 overflow-y-auto rounded-lg bg-sunken p-1.5">
            {FORMULA_FUNCTIONS.map((g) => (
              <div key={g.group}>
                <p className="px-1 pb-0.5 text-meta font-medium text-ink-3">{g.group}</p>
                {g.items.map((fn) => (
                  <button
                    key={fn.name}
                    type="button"
                    title={fn.syntax}
                    onClick={() => insert(`${fn.name}(`)}
                    className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-hover"
                  >
                    <span className="font-mono text-meta text-camp-sky-ink">{fn.name}</span>
                    <span className="truncate text-meta text-ink-3">{fn.about}</span>
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
