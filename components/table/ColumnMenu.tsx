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
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
} from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { CAMP_HUES, campHueOf, type CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import {
  fieldProblem,
  fillTableAIColumn,
  formulaOf,
  parseFieldConfig,
  parseRowValues,
  rollupOf,
  type FieldType,
  type SelectOption,
  type TableField,
  type TableRow,
} from "@/services/tableService"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import { RelationSettings, RollupSettings, relationDraftOf, relationReady, rollupReady, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"
import { FIELD_GLYPH, FIELD_TYPES, fieldTypeLabel, isNumeric } from "@/components/table/gridCells"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import { useToast } from "@/hooks/use-toast"
import type { NumberFormat } from "@/lib/tables/cellFormat"

export type ColumnPage = "main" | "type" | "options" | "format" | "formula" | "relation" | "rollup" | "ai"

export interface ColumnSaveInput {
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

/** Values that would not survive a change of type: text in a number column, say. */
export function lostOnTypeChange(field: TableField, to: FieldType, rows: TableRow[]): number {
  if (to === field.type) return 0
  let lost = 0
  for (const r of rows) {
    const v = parseRowValues(r)[field.id]
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue
    if (to === "number" && !(typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))))) lost++
    else if (to === "checkbox" && typeof v !== "boolean") lost++
    else if (to === "date" && !(typeof v === "string" && !Number.isNaN(new Date(v).getTime()))) lost++
  }
  return lost
}

/** The config a field keeps when only its options, format or the like change. */
function baseConfig(field: TableField): Record<string, unknown> {
  const cfg = parseFieldConfig(field) as Record<string, unknown>
  // The server writes these on read; they aren't the owner's to send back.
  const { result: _r, error: _e, table_name: _t, ...rest } = cfg
  void _r
  void _e
  void _t
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
      <button type="button" onClick={onBack} aria-label="Back" className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-ui-sm font-semibold text-ink">{title}</span>
    </div>
  )
}

/** A hue picker for an option: six camp hues and none, as 20 px discs. */
function HuePicker({ value, onPick }: { value?: string; onPick: (hue: CampHue | undefined) => void }) {
  const current = campHueOf(value)
  return (
    <div className="flex items-center gap-1.5 px-1 py-1" role="radiogroup" aria-label="Colour">
      <button
        type="button"
        role="radio"
        aria-checked={!current}
        aria-label="No colour"
        onClick={() => onPick(undefined)}
        className={cn("size-5 rounded-[10px] bg-hover ring-1 ring-inset ring-line-2", !current && "outline outline-[1.5px] outline-offset-2 outline-ink")}
      />
      {CAMP_HUES.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={current === h}
          aria-label={h}
          onClick={() => onPick(h)}
          className={cn(HUE_CLASS[h], "size-5 rounded-[10px] bg-hue", current === h && "outline outline-[1.5px] outline-offset-2 outline-ink")}
        />
      ))}
    </div>
  )
}

