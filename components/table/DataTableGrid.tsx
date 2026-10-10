"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Check, ChevronDown, Sparkles, Loader2, AlertTriangle, Type, Hash, CircleDot, Tag, CalendarDays, CheckSquare, Link2, AtSign, User, ArrowUpRight, Sigma, Network } from "@/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TableField,
  TableRow,
  FieldType,
  SelectOption,
  RelationRef,
  parseFieldConfig,
  parseRowValues,
  formulaOf,
  relationOf,
  rollupOf,
  computedOf,
  fieldProblem,
  createRow,
  updateRow,
  deleteRow,
  createField,
  updateField,
  deleteField,
  fillTableAIColumn,
  nextRowPosition,
  writableValues,
  changeLinks,
} from "@/services/tableService"
import { RelationCell } from "@/components/table/RelationCell"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import {
  RelationSettings,
  RollupSettings,
  relationDraftOf,
  relationReady,
  rollupReady,
  type RelationDraft,
  type RollupDraft,
} from "@/components/table/LinkSettings"
import { showFormulaValue } from "@/lib/tables/formula"

interface DataTableGridProps {
  /** Where a new row goes, when rows are filtered out of this view: after every row. */
  nextPosition?: number
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  onChange: () => void // ask the parent to revalidate the bundle
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "person", label: "Person" },
  { value: "relation", label: "Relation" },
  { value: "formula", label: "Formula" },
  { value: "rollup", label: "Rollup" },
]

/**
 * The glyph a column header shows for its type. A column header used to spell
 * its type out in small capitals ("COST NUMBER"), which put a second word in
 * shouting case on every column; the glyph carries the same information, and
 * the type is still named for assistive technology and on hover.
 */
const FIELD_GLYPH: Record<FieldType, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  text: Type,
  number: Hash,
  select: CircleDot,
  multi_select: Tag,
  date: CalendarDays,
  checkbox: CheckSquare,
  url: Link2,
  email: AtSign,
  person: User,
  relation: ArrowUpRight,
  formula: Sigma,
  rollup: Network,
}

const fieldTypeLabel = (type: FieldType) => FIELD_TYPES.find((t) => t.value === type)?.label ?? type

/** A number-like column reads right-aligned in tabular figures, so digits line up by place. */
const isNumeric = (f: TableField) => f.type === "number" || ((f.type === "formula" || f.type === "rollup") && computedOf(f).result === "number")

function FieldTypeGlyph({ type }: { type: FieldType }) {
  const Glyph = FIELD_GLYPH[type] ?? Type
  return (
    <span title={fieldTypeLabel(type)} className="inline-flex shrink-0 text-muted-foreground">
      <Glyph className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{fieldTypeLabel(type)}</span>
    </span>
  )
}

const NO_ROLLUP: RollupDraft = { relation: "", field: "", aggregate: "" }

/** Whether a field's settings are complete enough to save. */
function settingsReady(type: FieldType, formula: string, relation: RelationDraft, rollup: RollupDraft): boolean {
  if (type === "formula") return !!formula.trim()
  if (type === "relation") return relationReady(relation)
  if (type === "rollup") return rollupReady(rollup)
  return true
}

// Local working copy of a row's values for snappy inline editing.
type RowValues = Record<string, unknown>

// aiPromptOf reads an AI column's prompt from a parsed field config
// ({"ai":{"prompt":"..."}}); returns "" when the column is not AI-driven.
function aiPromptOf(config: { [k: string]: unknown }): string {
  const ai = config?.ai as { prompt?: string } | undefined
  return (ai?.prompt || "").trim()
}

// aiAutoOf reads an AI column's continuous-autofill flag
// ({"ai":{"auto":true}}); when true the cell recomputes automatically as the
// row is created or edited, instead of only on a manual "Fill column" run.
function aiAutoOf(config: { [k: string]: unknown }): boolean {
  const ai = config?.ai as { auto?: boolean } | undefined
  return Boolean(ai?.auto)
}

