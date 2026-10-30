"use client"

// The editor for a table's formula field: written with the table's fields and
// functions to hand, and checked as you type against the first rows. The
// server checks and works it out (services/tableCalls previewFormula), so
// what the preview says is what the column will show.

import * as React from "react"
import { AlertTriangle, ChevronRight } from "@/lib/icons"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { showFormulaValue, type FormulaShown } from "@/lib/tables/formula"
import { FORMULA_FUNCTIONS, fieldRef, insertAt, type FormulaFunction } from "@/lib/tables/formulaCatalogue"
import { callAt, contextAt, matchingBracket } from "@/lib/tables/formulaAssist"
import { useFetch } from "@/hooks/useFetch"
import { fieldKeyDown } from "@/lib/keys/ime"
import { relationOf, tableFieldsKey, type FormulaResult, type TableField } from "@/services/tableService"
import { previewFormula, type FormulaPreview } from "@/services/tableCalls"

/** Every function the editor knows, by name. */
const BY_NAME = new Map<string, FormulaFunction>(FORMULA_FUNCTIONS.flatMap((g) => g.items.map((f) => [f.name, f] as const)))

/** How many suggestions show at once. */
const MAX_SUGGESTIONS = 8

/** A suggestion: what it shows, a hint after it, and what it puts in place of what's typed. */
interface Suggestion {
  key: string
  label: string
  hint: string
  insert: string
  /** A field's kind glyph, as the header and the chips below show it. */
  glyph?: ReturnType<typeof fieldKind>["glyph"]
}

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
 * in sky ink, "text" in moss ink, numbers in sun ink, /* comments *\/ quiet
 * (ink-3, italic), operators in ink-2; the brackets at marks (the pair at the
 * caret, B2) ringed. Character for character the same text, so it lines up
 * under the box.
 */