/** The options of a select column, edited in place (T07). Changes save as they're made. */
function OptionsEditor({
  field,
  otherTinted,
  onSave,
}: {
  field: TableField
  /** Another column in the table already tints its chips. */
  otherTinted: boolean
  onSave: (config: Record<string, unknown>) => void
}) {
  const [options, setOptions] = React.useState<SelectOption[]>(() => parseFieldConfig(field).options || [])
  const [tinted, setTinted] = React.useState(() => parseFieldConfig(field).tinted === true)
  const [draft, setDraft] = React.useState("")
  const [picking, setPicking] = React.useState<number | null>(null)
  const drag = React.useRef<number | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = (next: SelectOption[], nextTinted = tinted, now = false) => {
    if (timer.current) clearTimeout(timer.current)
    const run = () => onSave({ ...baseConfig(field), options: next, tinted: nextTinted || undefined })
    if (now) run()
    else timer.current = setTimeout(run, 400)
  }
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const set = (next: SelectOption[], now = false) => {
    setOptions(next)
    save(next, tinted, now)
  }
  const add = () => {
    const label = draft.trim()
    if (!label || options.some((o) => o.label === label)) return
    set([...options, { label }], true)
    setDraft("")
  }
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
            save(options, on, true)
          }}
        />
      </label>
      {tinted && otherTinted ? (
        <p className="mx-2 rounded-lg bg-camp-sun-tint px-2 py-1.5 text-meta text-camp-sun-ink">Another column already tints its chips. One per table keeps the grid calm.</p>
      ) : null}
      <Divider />
      <ul className="max-h-56 space-y-px overflow-y-auto">
        {options.map((o, i) => (
          <li
            key={`${o.label}-${i}`}
            draggable
            onDragStart={() => (drag.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = drag.current
              drag.current = null
              if (from === null || from === i) return
              const next = [...options]
              const [moved] = next.splice(from, 1)
              next.splice(i, 0, moved)
              set(next, true)
            }}
            className="group/opt"
          >
            <div className="flex h-8 items-center gap-1.5 rounded-lg px-1 hover:bg-hover">
              <GripVertical className="size-3.5 shrink-0 cursor-grab text-ink-4" aria-hidden="true" />
              <button
                type="button"
                aria-label={`Colour of ${o.label}`}
                onClick={() => setPicking(picking === i ? null : i)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-md hover:bg-press"
              >
                <span className={cn("size-1.5 rounded-[3px]", campHueOf(o.color) ? cn(HUE_CLASS[campHueOf(o.color)!], "bg-hue") : "bg-ink-3")} />
              </button>
              <input
                defaultValue={o.label}
                aria-label="Option name"
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (!label || label === o.label || options.some((x, j) => j !== i && x.label === label)) {
                    e.target.value = o.label
                    return
                  }
                  set(options.map((x, j) => (j === i ? { ...x, label } : x)), true)
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-ui text-ink outline-none focus:bg-raised focus:shadow-e1"
              />
              <button
                type="button"
                aria-label={`Remove ${o.label}`}
                onClick={() => set(options.filter((_, j) => j !== i), true)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 hover:bg-press hover:text-ink group-hover/opt:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {picking === i ? (
              <div className="pl-7">
                <HuePicker
                  value={o.color}
                  onPick={(hue) => {
                    set(options.map((x, j) => (j === i ? { ...x, color: hue } : x)), true)
                    setPicking(null)
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex h-8 items-center gap-1.5 px-1">
        <Plus className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Add option"
          aria-label="Add option"
          className="h-7 min-w-0 flex-1 bg-transparent px-1 text-ui text-ink outline-none placeholder:text-ink-3"
        />
      </div>
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
            <button key={c ?? "none"} type="button" aria-pressed={fmt.currency === c} className={seg(fmt.currency === c)} onClick={() => set({ ...fmt, currency: c })}>
              {c === "INR" ? "₹" : c === "USD" ? "$" : "None"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="px-1 pb-1 text-meta font-medium text-ink-3">Decimal places</p>
        <div className="flex gap-0.5 rounded-lg bg-hover p-0.5" role="group" aria-label="Decimal places">
          {([undefined, 0, 1, 2] as const).map((d) => (
            <button key={d ?? "auto"} type="button" aria-pressed={fmt.decimals === d} className={seg(fmt.decimals === d)} onClick={() => set({ ...fmt, decimals: d })}>
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
  rows,
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
  rows: TableRow[]
  tableId: string
  canManage: boolean
  frozen?: boolean
  index: number
  /** The menu's page while it's open; null when it is closed. */
  openPage: ColumnPage | null
  onOpenPage: (page: ColumnPage | null) => void
  onSave: (input: ColumnSaveInput) => Promise<void> | void
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
    void onSave({ name: n, type: field.type, config: baseConfig(field) })
  }

  // Type changes that would clear values ask first.
  const [pendingType, setPendingType] = React.useState<{ type: FieldType; lost: number } | null>(null)
  const applyType = (type: FieldType) => {
    if (type === field.type) {
      setPage("main")
      return
    }
    if (type === "formula") return setPage("formula")
    if (type === "relation") return setPage("relation")
    if (type === "rollup") return setPage("rollup")
    const lost = lostOnTypeChange(field, type, rows)
    if (lost > 0 && pendingType?.type !== type) {
      setPendingType({ type, lost })
      return
    }
    setPendingType(null)
    const cfg = type === "select" || type === "multi_select" ? { options: config.options || [] } : {}
    void onSave({ name: field.name, type, config: cfg })
    onOpenPage(type === "select" || type === "multi_select" ? "options" : "main")
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

  const aiEligible = ["text", "number", "url", "email"].includes(field.type)
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
      trailing: <span className="truncate text-meta text-ink-3">{t.value === field.type ? "Current" : t.hint}</span>,
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
                        onCheckedChange={(on) => void onSave({ name: field.name, type: field.type, config: { ...baseConfig(field), due: on || undefined } })}
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
                  {pendingType ? (
                    <div className="mx-1 mb-1 space-y-1.5 rounded-lg bg-camp-sun-tint px-2.5 py-2 text-meta text-camp-sun-ink" role="alert">
                      <p>
                        {pendingType.lost} {pendingType.lost === 1 ? "value isn't" : "values aren't"} {pendingType.type === "number" ? "numbers" : pendingType.type === "date" ? "dates" : "ticks"} and will be cleared.
                      </p>
                      <div className="flex gap-1.5">
                        <Button size="xs" variant="secondary" onClick={() => applyType(pendingType.type)}>
                          Change anyway
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setPendingType(null)}>
                          Keep {fieldTypeLabel(field.type).toLowerCase()}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <CommandList
                    label="Column type"
                    className="w-full animate-none bg-transparent shadow-none"
                    items={typeItems}
                    maxHeight={340}
                    activeIndex={undefined}
                    onSelect={(item) => applyType(item.id as FieldType)}
                  />
                </div>
              )}

              {page === "options" && (
                <div>
                  <SubHeader title="Options" onBack={() => setPage("main")} />
                  <OptionsEditor field={field} otherTinted={otherTinted} onSave={(cfg) => void onSave({ name: field.name, type: field.type, config: cfg })} />
                </div>
              )}

              {page === "format" && (
                <div>
                  <SubHeader title="Format" onBack={() => setPage("main")} />
                  <NumberFormatEditor field={field} onSave={(cfg) => void onSave({ name: field.name, type: field.type, config: cfg })} />
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
                        void onSave({ name: field.name, type: "formula", config: { ...(field.type === "formula" ? baseConfig(field) : {}), formula } })
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
                        void onSave({ name: field.name, type: "relation", config: { ...relation } })
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
                        void onSave({ name: field.name, type: "rollup", config: { ...rollup } })
                        onOpenPage(null)
                      }}
                    >
                      Save rollup
                    </Button>
                  </div>
                </div>
              )}

              {page === "ai" && (
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
                        void onSave({ name: field.name, type: field.type, config: cfg })
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
  onCreate: (input: ColumnSaveInput) => Promise<void>
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
  const create = async (input: ColumnSaveInput) => {
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
      trailing: <span className="truncate text-meta text-ink-3">{t.hint}</span>,
    }
  })
  const ready = step === "formula" ? !!formula.trim() : step === "relation" ? relationReady(relation) : step === "rollup" ? rollupReady(rollup) : false
  return (
    <th scope="col" className="h-9 w-12 p-0" data-add-column-cell="">
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
            className="flex h-9 w-full items-center justify-center text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:outline-none"
          >
            <Plus className="size-4" />
          </button>
        </PopoverAnchor>
        <PopoverContent align="end" sideOffset={4} className={cn("content-float rounded-xl p-1 shadow-e3", step === "formula" ? "w-[400px]" : step ? "w-80" : "w-[300px]")} data-add-column="">
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
