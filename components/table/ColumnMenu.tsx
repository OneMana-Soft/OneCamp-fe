"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  EyeOff,
  Filter,
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
} from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import {
  aggregateTable,
  fieldProblem,
  fillTableAIColumn,
  formulaOf,
  isNumeric,
  newOptionId,
  optionsOf,
  parseFieldConfig,
  previewConversion,
  relationOf,
  rollupOf,
  type FieldOption,
  type FieldPatch,
  type FieldType,
  type TableField,
} from "@/services/tableService"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { OptionsEditor } from "@/components/fields/OptionsEditor"
import { RelationSettings, RollupSettings, relationDraftOf, relationReady, rollupReady, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"
import { FIELD_GLYPH, FIELD_TYPES, fieldTypeLabel } from "@/components/table/gridCells"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import { useToast } from "@/hooks/use-toast"
import type { NumberFormat } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useAIAvailable } from "@/hooks/useClientConfig"


/**
 * A type's one-line hint, at the end of its row in the type lists. The hint
 * gives way, never the type's name: the name's slot shrinks to nothing when
 * the hint keeps its full width, and "Date" read "D." beside a long hint.
 */
function TypeHint({ children }: { children: React.ReactNode }) {
  return <span data-type-hint="" className="ml-auto min-w-0 max-w-[48%] shrink truncate text-right text-meta text-ink-3">{children}</span>
}

export type ColumnPage = "main" | "type" | "options" | "format" | "formula" | "relation" | "rollup" | "ai"

/**
 * A column's save from its menu: what it changes, and nothing else
 * (FieldPatch). A rename sends its name, a setting its config, and the type
 * goes only from the type picker (or a formula's, link's or rollup's settings
 * when the column becomes one). Any of them sent from the page's copy put
 * back what had changed since it was read: a type changed meanwhile, and its
 * cells converted again (audit B1), or a rename.
 */
export type ColumnSaveInput = Omit<FieldPatch, "position">

/** A new column: its name and type, always. */
export interface ColumnCreateInput {
  name: string
  type: FieldType
  config?: Record<string, unknown>
}

/** aiPromptOf reads an AI column's prompt ({"ai":{"prompt":"..."}}); "" when it has none. */
export function aiPromptOf(config: { [k: string]: unknown }): string {
  const ai = config?.ai as { prompt?: string } | undefined
  return (ai?.prompt || "").trim()
}

function aiAutoOf(config: { [k: string]: unknown }): boolean {
  const ai = config?.ai as { auto?: boolean } | undefined
  return Boolean(ai?.auto)
}

/**
 * What a change of type clears, as the server counted it over every row
 * (TAB-BUG-9); null when it couldn't count. The menu counted only the rows
 * the page held, and only for numbers, dates and ticks.
 */
function clearedNote(from: FieldType, to: FieldType, cleared: number | null): string {
  const label = fieldTypeLabel(to)
  const kind = label === "URL" ? label : label.toLowerCase()
  const column = `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} column`
  if (cleared === null) return `Values that don't fit ${column} will be cleared. They couldn't be counted just now.`
  const n = `${formatLocale(cleared, {})} ${cleared === 1 ? "value" : "values"}`
  if (from === "multi_select" && to === "select") return `${n} will be cleared: each cell keeps its first option.`
  return `${n} ${cleared === 1 ? "doesn't" : "don't"} fit ${column} and will be cleared.`
}

/** The config a field keeps when only its options, format or the like change. */
function baseConfig(field: TableField): Record<string, unknown> {
  const cfg = parseFieldConfig(field) as Record<string, unknown>
  // The server writes these on read, and a removal is named once; they
  // aren't the owner's to send back.
  const { result: _r, error: _e, table_name: _t, removed_options: _x, ...rest } = cfg
  void _r
  void _e
  void _t
  void _x
  return rest
}

/** One 32 px row in the column menu. */
function MenuRow({
  icon,
  label,
  hint,
  onClick,
  danger,
  sub,
  disabled,
}: {
  icon?: React.ReactNode
  label: React.ReactNode
  hint?: React.ReactNode
  onClick: () => void
  danger?: boolean
  sub?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      data-menu-row=""
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui font-[450] text-ink outline-none transition-colors duration-[90ms] hover:bg-press focus-visible:bg-press disabled:pointer-events-none disabled:text-ink-4",
        TOUCH_ROW,
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink-3",
        danger && "text-danger-ink [&>svg]:text-danger-ink",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-meta text-ink-3">{hint}</span> : null}
      {sub ? <ChevronRight className="!size-3.5 text-ink-3" aria-hidden="true" /> : null}
    </button>
  )
}

