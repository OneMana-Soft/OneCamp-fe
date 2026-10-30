"use client"

/**
 * A column's menu, its pages (content.md T07): the name, the type and what a
 * change of it clears, a select's options, a number's format, a formula, a
 * link, a rollup, Fill with AI, the field's settings. A chunk of its own
 * (ColumnMenu.tsx draws the header, and loads this the first time a menu
 * opens, warmed as the pointer or the focus reaches a header): the table's
 * first screen draws the grid, never these.
 *
 * It is mounted while its menu is open, so its drafts start from the field
 * each time the menu opens, as they always did.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { AlertTriangle, ArrowDown, ArrowUp, Copy, EyeOff, Filter, Loader2, Trash2, ArrowLeft, ArrowRight, Pin, Settings2, SlidersHorizontal, Square } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import {
  aggregateTable,
  computedOf,
  fieldProblem,
  fillTableAIColumn,
  formulaOf,
  isComputed,
  optionsOf,
  parseFieldConfig,
  relationOf,
  type AIFillResult,
  type FieldOption,
  type FieldType,
  type TableField,
} from "@/services/tableService"
import { newOptionId, previewConversion } from "@/services/tableCalls"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import { FieldSettings } from "@/components/table/fields/FieldSettings"
import { OptionsEditor } from "@/components/fields/OptionsEditor"
import { tintedFields } from "@/components/table/optionChip"
import { RelationSettings, RollupSettings, relationDraftOf, rollupConfigOf, rollupDraftOf, rollupReady, relationReady, type RelationDraft, type RollupDraft } from "@/components/table/LinkSettings"
import { FIELD_KINDS, fieldKind } from "@/lib/fieldTypes/registry"
import { ownConfig } from "@/lib/tables/ownConfig"
import { KindSettingRows, StatusGroupSelect } from "@/components/table/fields/KindSettings"
import { statusGroupOf, type StatusGroup } from "@/lib/fieldTypes/kindsMore"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import { useToast } from "@/hooks/use-toast"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { undoChange } from "@/lib/tables/ledger"
import { noteMyFill } from "@/lib/tables/useAIFills"
import { aiFillHeard, fillDone } from "@/lib/tables/aiFills"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import type { NumberFormat as ResultFormat } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { fieldKeyDown } from "@/lib/keys/ime"
import { aiPromptOf, settingsPageOf, type ColumnHeaderProps, type ColumnPage } from "@/components/table/ColumnMenu"
import { Divider, MenuRow, SettingsPage, SubHeader, TypeHint } from "./menuParts"

/** The glyphs of the kinds whose settings have a page of their own. */
const FormulaGlyph = fieldKind("formula").glyph
const RelationGlyph = fieldKind("relation").glyph
const RollupGlyph = fieldKind("rollup").glyph

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
  const label = fieldKind(to).label
  const kind = label === "URL" ? label : label.toLowerCase()
  const column = `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} column`
  if (cleared === null) return `Values that don't fit ${column} will be cleared. They couldn't be counted just now.`
  const n = `${formatLocale(cleared, {})} ${cleared === 1 ? "value" : "values"}`
  if (from === "multi_select" && to === "select") return `${n} will be cleared: each cell keeps its first option.`
  return `${n} ${cleared === 1 ? "doesn't" : "don't"} fit ${column} and will be cleared.`
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
  tintedNow,
  onSave,
}: {
  tableId: string
  field: TableField
  /** Another column in the table already tints its chips. */
  otherTinted: boolean
  /** Whether this column's chips are tinted now: its own say, or the table's default for its first select (optionChip tintedFields). */
  tintedNow: boolean
  onSave: (config: Record<string, unknown>) => void
}) {
  const [options, setOptions] = React.useState<FieldOption[]>(() => optionsOf(field))
  const [tinted, setTinted] = React.useState(tintedNow)
  React.useEffect(() => {
    setOptions(optionsOf(field))
    setTinted(tintedNow)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the field's settings change, not for each copy of the same
  }, [field.config])
  const counts = useOptionCounts(tableId, field)
  const then = field.type === "multi_select" ? "lose it" : "be left empty"
  // A status's options sit in groups: a new one is to do, and each says its own.
  const status = field.type === "status"
  const save = (next: FieldOption[], nextTinted: boolean, removed: string[] = []) =>
    // Said both ways: left out, a table's first select reads as tinted (optionChip tintedFields).
    onSave({ ...ownConfig(field), options: next, tinted: nextTinted, ...(removed.length ? { removed_options: removed } : {}) })
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
        make={(label) => ({ id: newOptionId(), label, ...(status ? { group: "todo" } : {}) })}
        aside={
          status
            ? (o, change) => <StatusGroupSelect value={statusGroupOf(o)} label={`${o.label}'s group`} onChange={(g: StatusGroup) => change({ ...o, group: g })} />
            : undefined
        }
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

/**
 * A number column's format (T08): currency, decimals, percent and its bar;
 * and a formula's or a rollup's (B2): that, or a duration, for a number it
 * gives, and a style for a date. Saves as it changes.
 */
function NumberFormatEditor({ field, onSave }: { field: TableField; onSave: (config: Record<string, unknown>) => void }) {
  const [fmt, setFmt] = React.useState<ResultFormat>(() => (parseFieldConfig(field).format as ResultFormat) || {})
  const set = (next: ResultFormat) => {
    // Unset choices aren't sent, so the server keeps only what's chosen.
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as ResultFormat
    setFmt(clean)
    onSave({ ...ownConfig(field), format: clean })
  }
  const computed = isComputed(field)
  const gives = computed ? computedOf(field).result : "number"
  const seg = (active: boolean) =>
    cn("h-6 flex-1 rounded-md text-ui-sm font-medium transition-colors", active ? "bg-raised text-ink shadow-sel" : "text-ink-2 hover:text-ink")
  if (gives === "date") {
    return (
      <div className="space-y-2 px-1 pb-1">
        <p className="px-1 pb-1 text-meta font-medium text-ink-3">Show the date</p>
        <div className="flex gap-0.5 rounded-lg bg-hover p-0.5" role="group" aria-label="Date style">
          {([undefined, "long", "relative", "iso"] as const).map((d) => (
            <button key={d ?? "short"} type="button" aria-pressed={fmt.date === d} data-touch-target="" className={seg(fmt.date === d)} onClick={() => set({ ...fmt, date: d })}>
              {d === "long" ? "Long" : d === "relative" ? "Ago" : d === "iso" ? "ISO" : "Short"}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2 px-1 pb-1">
      {computed ? (
        <div>
          <p className="px-1 pb-1 text-meta font-medium text-ink-3">Show it as</p>
          <div className="flex gap-0.5 rounded-lg bg-hover p-0.5" role="group" aria-label="Show it as">
            {([undefined, "h:mm", "h:mm:ss"] as const).map((d) => (
              <button
                key={d ?? "number"}
                type="button"
                aria-pressed={fmt.duration === d}
                data-touch-target=""
                className={seg(fmt.duration === d)}
                onClick={() => set(d ? { duration: d } : { ...fmt, duration: undefined })}
              >
                {d === "h:mm" ? "Duration" : d === "h:mm:ss" ? "With seconds" : "Number"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {fmt.duration ? null : (
        <>
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
      {fmt.percent && !computed ? (
        <label className="flex h-8 items-center justify-between rounded-lg px-1 text-ui text-ink">
          Show a bar
          <Switch checked={!!fmt.bar} aria-label="Show a bar" onCheckedChange={(on) => set({ ...fmt, bar: on || undefined })} />
        </label>
      ) : null}
        </>
      )}
    </div>
  )
}

/** The toast a column's fill answers with (audit 31): what it filled now and,
 * when the AI's rate stopped it there, that the rest continue in the
 * background (the header shows how far, with Stop); then how many more cells
 * are empty past what one fill takes. */
function fillToast({ filled, skipped, left, total, more }: AIFillResult) {
  const n = (v: number) => formatLocale(v, {})
  const skips = skipped ? `, skipped ${n(skipped)}` : ""
  const next = more > 0 ? ` ${n(more)} more ${more === 1 ? "is" : "are"} empty: fill the column again for ${more === 1 ? "it" : "them"}.` : ""
  return left > 0
    ? { title: "Filling in the background", description: `Filled ${n(filled)} of ${n(total)}${skips}; the rest continue in the background. Its column shows how far, with Stop.${next}` }
    : { title: "AI fill complete", description: `Filled ${n(filled)} ${filled === 1 ? "row" : "rows"}${skips}.${next}` }
}

/** The menu's props: the header's, and the page it is on. */
export type ColumnMenuBodyProps = ColumnHeaderProps & { page: ColumnPage }

/**
 * What is wrong with a field's formula or rollup, said on the menu and on the
 * page that puts it right. Its margin is the page's: the menu insets it as it
 * does its rows, and the settings page sets it flush with its fields.
 */
function ProblemRow({ problem, className }: { problem: string; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 rounded-lg bg-sunken px-2 py-1.5 text-meta text-danger-ink", className)}>
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      {problem}
    </p>
  )
}

export function ColumnMenuBody({ field, fields, tableId, page, onOpenPage, onSave, onDelete, onInsert, onDuplicate, onSort, onFilter, onHide, onFilled, fill: running, onStopFill }: ColumnMenuBodyProps) {
  const { toast } = useToast()
  const setPage = (p: ColumnPage) => onOpenPage(p)
  const Glyph = fieldKind(field.type).glyph
  const config = parseFieldConfig(field)
  const savedAiPrompt = aiPromptOf(config)
  const problem = fieldProblem(field)
  // A link, a rollup, people or what a row says of itself can't name the
  // table's rows (the server refuses it).
  const mayBePrimary = !field.primary && !["relation", "rollup", "people"].includes(field.type) && !fieldKind(field.type).fromRow

  const [name, setName] = React.useState(field.name)
  React.useEffect(() => {
    setName(field.name)
  }, [field.name])
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
    const options = fieldKind(type).options
    if (!options) onOpenPage("main")
    else setChanging(type)
    const saved = await onSave({ type, config: options ? { options: optionsOf(field) } : {} })
    if (saved === false) setChanging(null)
  }
  React.useEffect(() => {
    if (!changing) return
    if (field.type === changing) {
      setChanging(null)
      // Unless the person went on to another page meanwhile.
      if (page === "type") onOpenPage("options")
    }
  }, [changing, field.type, page, onOpenPage])
  const applyType = async (type: FieldType) => {
    if (type === field.type) {
      setPage("main")
      return
    }
    const settings = settingsPageOf(type)
    if (settings) return setPage(settings)
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
  const [rollup, setRollup] = React.useState<RollupDraft>(() => rollupDraftOf(field))
  const [aiPrompt, setAiPrompt] = React.useState(() => aiPromptOf(config))
  const [aiAuto, setAiAuto] = React.useState(() => aiAutoOf(config))
  const [filling, setFilling] = React.useState(false)
  React.useEffect(() => {
    setFormula(formulaOf(field).formula)
    setRelation(relationDraftOf(field))
    setRollup(rollupDraftOf(field))
    setAiPrompt(aiPromptOf(parseFieldConfig(field)))
    setAiAuto(aiAutoOf(parseFieldConfig(field)))
    setPendingType(null)
  }, [field])

  // AI fills a column only where AI is on: with it off (or on the edition
  // without it) "Fill with AI…" could only fail.
  const ai = useAIAvailable()
  const aiEligible = ai && ["text", "long_text", "number", "url", "email"].includes(field.type)
  // A link keeps its type: the server refuses changing one, to a table's rows
  // or to items (docs, tasks, boards, projects, people), which it would
  // otherwise write out as text.
  const linkKind = field.type === "relation" ? (relationOf(field).target === "table" ? "A link to another table" : "A link to docs, tasks, boards, projects or people") : null
  const isSelect = fieldKind(field.type).options
  const tintedIds = tintedFields(fields)
  const otherTinted = fields.some((f) => f.id !== field.id && tintedIds.has(f.id))

  // A fill past 500 cells asks first: each cell is one call to the
  // workspace's model. confirming holds how many cells it would take.
  const [confirming, setConfirming] = React.useState<number | null>(null)
  const offerUndo = useUndoToast(onFilled)
  const fill = async (confirm = false) => {
    setFilling(true)
    try {
      const res = await fillTableAIColumn(tableId, field.id, undefined, confirm)
      if (res.needs_confirm) {
        setConfirming(res.total)
        return
      }
      setConfirming(null)
      noteMyFill(res.fill)
      // Its header shows how far it has got at once.
      if (res.fill) aiFillHeard(tableId, res.fill)
      const note = fillToast(res)
      // Done in the request: its Undo is offered now; one going on in the
      // background is offered when it ends (useAIFills).
      if (res.left === 0 && res.change_set && res.filled > 0) offerUndo(note.title, () => undoChange(tableId, res.change_set), note.description, "Undo fill")
      else toast(note)
      // The rest goes on in the background, and its header shows it: the menu
      // (a sheet on a phone, under the toast) closes.
      if (res.fill && res.left > 0) onOpenPage(null)
      onFilled()
    } catch {
      // surfaced by interceptor
    } finally {
      setFilling(false)
    }
  }

  // The kinds a column may become: those the menu offers, and its own.
  const typeItems: CommandListItem[] = FIELD_KINDS.filter((t) => t.offered || t.id === field.type).map((t) => {
    const G = t.glyph
    return {
      id: t.id,
      label: t.label,
      text: t.label,
      group: t.group,
      tile: (
        <CommandTile>
          <G />
        </CommandTile>
      ),
      trailing: <TypeHint>{t.id === field.type ? "Current" : t.hint}</TypeHint>,
    }
  })

  return (
    <div key={page} className={page === "main" ? undefined : "table-sub-in"}>
      {page === "main" && (
        <div>
          <div className="p-1 pb-1.5">
            <input
              // On a touch screen a focused name raises the keyboard over the
              // menu as it opens (DESIGN-BUILD-15): focus it on a pointer only.
              autoFocus={!isTouchScreen()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={fieldKeyDown((e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitName()
                  onOpenPage(null)
                }
              })}
              aria-label="Column name"
              maxLength={120}
              className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none focus:focus-halo"
            />
          </div>
          {/* A running fill is stopped here too: on a phone, a column wider
              than the screen keeps its header's Stop off screen. */}
          {running && onStopFill ? (
            <>
              <MenuRow icon={<Square className="fill-current !text-agent" />} label={`Stop filling ${field.name}`} hint={fillDone(running)} onClick={() => (onStopFill(), onOpenPage(null))} />
              {/* The running job, set apart from the field's own actions. */}
              <Divider />
            </>
          ) : null}
          <MenuRow icon={<Glyph />} label="Type" hint={fieldKind(field.type).label} sub onClick={() => setPage("type")} />
          {isSelect && <MenuRow icon={<SlidersHorizontal />} label="Options" hint={String((config.options || []).length)} sub onClick={() => setPage("options")} />}
          {(field.type === "number" || (isComputed(field) && ["number", "date"].includes(computedOf(field).result))) && (
            <MenuRow icon={<SlidersHorizontal />} label="Format" sub onClick={() => setPage("format")} />
          )}
          <KindSettingRows field={field} onSave={(cfg) => void onSave({ config: cfg })} />
          {field.type === "date" && (
            <label className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-ui text-ink hover:bg-hover">
              <span className="flex-1">Due date (overdue in red)</span>
              <Switch
                checked={config.due === true}
                aria-label="Due date"
                onCheckedChange={(on) => void onSave({ config: { ...ownConfig(field), due: on || undefined } })}
              />
            </label>
          )}
          {field.type === "formula" && <MenuRow icon={<FormulaGlyph />} label="Formula…" onClick={() => setPage("formula")} />}
          {field.type === "relation" && <MenuRow icon={<RelationGlyph />} label="Linked table" sub onClick={() => setPage("relation")} />}
          {field.type === "rollup" && <MenuRow icon={<RollupGlyph />} label="Rollup" sub onClick={() => setPage("rollup")} />}
          <MenuRow icon={<Settings2 />} label="Field settings" hint={field.required ? "Required" : undefined} sub onClick={() => setPage("settings")} />
          {mayBePrimary && <MenuRow icon={<Pin />} label="Set as primary field" onClick={() => (void onSave({ primary: true }), onOpenPage(null))} />}
          {problem && <ProblemRow problem={problem} className="mx-1 my-1" />}
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
          {/* The primary field names every row: another becomes it first. */}
          <MenuRow icon={<Trash2 />} label="Delete field" hint={field.primary ? "Primary" : undefined} danger={!field.primary} disabled={field.primary} onClick={() => (onOpenPage(null), onDelete())} />
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
                  Keep {fieldKind(field.type).label.toLowerCase()}
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

      {page === "settings" && (
        <div>
          <SubHeader title="Field settings" onBack={() => setPage("main")} />
          <FieldSettings field={field} onSave={(patch) => void onSave(patch)} />
        </div>
      )}

      {page === "options" && (
        <div>
          <SubHeader title="Options" onBack={() => setPage("main")} />
          <SelectOptions tableId={tableId} field={field} otherTinted={otherTinted} tintedNow={tintedIds.has(field.id)} onSave={(cfg) => void onSave({ config: cfg })} />
        </div>
      )}

      {page === "format" && (
        <div>
          <SubHeader title="Format" onBack={() => setPage("main")} />
          <NumberFormatEditor field={field} onSave={(cfg) => void onSave({ config: cfg })} />
        </div>
      )}

      {page === "formula" && (
        <SettingsPage
          title="Formula"
          onBack={() => setPage("main")}
          footer={
            <>
            <Button size="sm" variant="ghost" onClick={() => onOpenPage(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!formula.trim()}
              onClick={() => {
                void onSave({ ...(field.type === "formula" ? {} : { type: "formula" as const }), config: { ...(field.type === "formula" ? ownConfig(field) : {}), formula } })
                onOpenPage(null)
              }}
            >
              Save formula
            </Button>
            </>
          }
        >
          <FormulaEditor tableId={tableId} fields={fields} fieldId={field.id} value={formula} onChange={setFormula} />
        </SettingsPage>
      )}

      {page === "relation" && (
        <SettingsPage
          title="Linked table"
          onBack={() => setPage("main")}
          footer={
            <>
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
            </>
          }
        >
          <RelationSettings tableId={tableId} field={field.type === "relation" ? field : undefined} draft={relation} onChange={setRelation} />
        </SettingsPage>
      )}

      {page === "rollup" && (
        <SettingsPage
          title="Rollup"
          onBack={() => setPage("main")}
          footer={
            <>
            <Button size="sm" variant="ghost" onClick={() => onOpenPage(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!rollupReady(rollup)}
              onClick={() => {
                void onSave({ ...(field.type === "rollup" ? {} : { type: "rollup" as const }), config: rollupConfigOf(rollup, field) })
                onOpenPage(null)
              }}
            >
              Save rollup
            </Button>
            </>
          }
        >
          {/* What is wrong stays in view while it is put right (a formula's editor checks its own). */}
          {problem && <ProblemRow problem={problem} className="my-1" />}
          <RollupSettings fields={fields.filter((f) => f.id !== field.id)} draft={rollup} onChange={setRollup} />
        </SettingsPage>
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
          {confirming !== null ? (
            <div role="group" aria-label="Confirm the fill" className="space-y-2 rounded-xl bg-agent-muted/60 p-2.5">
              <p className="text-ui text-ink">
                Fill {formatLocale(confirming, {})} cells with your workspace&apos;s model? That&apos;s {formatLocale(confirming, {})} AI calls, made in the background.
              </p>
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={filling} onClick={() => void fill(true)} className="gap-1.5">
                  {filling ? <Loader2 className="size-3.5 animate-spin" /> : <Spark size={14} />}
                  Fill {formatLocale(confirming, {})} cells
                </Button>
              </div>
            </div>
          ) : null}
          {/* While the fill asks first, its button is the only primary. */}
          {confirming === null ? (
            <div className="flex justify-end gap-1.5">
              {savedAiPrompt ? (
                <Button size="sm" variant="secondary" disabled={filling} onClick={() => void fill()} className="gap-1.5">
                  {filling ? <Loader2 className="size-3.5 animate-spin" /> : <Spark size={14} className="text-agent" />}
                  {filling ? "Filling…" : "Fill column"}
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!aiPrompt.trim() && !savedAiPrompt}
                onClick={() => {
                  const cfg = ownConfig(field)
                  if (aiPrompt.trim()) cfg.ai = { prompt: aiPrompt.trim(), auto: aiAuto }
                  else delete cfg.ai
                  void onSave({ config: cfg })
                }}
              >
                Save prompt
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