export function highlightFormula(text: string, marks: readonly number[] = []): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\/\*[\s\S]*?(?:\*\/|$))|(\{[^}]*\}?)|("(?:[^"\\]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([^{"\dA-Za-z_/]+|\/|[A-Za-z_][A-Za-z0-9_]*|\d)/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    const [all, comment, field, str, num, fn] = m
    const key = i++
    if (comment) out.push(<span key={key} className="italic text-ink-3">{all}</span>)
    else if (field) out.push(<span key={key} data-field-pill="" className="rounded-[4px] bg-hover text-ink ring-1 ring-inset ring-line">{all}</span>)
    else if (str) out.push(<span key={key} className="text-camp-moss-ink">{all}</span>)
    else if (num) out.push(<span key={key} className="text-camp-sun-ink">{all}</span>)
    else if (fn) out.push(<span key={key} className="text-camp-sky-ink">{all}</span>)
    else if (marks.some((at) => at >= m!.index && at < m!.index + all.length)) {
      // Operators with a marked bracket among them: that bracket ringed.
      const start = m.index
      out.push(
        <React.Fragment key={key}>
          {[...all].map((ch, j) =>
            marks.includes(start + j) ? (
              <span key={j} data-bracket-pair="" className="rounded-[3px] bg-camp-sky-tint text-ink ring-1 ring-inset ring-camp-sky-ink/40">
                {ch}
              </span>
            ) : (
              ch
            ),
          )}
        </React.Fragment>,
      )
    } else out.push(<React.Fragment key={key}>{all}</React.Fragment>)
  }
  return out
}

/** A function's way of being written with the value the caret is on in bold: IF(test, **then**, otherwise). */
function SignatureHint({ fn, arg }: { fn: FormulaFunction; arg: number }) {
  const open = fn.syntax.indexOf("(")
  const inner = fn.syntax.slice(open + 1, fn.syntax.lastIndexOf(")"))
  const args = inner ? inner.split(", ") : []
  // Past the last named value of one taking any number ("a, b, …"), the "…" is the one.
  const on = Math.min(arg, args.length - 1)
  return (
    <p data-formula-hint="" className="truncate px-0.5 font-mono text-meta text-ink-3">
      <span className="text-camp-sky-ink">{fn.name}</span>(
      {args.map((a, j) => (
        <React.Fragment key={j}>
          {j > 0 && ", "}
          <span className={j === on ? "font-semibold text-ink" : undefined}>{a}</span>
        </React.Fragment>
      ))}
      )<span className="font-sans"> · {fn.about}</span>
    </p>
  )
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
  // Where the caret is, for what to offer there; a list dismissed with Esc
  // stays shut until the text or the caret moves.
  const [caret, setCaret] = React.useState(value.length)
  const [picked, setPicked] = React.useState(0)
  const [dismissed, setDismissed] = React.useState(false)
  const track = (el: HTMLTextAreaElement) => {
    if (el.selectionStart !== caret) {
      setCaret(el.selectionStart)
      setDismissed(false)
    }
  }
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

  // Where the caret goes once a text put in has rendered: set as the box
  // takes its new value, before the next key is read. A frame later, a key
  // typed meanwhile (fast typing, a loaded machine) went where the caret was.
  const pendingCaret = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    const at = pendingCaret.current
    if (el && at !== null && el.value === value) {
      pendingCaret.current = null
      el.focus()
      el.setSelectionRange(at, at)
    }
  }, [value])

  const insert = (text: string) => {
    const el = ref.current
    const next = insertAt(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, text)
    pendingCaret.current = next.caret
    onChange(next.text)
  }

  const others = fields.filter((f) => f.id !== fieldId)
  const backdrop = React.useRef<HTMLDivElement>(null)

  // What to offer at the caret (B2): the fields, a linked table's fields
  // after {Link}., or the functions whose names start as typed.
  const ctx = contextAt(value, caret)
  const link = ctx?.kind === "linked" ? others.find((f) => f.type === "relation" && f.name.toLowerCase() === ctx.link.toLowerCase()) : undefined
  const linkedTable = link ? relationOf(link).tableId : undefined
  const { data: linkedData } = useFetch<{ data: TableField[] }>(linkedTable ? tableFieldsKey(linkedTable) : "", undefined, undefined, { suppressErrorToast: true } as never)
  // The list depends on what is being typed, not on where: kind and partial,
  // read out of ctx (a new object at every render) so the memo holds.
  const kind = ctx?.kind
  const partial = ctx?.partial ?? ""
  const suggestions = React.useMemo<Suggestion[]>(() => {
    if (!kind || dismissed) return []
    // Names that start as typed come first, then those that hold it.
    const typed = partial.trim().toLowerCase()
    const rank = (name: string) => (name.toLowerCase().startsWith(typed) ? 0 : name.toLowerCase().includes(typed) ? 1 : 2)
    const ofFields = (list: TableField[]) =>
      list
        .filter((f) => rank(f.name) < 2)
        .sort((a, b) => rank(a.name) - rank(b.name))
        .slice(0, MAX_SUGGESTIONS)
        .map((f) => ({ key: f.id, label: f.name, hint: fieldKind(f.type).label, glyph: fieldKind(f.type).glyph, insert: fieldRef(f.name) }))
    if (kind === "field") return ofFields(others)
    if (kind === "linked") return ofFields(linkedData?.data ?? [])
    const prefix = partial.toUpperCase()
    return [...BY_NAME.values()]
      .filter((f) => f.name.startsWith(prefix) && f.name !== prefix)
      .slice(0, MAX_SUGGESTIONS)
      .map((f) => ({ key: f.name, label: f.name, hint: f.about, insert: `${f.name}(` }))
  }, [kind, partial, dismissed, others, linkedData])
  const shown = suggestions.length > 0
  const choose = (sg: Suggestion) => {
    if (!ctx) return
    const next = insertAt(value, ctx.start, caret, sg.insert)
    pendingCaret.current = next.caret
    onChange(next.text)
    setCaret(next.caret)
  }
  React.useEffect(() => setPicked(0), [kind, partial])
  const onKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shown) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      setPicked((p) => (p + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      choose(suggestions[Math.min(picked, suggestions.length - 1)])
    } else if (e.key === "Escape") {
      // The list shuts; the editor stays open.
      e.preventDefault()
      e.stopPropagation()
      setDismissed(true)
    }
  }
  const call = callAt(value, caret)
  const callFn = call ? BY_NAME.get(call.name) : undefined
  const pair = matchingBracket(value, caret)
  const listId = React.useId()
  const message = !value.trim()
    ? "Fields go in braces, like {Price}; a linked table's, after the link: {Vendor}.{City}. Use + − * / for numbers, & to join text, /* notes */ for yourself, and the functions below."
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
          {highlightFormula(value, pair ?? [])}
          {"\n"}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setCaret(e.target.selectionStart)
            setDismissed(false)
          }}
          onSelect={(e) => track(e.currentTarget)}
          // An input method's Enter picks its word and its Escape drops it:
          // neither reaches the list (lib/keys/ime).
          onKeyDown={fieldKeyDown(onKeys)}
          // Escape shuts the suggestions while they show (onKeys); with none
          // showing, it is the sheet's or the dialog's to close.
          data-escape-own={shown ? "" : undefined}
          aria-controls={shown ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={shown ? `${listId}-${Math.min(picked, suggestions.length - 1)}` : undefined}
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
      {shown ? (
        <div id={listId} role="listbox" aria-label="Suggestions" data-formula-suggestions="" className="max-h-56 overflow-y-auto rounded-lg bg-raised p-1 shadow-e3">
          {suggestions.map((sg, j) => (
            <div
              key={sg.key}
              id={`${listId}-${j}`}
              role="option"
              aria-selected={j === picked}
              onMouseDown={(e) => {
                // Chosen without the box losing its caret.
                e.preventDefault()
                choose(sg)
              }}
              onMouseEnter={() => setPicked(j)}
              className={`flex cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 ${j === picked ? "bg-hover" : ""}`}
            >
              {sg.glyph ? <sg.glyph className="size-3 shrink-0 self-center text-ink-3" aria-hidden /> : null}
              <span className={ctx?.kind === "function" ? "font-mono text-meta text-camp-sky-ink" : "text-meta text-ink"}>{sg.label}</span>
              <span className="min-w-0 truncate text-meta text-ink-3">{sg.hint}</span>
            </div>
          ))}
        </div>
      ) : callFn ? (
        <SignatureHint fn={callFn} arg={call!.arg} />
      ) : null}
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