function Divider() {
  return <div aria-hidden="true" className="mx-2 my-1 h-px bg-line" />
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex h-8 items-center gap-1 px-1">
      <button type="button" onClick={onBack} aria-label="Back" data-touch-target="" className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-ui-sm font-semibold text-ink">{title}</span>
    </div>
  )
}

/**
 * How many rows hold each of a select column's options, as the server counts
 * them over the table, by option id: a count read before a rename is still
 * its option's. `complete` is false when the server read only part of the
 * table (it reads at most 5,000 rows) or of its options (200), where a count
 * is "at least" and an option it doesn't name may still be held. Null until
 * it answers, or when it can't.
 */
function useOptionCounts(tableId: string, field: TableField) {
  const [counts, setCounts] = React.useState<{ rows: Map<string, number>; complete: boolean } | null>(null)
  const latest = React.useRef(field)
  latest.current = field
  React.useEffect(() => {
    let live = true
    aggregateTable(tableId, { group_by: field.id, aggregate: "count", limit: 200 }, OWN_ERRORS)
      .then((res) => {
        if (!live) return
        const byLabel = new Map((res?.buckets ?? []).map((b) => [b.label, b.count]))
        const rows = new Map(optionsOf(latest.current).map((o) => [o.id, byLabel.get(o.label) ?? 0]))
        setCounts({ rows, complete: !res?.truncated && (res?.distinct_groups ?? 0) <= (res?.buckets?.length ?? 0) })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [tableId, field.id])
  return counts
}

/** "12 rows", "at least 5,000 rows"; "At least…" to start a sentence. */
function rowsText(n: number, atLeast: boolean, start = false): string {
  return `${atLeast ? (start ? "At least " : "at least ") : ""}${formatLocale(n, {})} ${n === 1 ? "row" : "rows"}`
}

/**
 * A select column's options page (T07): whether its chips are tinted, and
 * its options in the one options editor (components/fields), saved as each
 * changes. The rows holding each option are counted over the table, so a
 * rename says how many rows it moves, and a removal asks unless the counts
 * show no row holds the option. A save names what it removes
 * (`removed_options`), and the list is read again whenever the field's
 * settings change: a list read once, at mount, cleared every cell of a
 * column just made a select when an option was added to it (audit B1).
 */
function SelectOptions({
  tableId,
  field,
  otherTinted,
  onSave,
}: {
  tableId: string
  field: TableField
  /** Another column in the table already tints its chips. */
  otherTinted: boolean
  onSave: (config: Record<string, unknown>) => void
}) {
  const [options, setOptions] = React.useState<FieldOption[]>(() => optionsOf(field))
  const [tinted, setTinted] = React.useState(() => parseFieldConfig(field).tinted === true)
  React.useEffect(() => {
    setOptions(optionsOf(field))
    setTinted(parseFieldConfig(field).tinted === true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the field's settings change, not for each copy of the same
  }, [field.config])
  const counts = useOptionCounts(tableId, field)
  const then = field.type === "multi_select" ? "lose it" : "be left empty"
  const save = (next: FieldOption[], nextTinted: boolean, removed: string[] = []) =>
    onSave({ ...baseConfig(field), options: next, tinted: nextTinted || undefined, ...(removed.length ? { removed_options: removed } : {}) })
  return (
    <div className="space-y-1">
      <label className="flex h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-hover">
        <span className="min-w-0 flex-1">
          <span className="block text-ui text-ink">Tinted chips</span>
          <span className="block text-meta text-ink-3">For options that mean something, like a status</span>
        </span>
        <Switch
          checked={tinted}
          aria-label="Tinted chips"
          onCheckedChange={(on) => {
            setTinted(on)
            save(options, on)
          }}
        />
      </label>
      {tinted && otherTinted ? (
        <p className="mx-2 rounded-lg bg-camp-sun-tint px-2 py-1.5 text-meta text-camp-sun-ink">Another column already tints its chips. One per table keeps the grid calm.</p>
      ) : null}
      <Divider />
      <OptionsEditor
        options={options}
        reorder
        make={(label) => ({ id: newOptionId(), label })}
        onChange={(next, removed) => {
          setOptions(next)
          save(next, tinted, removed)
        }}
        renames={(o) => {
          const n = counts?.rows.get(o.id) ?? 0
          return n > 0 ? `Renames it in ${rowsText(n, !counts?.complete)}` : null
        }}
        removal={(o) => {
          // As counted; an option added since the count may be held already.
          const n = counts?.rows.get(o.id)
          if (counts?.complete && n === 0) return null
          if (!counts || n === undefined) return `Rows with “${o.label}” will ${then}.`
          return `${rowsText(n, !counts.complete, true)} ${n === 1 && counts.complete ? "has" : "have"} “${o.label}”, and will ${then}.`
        }}
      />
    </div>
  )
}

/** A number column's format (T08): currency, decimals, percent and its bar. Saves as it changes. */
function NumberFormatEditor({ field, onSave }: { field: TableField; onSave: (config: Record<string, unknown>) => void }) {
  const [fmt, setFmt] = React.useState<NumberFormat>(() => (parseFieldConfig(field).format as NumberFormat) || {})
  const set = (next: NumberFormat) => {
    setFmt(next)
    onSave({ ...baseConfig(field), format: next })
  }
  const seg = (active: boolean) =>
    cn("h-6 flex-1 rounded-md text-ui-sm font-medium transition-colors", active ? "bg-raised text-ink shadow-sel" : "text-ink-2 hover:text-ink")
  return (
    <div className="space-y-2 px-1 pb-1">
      <div>
        <p className="px-1 pb-1 text-meta font-medium text-ink-3">Currency</p>
        <div className="flex gap-0.5 rounded-lg bg-hover p-0.5" role="group" aria-label="Currency">
          {([undefined, "INR", "USD"] as const).map((c) => (
            <button key={c ?? "none"} type="button" aria-pressed={fmt.currency === c} data-touch-target="" className={seg(fmt.currency === c)} onClick={() => set({ ...fmt, currency: c })}>
              {c === "INR" ? "₹" : c === "USD" ? "$" : "None"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="px-1 pb-1 text-meta font-medium text-ink-3">Decimal places</p>
        <div className="flex gap-0.5 rounded-lg bg-hover p-0.5" role="group" aria-label="Decimal places">
          {([undefined, 0, 1, 2] as const).map((d) => (
            <button key={d ?? "auto"} type="button" aria-pressed={fmt.decimals === d} data-touch-target="" className={seg(fmt.decimals === d)} onClick={() => set({ ...fmt, decimals: d })}>
              {d === undefined ? "Auto" : d}
            </button>
          ))}
        </div>
      </div>
      <label className="flex h-8 items-center justify-between rounded-lg px-1 text-ui text-ink">
        Percent
        <Switch checked={!!fmt.percent} aria-label="Percent" onCheckedChange={(on) => set({ ...fmt, percent: on || undefined, bar: on ? fmt.bar : undefined })} />
      </label>
      {fmt.percent ? (
        <label className="flex h-8 items-center justify-between rounded-lg px-1 text-ui text-ink">
          Show a bar
          <Switch checked={!!fmt.bar} aria-label="Show a bar" onCheckedChange={(on) => set({ ...fmt, bar: on || undefined })} />
        </label>
      ) : null}
    </div>
  )
}

/**
 * A column's header (content.md T07): a 14 px type glyph in ink-3, the name at
 * 13/510 ink-2 (numbers right-aligned, the glyph still before the label), the
 * agent spark on an AI-filled column and an alert on one with a problem. On
 * hover the cell lifts to --hover and a chevron fades in; for an owner it
 * opens the column menu, a CommandList-style menu whose changes apply as they
 * are made, with no Save button.
 */
export function ColumnHeader({
  field,
  fields,
  tableId,
  canManage,
  frozen,
  index,
  openPage,
  onOpenPage,
  onSave,
  onDelete,
  onInsert,
  onDuplicate,
  onSort,
  onFilter,
  onHide,
  onFilled,
  onHover,
  onResizeStart,
  onAutoFit,
}: {
  field: TableField
  fields: TableField[]
  tableId: string
  canManage: boolean
  frozen?: boolean
  index: number
  /** The menu's page while it's open; null when it is closed. */
  openPage: ColumnPage | null
  onOpenPage: (page: ColumnPage | null) => void
  /** Resolves false when the save failed. */
  onSave: (input: ColumnSaveInput) => Promise<boolean | void> | void
  onDelete: () => void
  onInsert?: (side: "left" | "right") => void
  onDuplicate?: () => void
  onSort?: (dir: "asc" | "desc") => void
  onFilter?: () => void
  onHide?: () => void
  onFilled: () => void
  onHover?: (index: number | null) => void
  onResizeStart?: (e: React.PointerEvent, index: number) => void
  onAutoFit?: (index: number) => void
}) {
  const { toast } = useToast()
  const open = openPage !== null
  const page = openPage ?? "main"
  const setPage = (p: ColumnPage) => onOpenPage(p)
  const numeric = isNumeric(field)
  const Glyph = FIELD_GLYPH[field.type] ?? FIELD_GLYPH.text
  const config = parseFieldConfig(field)
  const savedAiPrompt = aiPromptOf(config)
  const problem = fieldProblem(field)
  const computed = field.type === "formula" || field.type === "rollup"
  const formulaText = field.type === "formula" ? formulaOf(field).formula : ""

  const [name, setName] = React.useState(field.name)
  React.useEffect(() => {
    if (open) setName(field.name)
  }, [open, field.name])
  const commitName = () => {
    const n = name.trim()
    if (!n || n === field.name) {
      setName(field.name)
      return
    }
    void onSave({ name: n })
  }

  // A type change that would clear values asks first, saying how many over
  // every row, as the server will convert them (TAB-BUG-9).
  const [pendingType, setPendingType] = React.useState<{ type: FieldType; cleared: number | null } | null>(null)
  const [counting, setCounting] = React.useState<FieldType | null>(null)
  const asked = React.useRef<FieldType | null>(null)
  // A select's options open once the table has the field as one, with the
  // options its cells became: opened at once, they showed the old field's
  // (none), and adding one saved a list without them (audit B1).
  const [changing, setChanging] = React.useState<FieldType | null>(null)
  const saveType = async (type: FieldType) => {
    setPendingType(null)
    const options = type === "select" || type === "multi_select"
    if (!options) onOpenPage("main")
    else setChanging(type)
    const saved = await onSave({ type, config: options ? { options: optionsOf(field) } : {} })
    if (saved === false) setChanging(null)
  }
  React.useEffect(() => {
    if (!changing) return
    if (!open) setChanging(null)
    else if (field.type === changing) {
      setChanging(null)
      // Unless the person went on to another page meanwhile.
      if (page === "type") onOpenPage("options")
    }
  }, [changing, field.type, open, page, onOpenPage])
  const applyType = async (type: FieldType) => {
    if (type === field.type) {
      setPage("main")
      return
    }
    if (type === "formula") return setPage("formula")
    if (type === "relation") return setPage("relation")
    if (type === "rollup") return setPage("rollup")
    setPendingType(null)
    setCounting(type)
    asked.current = type
    let cleared: number | null
    try {
      cleared = (await previewConversion(tableId, field.id, type))?.cleared ?? 0
    } catch {
      cleared = null
    }
    // Another type was picked meanwhile: that one's answer is the one that counts.
    if (asked.current !== type) return
    setCounting(null)
    if (cleared === 0) void saveType(type)
    else setPendingType({ type, cleared })
  }

  // Formula, relation, rollup and AI settings are drafts until saved.
  const [formula, setFormula] = React.useState(() => formulaOf(field).formula)
  const [relation, setRelation] = React.useState<RelationDraft>(() => relationDraftOf(field))
  const [rollup, setRollup] = React.useState<RollupDraft>(() => {
    const r = rollupOf(field)
    return { relation: r.relation, field: r.field, aggregate: r.aggregate }
  })
  const [aiPrompt, setAiPrompt] = React.useState(() => aiPromptOf(config))
  const [aiAuto, setAiAuto] = React.useState(() => aiAutoOf(config))
  const [filling, setFilling] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setFormula(formulaOf(field).formula)
    setRelation(relationDraftOf(field))
    const r = rollupOf(field)
    setRollup({ relation: r.relation, field: r.field, aggregate: r.aggregate })
    setAiPrompt(aiPromptOf(parseFieldConfig(field)))
    setAiAuto(aiAutoOf(parseFieldConfig(field)))
    setPendingType(null)
  }, [open, field])

  // AI fills a column only where AI is on: with it off (or on the edition
  // without it) "Fill with AI…" could only fail.
  const ai = useAIAvailable()
  const aiEligible = ai && ["text", "number", "url", "email"].includes(field.type)
  // A link keeps its type: the server refuses changing one, to a table's rows
  // or to items (docs, tasks, boards, projects, people), which it would
  // otherwise write out as text.
  const linkKind = field.type === "relation" ? (relationOf(field).target === "table" ? "A link to another table" : "A link to docs, tasks, boards, projects or people") : null
  const isSelect = field.type === "select" || field.type === "multi_select"
  const otherTinted = fields.some((f) => f.id !== field.id && parseFieldConfig(f).tinted === true)

  const fill = async () => {
    setFilling(true)
    try {
      const res = await fillTableAIColumn(tableId, field.id)
      toast({ title: "AI fill complete", description: `Filled ${res.filled} ${res.filled === 1 ? "row" : "rows"}${res.skipped ? `, skipped ${res.skipped}` : ""}.` })
      onFilled()
    } catch {
      // surfaced by interceptor
    } finally {
      setFilling(false)
    }
  }

  const label = (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", numeric && "justify-end")}>
      <span title={fieldTypeLabel(field.type)} className="inline-flex shrink-0 text-ink-3">
        <Glyph className="size-3.5" aria-hidden />
        <span className="sr-only">{fieldTypeLabel(field.type)}</span>
      </span>
      <span className="truncate">{field.name}</span>
      {savedAiPrompt && <Spark size={12} className="shrink-0 text-agent" />}
      {savedAiPrompt ? <span className="sr-only">Filled by AI</span> : null}
      {problem && <AlertTriangle className="size-3.5 shrink-0 text-danger-ink" aria-label={problem} />}
    </span>
  )

  const headerInner = canManage ? (
    <button
      type="button"
      onClick={() => onOpenPage(open ? null : "main")}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${field.name}, ${fieldTypeLabel(field.type)} column. Edit column`}
      title={computed && formulaText ? formulaText : undefined}
      className={cn(
        "group/col flex h-9 w-full items-center gap-1 px-3 text-ui-sm font-medium text-ink-2 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink focus-visible:bg-hover",
        open && "bg-hover text-ink",
      )}
    >
      {label}
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover/col:opacity-100 group-focus-visible/col:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
        <ChevronDown className="size-3.5" aria-hidden />
      </span>
    </button>
  ) : (
    <span className="flex h-9 items-center px-3 text-ui-sm font-medium text-ink-2" title={computed && formulaText ? formulaText : undefined}>
      {label}
    </span>
  )

  const header = headerInner

  const typeItems: CommandListItem[] = FIELD_TYPES.map((t) => {
    const G = FIELD_GLYPH[t.value]
    return {
      id: t.value,
      label: t.label,
      text: t.label,
      tile: (
        <CommandTile>
          <G />
        </CommandTile>
      ),
      trailing: <TypeHint>{t.value === field.type ? "Current" : t.hint}</TypeHint>,
    }
  })

  return (
    <th
      scope="col"
      data-frozen={frozen || undefined}
      data-col-index={index}
      onPointerEnter={() => onHover?.(index)}
      onPointerLeave={() => onHover?.(null)}
      className={cn("relative h-9 p-0 text-left font-normal", numeric && "text-right")}
      aria-sort={undefined}
    >
      <Popover open={open} onOpenChange={(o) => onOpenPage(o ? "main" : null)}>
        <PopoverAnchor asChild>{header}</PopoverAnchor>
        {canManage ? (
          <PopoverContent
            align="start"
            sideOffset={4}
            className={cn("content-float rounded-xl p-1 shadow-e3", page === "formula" ? "w-[400px]" : page === "relation" || page === "rollup" ? "w-80" : "w-[280px]")}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              // The name, when the menu opens on its main page.
              if (page !== "main") e.preventDefault()
            }}
            data-column-menu=""
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
              const rowsEls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-menu-row]:not([disabled])"))
              if (!rowsEls.length) return
              const at = rowsEls.indexOf(document.activeElement as HTMLElement)
              const next = e.key === "ArrowDown" ? (at + 1) % rowsEls.length : (at - 1 + rowsEls.length) % rowsEls.length
              e.preventDefault()
              rowsEls[next].focus()
            }}
          >
            <div key={page} className={page === "main" ? undefined : "table-sub-in"}>
              {page === "main" && (
                <div>
                  <div className="p-1 pb-1.5">
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          commitName()
                          onOpenPage(null)
                        }
                      }}
                      aria-label="Column name"
                      maxLength={120}
                      className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none focus:ring-1 focus:ring-brand/50"
                    />
                  </div>
                  <MenuRow icon={<Glyph />} label="Type" hint={fieldTypeLabel(field.type)} sub onClick={() => setPage("type")} />
                  {isSelect && <MenuRow icon={<SlidersHorizontal />} label="Options" hint={String((config.options || []).length)} sub onClick={() => setPage("options")} />}
                  {field.type === "number" && <MenuRow icon={<SlidersHorizontal />} label="Format" sub onClick={() => setPage("format")} />}
                  {field.type === "date" && (
                    <label className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-ui text-ink hover:bg-hover">
                      <span className="flex-1">Due date (overdue in red)</span>
                      <Switch
                        checked={config.due === true}
                        aria-label="Due date"
                        onCheckedChange={(on) => void onSave({ config: { ...baseConfig(field), due: on || undefined } })}
                      />
                    </label>
                  )}
                  {field.type === "formula" && <MenuRow icon={<FIELD_GLYPH.formula />} label="Formula…" onClick={() => setPage("formula")} />}
                  {field.type === "relation" && <MenuRow icon={<FIELD_GLYPH.relation />} label="Linked table" sub onClick={() => setPage("relation")} />}
                  {field.type === "rollup" && <MenuRow icon={<FIELD_GLYPH.rollup />} label="Rollup" sub onClick={() => setPage("rollup")} />}
                  {problem && (
                    <p className="mx-1 my-1 flex items-start gap-1.5 rounded-lg bg-sunken px-2 py-1.5 text-meta text-danger-ink">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {problem}
                    </p>
                  )}
                  <Divider />
                  {onSort && <MenuRow icon={<ArrowUp />} label="Sort ascending" onClick={() => (onSort("asc"), onOpenPage(null))} />}
                  {onSort && <MenuRow icon={<ArrowDown />} label="Sort descending" onClick={() => (onSort("desc"), onOpenPage(null))} />}
                  {onFilter && <MenuRow icon={<Filter />} label="Filter by this field" onClick={() => (onFilter(), onOpenPage(null))} />}
                  {onHide && <MenuRow icon={<EyeOff />} label="Hide field" onClick={() => (onHide(), onOpenPage(null))} />}
                  <Divider />
                  {onInsert && <MenuRow icon={<ArrowLeft />} label="Insert left" onClick={() => (onInsert("left"), onOpenPage(null))} />}
                  {onInsert && <MenuRow icon={<ArrowRight />} label="Insert right" onClick={() => (onInsert("right"), onOpenPage(null))} />}
                  {onDuplicate && <MenuRow icon={<Copy />} label="Duplicate" onClick={() => (onDuplicate(), onOpenPage(null))} />}
                  {aiEligible && (
                    <>
                      <Divider />
                      <MenuRow icon={<Spark size={16} className="!text-agent" />} label="Fill with AI…" onClick={() => setPage("ai")} />
                    </>
                  )}
                  <Divider />
                  <MenuRow icon={<Trash2 />} label="Delete field" danger onClick={() => (onOpenPage(null), onDelete())} />
                </div>
              )}

              {page === "type" && (
                <div>
                  <SubHeader title="Type" onBack={() => setPage("main")} />
                  {linkKind ? (
                    // Said, rather than offered and refused.
                    <p className="mx-1 mb-1 rounded-lg bg-sunken px-2.5 py-2 text-meta text-ink-3" role="note">
                      {linkKind} keeps its type. Add a new column for another type.
                    </p>
                  ) : counting || changing ? (
                    <p className="mx-1 mb-1 flex items-center gap-1.5 rounded-lg bg-sunken px-2.5 py-2 text-meta text-ink-3" role="status">
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" /> {changing ? "Changing the type…" : "Counting what this changes…"}
                    </p>
                  ) : pendingType ? (
                    <div className="mx-1 mb-1 space-y-1.5 rounded-lg bg-camp-sun-tint px-2.5 py-2 text-meta text-camp-sun-ink" role="alert">
                      <p>{clearedNote(field.type, pendingType.type, pendingType.cleared)}</p>
                      <div className="flex gap-1.5">
                        <Button size="xs" variant="secondary" onClick={() => void saveType(pendingType.type)}>
                          Change anyway
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setPendingType(null)}>
                          Keep {fieldTypeLabel(field.type).toLowerCase()}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {linkKind ? null : <CommandList
                    label="Column type"
                    className="w-full animate-none bg-transparent shadow-none"
                    items={typeItems}
                    maxHeight={340}
                    activeIndex={undefined}
                    onSelect={(item) => void applyType(item.id as FieldType)}
                  />}
                </div>
              )}

              {page === "options" && (
                <div>
                  <SubHeader title="Options" onBack={() => setPage("main")} />
                  <SelectOptions tableId={tableId} field={field} otherTinted={otherTinted} onSave={(cfg) => void onSave({ config: cfg })} />
                </div>
              )}

              {page === "format" && (
                <div>
                  <SubHeader title="Format" onBack={() => setPage("main")} />
                  <NumberFormatEditor field={field} onSave={(cfg) => void onSave({ config: cfg })} />
                </div>
              )}

              {page === "formula" && (
                <div className="space-y-2 p-1">
                  <SubHeader title="Formula" onBack={() => setPage("main")} />
                  <FormulaEditor tableId={tableId} fields={fields} fieldId={field.id} value={formula} onChange={setFormula} />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => onOpenPage(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!formula.trim()}
                      onClick={() => {
                        void onSave({ ...(field.type === "formula" ? {} : { type: "formula" as const }), config: { ...(field.type === "formula" ? baseConfig(field) : {}), formula } })
                        onOpenPage(null)
                      }}
                    >
                      Save formula
                    </Button>
                  </div>
                </div>
              )}

              {page === "relation" && (
                <div className="space-y-2 p-1">
                  <SubHeader title="Linked table" onBack={() => setPage("main")} />
                  <RelationSettings tableId={tableId} field={field.type === "relation" ? field : undefined} draft={relation} onChange={setRelation} />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => onOpenPage(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!relationReady(relation)}
                      onClick={() => {
                        void onSave({ ...(field.type === "relation" ? {} : { type: "relation" as const }), config: { ...relation } })
                        onOpenPage(null)
                      }}
                    >
                      Save link
                    </Button>
                  </div>
                </div>
              )}

              {page === "rollup" && (
                <div className="space-y-2 p-1">
                  <SubHeader title="Rollup" onBack={() => setPage("main")} />
                  <RollupSettings fields={fields.filter((f) => f.id !== field.id)} draft={rollup} onChange={setRollup} />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => onOpenPage(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!rollupReady(rollup)}
                      onClick={() => {
                        void onSave({ ...(field.type === "rollup" ? {} : { type: "rollup" as const }), config: { ...rollup } })
                        onOpenPage(null)
                      }}
                    >
                      Save rollup
                    </Button>
                  </div>
                </div>
              )}

              {page === "ai" && ai && (
                <div className="space-y-2 p-1">
                  <SubHeader title="Fill with AI" onBack={() => setPage("main")} />
                  <div className="rounded-xl bg-agent-muted/60 p-2.5">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="What goes in each cell, e.g. Summarise the row in one line"
                      rows={3}
                      aria-label="What AI should put in each cell"
                      className="w-full resize-none rounded-lg bg-raised px-2.5 py-2 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus:ring-1 focus:ring-agent/60"
                    />
                    <p className="pt-1.5 text-meta text-agent-ink">Each cell is written from this prompt and the row&apos;s other values.</p>
                  </div>
                  <label className="flex h-8 items-center justify-between rounded-lg px-1 text-ui text-ink">
                    Fill again when a row changes
                    <Switch checked={aiAuto} aria-label="Autofill on change" onCheckedChange={setAiAuto} />
                  </label>
                  <div className="flex justify-end gap-1.5">
                    {savedAiPrompt ? (
                      <Button size="sm" variant="secondary" disabled={filling} onClick={fill} className="gap-1.5">
                        {filling ? <Loader2 className="size-3.5 animate-spin" /> : <Spark size={14} className="text-agent" />}
                        {filling ? "Filling…" : "Fill column"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={!aiPrompt.trim() && !savedAiPrompt}
                      onClick={() => {
                        const cfg = baseConfig(field)
                        if (aiPrompt.trim()) cfg.ai = { prompt: aiPrompt.trim(), auto: aiAuto }
                        else delete cfg.ai
                        void onSave({ config: cfg })
                      }}
                    >
                      Save prompt
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
      {/* Resize: an 8 px edge (T06). Widths are this reader's, per table. */}
      {onResizeStart ? (
        <span
          aria-hidden="true"
          onPointerDown={(e) => onResizeStart(e, index)}
          onDoubleClick={() => onAutoFit?.(index)}
          className="absolute -right-1 top-0 z-[5] h-full w-2 cursor-col-resize touch-none"
        />
      ) : null}
    </th>
  )
}

/**
 * The "+" at the end of the header (T19): a CommandList of the twelve types.
 * A plain type is made at once and its menu opens on its name; a formula, a
 * link or a rollup needs its settings first, so it opens them in the same pop.
 */
export function AddColumn({
  tableId,
  fields,
  onCreate,
}: {
  tableId: string
  fields: TableField[]
  onCreate: (input: ColumnCreateInput) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<FieldType | null>(null)
  const [name, setName] = React.useState("")
  const [formula, setFormula] = React.useState("")
  const [relation, setRelation] = React.useState<RelationDraft>(() => relationDraftOf())
  const [rollup, setRollup] = React.useState<RollupDraft>({ relation: "", field: "", aggregate: "" })
  const [busy, setBusy] = React.useState(false)
  const reset = () => {
    setStep(null)
    setName("")
    setFormula("")
    setRelation(relationDraftOf())
    setRollup({ relation: "", field: "", aggregate: "" })
  }
  const uniqueName = (base: string) => {
    const names = new Set(fields.map((f) => f.name.toLowerCase()))
    if (!names.has(base.toLowerCase())) return base
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
  }
  const create = async (input: ColumnCreateInput) => {
    setBusy(true)
    try {
      await onCreate(input)
      setOpen(false)
      reset()
    } finally {
      setBusy(false)
    }
  }
  const pickType = (type: FieldType) => {
    const label = FIELD_TYPES.find((t) => t.value === type)?.label ?? "Field"
    if (type === "formula" || type === "relation" || type === "rollup") {
      setStep(type)
      setName(uniqueName(label))
      return
    }
    void create({ name: uniqueName(label), type, config: type === "select" || type === "multi_select" ? { options: [] } : undefined })
  }
  const items: CommandListItem[] = FIELD_TYPES.map((t) => {
    const G = FIELD_GLYPH[t.value]
    return {
      id: t.value,
      label: t.label,
      text: t.label,
      tile: (
        <CommandTile>
          <G />
        </CommandTile>
      ),
      trailing: <TypeHint>{t.hint}</TypeHint>,
    }
  })
  const ready = step === "formula" ? !!formula.trim() : step === "relation" ? relationReady(relation) : step === "rollup" ? rollupReady(rollup) : false
  return (
    // The last column takes the grid's spare room, so the cell is as wide as
    // that and the + keeps its own 48 px at the start of it.
    <th scope="col" className="h-9 p-0" data-add-column-cell="">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <PopoverAnchor asChild>
          <button
            type="button"
            aria-label="Add a column"
            title="Add column"
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-12 items-center justify-center text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:outline-none"
          >
            <Plus className="size-4" />
          </button>
        </PopoverAnchor>
        <PopoverContent align="end" sideOffset={4} className={cn("content-float rounded-xl p-1 shadow-e3", step === "formula" ? "w-[400px]" : "w-80")} data-add-column="">
          {step === null ? (
            <CommandList label="New column type" header="New column" className="w-full animate-none bg-transparent shadow-none" items={items} maxHeight={380} onSelect={(i) => pickType(i.id as FieldType)} />
          ) : (
            <form
              className="table-sub-in space-y-2 p-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (!ready || !name.trim()) return
                void create({
                  name: name.trim(),
                  type: step,
                  config: step === "formula" ? { formula } : step === "relation" ? { ...relation } : { ...rollup },
                })
              }}
            >
              <SubHeader title={fieldTypeLabel(step)} onBack={() => setStep(null)} />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Column name"
                aria-label="Column name"
                className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none focus:ring-1 focus:ring-brand/50"
              />
              {step === "formula" && <FormulaEditor tableId={tableId} fields={fields} value={formula} onChange={setFormula} />}
              {step === "relation" && <RelationSettings tableId={tableId} draft={relation} onChange={setRelation} />}
              {step === "rollup" && <RollupSettings fields={fields} draft={rollup} onChange={setRollup} />}
              <div className="flex justify-end gap-1.5 pt-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy || !name.trim() || !ready}>
                  Add column
                </Button>
              </div>
            </form>
          )}
        </PopoverContent>
      </Popover>
    </th>
  )
}