export function DataTableGrid({ tableId, fields, rows, canManage, onChange, nextPosition }: DataTableGridProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [addingColumn, setAddingColumn] = React.useState(false)
  const [newColName, setNewColName] = React.useState("")
  const [newColType, setNewColType] = React.useState<FieldType>("text")
  const [newColFormula, setNewColFormula] = React.useState("")
  const [newColRelation, setNewColRelation] = React.useState<RelationDraft>(() => relationDraftOf())
  const [newColRollup, setNewColRollup] = React.useState<RollupDraft>(NO_ROLLUP)

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  // Commit a single cell edit (optimistic; revalidate after).
  const commitCell = async (row: TableRow, fieldId: string, value: unknown) => {
    const current = parseRowValues(row)
    if (current[fieldId] === value) return
    const next: RowValues = writableValues(fields, { ...current, [fieldId]: value })
    try {
      await updateRow(tableId, row.id, next, row.position)
      onChange()
    } catch {
      // interceptor surfaces the error; revalidate to reset the cell
      onChange()
    }
  }

  // Link a row to rows of the table a field links to, or unlink it.
  const linkCell = async (row: TableRow, fieldId: string, change: { add?: string[]; remove?: string[] }) => {
    try {
      await changeLinks(tableId, row.id, fieldId, change)
    } catch {
      // surfaced by the interceptor
    } finally {
      onChange()
    }
  }

  const handleAddRow = async () => {
    setAdding(true)
    try {
      const pos = nextPosition ?? nextRowPosition(rows)
      await createRow(tableId, {}, pos)
      onChange()
    } catch {
      // surfaced by interceptor
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteRow = async (row: TableRow) => {
    setBusy(true)
    try {
      await deleteRow(tableId, row.id)
      onChange()
    } catch {
      // surfaced
    } finally {
      setBusy(false)
    }
  }

  const handleAddColumn = async () => {
    const name = newColName.trim()
    if (!name) return
    setBusy(true)
    try {
      const pos = sortedFields.length ? Math.max(...sortedFields.map((f) => f.position)) + 1 : 0
      await createField(tableId, {
        name,
        type: newColType,
        position: pos,
        config:
          newColType === "formula"
            ? { formula: newColFormula }
            : newColType === "relation"
              ? { ...newColRelation }
              : newColType === "rollup"
                ? { ...newColRollup }
                : undefined,
      })
      setNewColName("")
      setNewColType("text")
      setNewColFormula("")
      setNewColRelation(relationDraftOf())
      setNewColRollup(NO_ROLLUP)
      setAddingColumn(false)
      onChange()
      toast({ title: "Column added" })
    } catch {
      // surfaced
    } finally {
      setBusy(false)
    }
  }

  const saveColumn = async (
    field: TableField,
    input: { name: string; type: FieldType; config?: Record<string, unknown> },
  ) => {
    try {
      await updateField(tableId, field.id, {
        name: input.name,
        type: input.type,
        config: input.config,
        position: field.position,
      })
      onChange()
      toast({ title: "Column updated" })
    } catch {
      onChange()
    }
  }

  const deleteColumn = async (field: TableField) => {
    confirm({
      title: "Delete column",
      description: `Delete column "${field.name}"? Existing cell data in this column is removed.`,
      confirmText: "Delete",
      onConfirm: async () => {
        try {
          await deleteField(tableId, field.id)
          onChange()
          toast({ title: "Column deleted" })
        } catch {
          // surfaced
        }
      },
    })
  }

  return (
    <div>
    {/* The grid scrolls inside its own frame so the header row can stay in
        view: a sticky header needs its scroll container to be the one that
        scrolls, and an overflow-x wrapper on its own pins it to nothing. */}
    <div className="max-h-[calc(100dvh-16rem)] min-h-[8rem] overflow-auto overscroll-contain">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-[1] bg-background">
          <tr>
            {sortedFields.map((f) => (
              <ColumnHeader
                key={f.id}
                field={f}
                fields={sortedFields}
                tableId={tableId}
                canManage={canManage}
                onSave={(input) => saveColumn(f, input)}
                onDelete={() => deleteColumn(f)}
                onFilled={onChange}
              />
            ))}
            {canManage && (
              <th className="w-12 border-b border-border/60 px-2 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Add a column"
                  className="h-7 w-7"
                  onClick={() => setAddingColumn((v) => !v)}
                  title="Add column"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = parseRowValues(row)
            return (
              <tr key={row.id} className="group hover:bg-muted/40">
                {sortedFields.map((f) => (
                  <td key={f.id} className={cn("border-b border-r border-border/40 px-1 py-0.5 align-middle", isNumeric(f) && "text-right")}>
                    <Cell
                      field={f}
                      value={values[f.id]}
                      onCommit={(v) => commitCell(row, f.id, v)}
                      onLink={(change) => linkCell(row, f.id, change)}
                    />
                  </td>
                ))}
                {canManage && (
                  <td className="border-b border-border/40 px-2 py-0.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete this row"
                      className="h-7 w-7 text-destructive opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
                      disabled={busy}
                      onClick={() => handleDeleteRow(row)}
                      title="Delete row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>

      {addingColumn && canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Column name"
            className="h-8 w-48"
            onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
          />
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as FieldType)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleAddColumn}
            disabled={busy || !newColName.trim() || !settingsReady(newColType, newColFormula, newColRelation, newColRollup)}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" /> Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingColumn(false)}>
            Cancel
          </Button>
          {newColType === "formula" && (
            <div className="w-full max-w-md">
              <FormulaEditor tableId={tableId} fields={sortedFields} value={newColFormula} onChange={setNewColFormula} />
            </div>
          )}
          {newColType === "relation" && (
            <div className="w-full max-w-xs">
              <RelationSettings tableId={tableId} draft={newColRelation} onChange={setNewColRelation} />
            </div>
          )}
          {newColType === "rollup" && (
            <div className="w-full max-w-xs">
              <RollupSettings fields={sortedFields} draft={newColRollup} onChange={setNewColRollup} />
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleAddRow}
        disabled={adding}
        className="mt-1 flex w-full items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> New row
      </button>
    </div>
  )
}

// ColumnHeader renders a column title; for managers it opens a dropdown to
// rename, change type, manage select options, and delete the column.
function ColumnHeader({
  field,
  fields,
  tableId,
  canManage,
  onSave,
  onDelete,
  onFilled,
}: {
  field: TableField
  /** The table's fields, for a formula to use. */
  fields: TableField[]
  tableId: string
  canManage: boolean
  onSave: (input: { name: string; type: FieldType; config?: Record<string, unknown> }) => void
  onDelete: () => void
  onFilled: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(field.name)
  const [type, setType] = React.useState<FieldType>(field.type)
  const [options, setOptions] = React.useState<SelectOption[]>(
    () => parseFieldConfig(field).options || [],
  )
  const [newOption, setNewOption] = React.useState("")
  const [relation, setRelation] = React.useState<RelationDraft>(() => relationDraftOf(field))
  const [rollup, setRollup] = React.useState<RollupDraft>(() => {
    const r = rollupOf(field)
    return { relation: r.relation, field: r.field, aggregate: r.aggregate }
  })
  const [formula, setFormula] = React.useState<string>(() => formulaOf(field).formula)
  const [aiPrompt, setAiPrompt] = React.useState<string>(() => aiPromptOf(parseFieldConfig(field)))
  const [aiAuto, setAiAuto] = React.useState<boolean>(() => aiAutoOf(parseFieldConfig(field)))
  const [filling, setFilling] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(field.name)
      setType(field.type)
      setOptions(parseFieldConfig(field).options || [])
      setRelation(relationDraftOf(field))
      const r = rollupOf(field)
      setRollup({ relation: r.relation, field: r.field, aggregate: r.aggregate })
      setFormula(formulaOf(field).formula)
      setAiPrompt(aiPromptOf(parseFieldConfig(field)))
      setAiAuto(aiAutoOf(parseFieldConfig(field)))
      setNewOption("")
    }
  }, [open, field])

  const isSelect = type === "select" || type === "multi_select"
  const isRelation = type === "relation"
  const isFormula = type === "formula"
  const isRollup = type === "rollup"
  // AI columns are plain content columns (text/number/url/email) driven by a
  // prompt. Select/relation columns have their own structured config instead,
  // and a formula or a rollup works its cells out itself.
  const aiEligible = !isSelect && !isRelation && !isFormula && !isRollup
  const problem = fieldProblem(field)
  const ready = settingsReady(type, formula, relation, rollup)
  const savedAiPrompt = aiPromptOf(parseFieldConfig(field))

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!ready) return
    const config: Record<string, unknown> = isSelect
      ? { options }
      : isRelation
        ? { ...relation }
        : isFormula
          ? { formula }
          : isRollup
            ? { ...rollup }
            : {}
    if (aiEligible && aiPrompt.trim()) {
      config.ai = { prompt: aiPrompt.trim(), auto: aiAuto }
    }
    onSave({ name: trimmed, type, config })
    setOpen(false)
  }

  const handleFill = async () => {
    setFilling(true)
    try {
      const res = await fillTableAIColumn(tableId, field.id)
      toast({
        title: "AI fill complete",
        description: `Filled ${res.filled} ${res.filled === 1 ? "row" : "rows"}${
          res.skipped ? `, skipped ${res.skipped}` : ""
        }.`,
      })
      onFilled()
    } catch {
      // surfaced by interceptor
    } finally {
      setFilling(false)
    }
  }

  const addOption = () => {
    const label = newOption.trim()
    if (!label || options.some((o) => o.label === label)) return
    setOptions((prev) => [...prev, { label }])
    setNewOption("")
  }

  if (!canManage) {
    return (
      <th className={cn("min-w-[160px] border-b border-r border-border/60 px-3 py-2 font-medium text-muted-foreground", isNumeric(field) ? "text-right" : "text-left")}>
        <span className={cn("inline-flex max-w-full items-center gap-1.5", isNumeric(field) && "flex-row-reverse")}>
          <FieldTypeGlyph type={field.type} />
          <span className="truncate">{field.name}</span>
          {savedAiPrompt && <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Filled by AI" />}
          {problem && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-label={problem} />}
        </span>
      </th>
    )
  }

  return (
    <th className="min-w-[160px] border-b border-r border-border/60 px-1 py-1 text-left font-medium text-muted-foreground">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group/col flex w-full items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isNumeric(field) && "flex-row-reverse",
            )}
            aria-label={`${field.name}, ${fieldTypeLabel(field.type)} column. Edit column`}
          >
            <FieldTypeGlyph type={field.type} />
            <span className="truncate">{field.name}</span>
            {savedAiPrompt && <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Filled by AI" />}
            {problem && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" aria-label={problem} />}
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/col:opacity-60 group-focus-visible/col:opacity-60", isNumeric(field) ? "mr-auto" : "ml-auto")} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn(isFormula || isRollup || isRelation ? "w-80" : "w-64", "p-3")} onCloseAutoFocus={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8"
                onKeyDown={(e) => e.key === "Enter" && save()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {isSelect && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Options</label>
                <div className="space-y-1">
                  {options.map((o, i) => (
                    <div key={o.label} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
                      <span className="truncate">{o.label}</span>
                      <button
 aria-label="Remove option"                        className="text-destructive opacity-70 hover:opacity-100"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option"
                    className="h-7 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addOption()
                      }
                    }}
                  />
                  <Button aria-label="Add option" size="icon" variant="ghost" className="h-7 w-7" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {isFormula && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Formula</label>
                <FormulaEditor tableId={tableId} fields={fields} fieldId={field.id} value={formula} onChange={setFormula} />
              </div>
            )}

            {isRelation && <RelationSettings tableId={tableId} field={field.type === "relation" ? field : undefined} draft={relation} onChange={setRelation} />}

            {isRollup && <RollupSettings fields={fields.filter((f) => f.id !== field.id)} draft={rollup} onChange={setRollup} />}

            {problem && (
              <p className="flex items-start gap-1 text-2xs leading-snug text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {problem}
              </p>
            )}

            {aiEligible && (
              <div className="space-y-1 rounded-md border border-brand/30 bg-brand/5 p-2">
                <label className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> AI autofill
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe what to put in this cell, e.g. 'Summarize the row in one line'"
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <p className="text-2xs leading-tight text-muted-foreground">
                  Each cell is generated from this column&apos;s prompt and the row&apos;s other
                  values. Save first, then fill.
                </p>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-2xs leading-tight text-muted-foreground hover:bg-brand/5">
                  <input
                    type="checkbox"
                    checked={aiAuto}
                    onChange={(e) => setAiAuto(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="font-medium text-primary">Autofill on change</span>
                    {": recompute each cell automatically when a row is added or edited."}
                  </span>
                </label>
                {savedAiPrompt && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 border-brand/40 text-primary hover:bg-brand/10"
                    disabled={filling}
                    onClick={handleFill}
                  >
                    {filling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {filling ? "Filling…" : "Fill column with AI"}
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!name.trim() || !ready}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  )
}

// Cell renders the right editor for a field type. Edits commit on blur / change.
function Cell({
  field,
  value,
  onCommit,
  onLink,
}: {
  field: TableField
  value: unknown
  onCommit: (value: unknown) => void
  /** Links or unlinks rows of the table a relation links to. */
  onLink: (change: { add?: string[]; remove?: string[] }) => void
}) {
  if (field.type === "formula" || field.type === "rollup") {
    return <ComputedCell field={field} value={value} />
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex justify-center py-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onCommit(e.target.checked)}
          aria-label={field.name}
          className="h-4 w-4 rounded-sm border-border"
        />
      </div>
    )
  }

  if (field.type === "select") {
    const options = parseFieldConfig(field).options || []
    return (
      <select
        value={(value as string) || ""}
        onChange={(e) => onCommit(e.target.value)}
        aria-label={field.name}
        className="h-8 w-full cursor-pointer appearance-none truncate bg-transparent px-2 text-sm outline-none focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <option value=""></option>
        {options.map((o) => (
          <option key={o.label} value={o.label}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === "multi_select") {
    const options = parseFieldConfig(field).options || []
    const selected: string[] = Array.isArray(value) ? (value as string[]) : []
    const toggle = (label: string) => {
      const next = selected.includes(label)
        ? selected.filter((s) => s !== label)
        : [...selected, label]
      onCommit(next)
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label={`${field.name}: ${selected.length ? selected.join(", ") : "none chosen"}`} className="flex min-h-8 w-full flex-wrap items-center gap-1 px-2 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
            {selected.length === 0 ? null : (
              selected.map((s) => (
                <span key={s} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                  {s}
                </span>
              ))
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 p-1">
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No options. Add some in the column menu.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.label}
                onClick={() => toggle(o.label)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input type="checkbox" readOnly checked={selected.includes(o.label)} className="h-3.5 w-3.5" />
                {o.label}
              </button>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  if (field.type === "relation") {
    const { target, tableId, tableName } = relationOf(field)
    const linksTable = target === "table"
    return (
      <RelationCell
        value={value}
        target={target}
        tableId={tableId}
        // A table the reader can't open comes without its name: its links show, but stay as they are.
        readOnly={linksTable && !tableName}
        onLink={linksTable ? onLink : undefined}
        onCommit={(refs: RelationRef[]) => onCommit(refs)}
      />
    )
  }

  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "email"
          ? "email"
          : field.type === "url"
            ? "url"
            : "text"

  return <TextCell type={inputType} label={field.name} value={value} onCommit={onCommit} />
}

// TextCell is an uncontrolled-on-edit input that commits on blur / Enter,
// keeping typing snappy without a round trip per keystroke.
function TextCell({
  type,
  label,
  value,
  onCommit,
}: {
  type: string
  label: string
  value: unknown
  onCommit: (value: unknown) => void
}) {
  const [local, setLocal] = React.useState<string>(value == null ? "" : String(value))
  React.useEffect(() => {
    setLocal(value == null ? "" : String(value))
  }, [value])

  const commit = () => {
    if (type === "number") {
      const n = local.trim() === "" ? "" : Number(local)
      onCommit(n === "" || Number.isNaN(n) ? "" : n)
    } else {
      onCommit(local)
    }
  }

  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
      aria-label={label}
      className={cn(
        "h-8 w-full bg-transparent px-2 text-sm outline-none focus:bg-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
        type === "number" && "text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        // A date picker's calendar glyph on every row is noise: it shows on the
        // row under the pointer and on the focused cell.
        type === "date" && "tabular-nums [&::-webkit-calendar-picker-indicator]:opacity-0 group-hover:[&::-webkit-calendar-picker-indicator]:opacity-50 focus:[&::-webkit-calendar-picker-indicator]:opacity-50",
      )}
    />
  )
}


// ComputedCell shows what a formula or a rollup gives for the row, as the
// server worked it out. It can't be edited: change the field instead.
function ComputedCell({ field, value }: { field: TableField; value: unknown }) {
  const shown = showFormulaValue(value, computedOf(field).result)
  switch (shown.kind) {
    case "blank":
      return <div className="h-8" />
    case "error":
      return (
        <div className="flex h-8 items-center px-2 text-xs text-destructive" title={shown.message}>
          <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />
          <span className="truncate">{shown.message}</span>
        </div>
      )
    case "checkbox":
      return (
        <div className="flex h-8 items-center justify-center" aria-label={shown.checked ? "Yes" : "No"}>
          {shown.checked && <Check className="h-4 w-4 text-foreground" />}
        </div>
      )
    case "number":
      return <div className="flex h-8 items-center justify-end px-2 text-sm tabular-nums">{shown.text}</div>
    default:
      return (
        <div className="flex h-8 items-center px-2 text-sm" title={shown.text}>
          <span className="truncate">{shown.text}</span>
        </div>
      )
  }
}
