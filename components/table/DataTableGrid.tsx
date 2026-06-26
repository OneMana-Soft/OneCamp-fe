"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Check, ChevronDown } from "@/lib/icons"
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
  RelationTarget,
  parseFieldConfig,
  parseRowValues,
  createRow,
  updateRow,
  deleteRow,
  createField,
  updateField,
  deleteField,
} from "@/services/tableService"
import { RelationCell } from "@/components/table/RelationCell"

interface DataTableGridProps {
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
]

const RELATION_TARGETS: { value: string; label: string }[] = [
  { value: "any", label: "Anything" },
  { value: "task", label: "Tasks" },
  { value: "doc", label: "Docs" },
  { value: "board", label: "Boards" },
  { value: "project", label: "Projects" },
  { value: "user", label: "People" },
]

// Local working copy of a row's values for snappy inline editing.
type RowValues = Record<string, unknown>

export function DataTableGrid({ tableId, fields, rows, canManage, onChange }: DataTableGridProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [addingColumn, setAddingColumn] = React.useState(false)
  const [newColName, setNewColName] = React.useState("")
  const [newColType, setNewColType] = React.useState<FieldType>("text")

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  // Commit a single cell edit (optimistic; revalidate after).
  const commitCell = async (row: TableRow, fieldId: string, value: unknown) => {
    const current = parseRowValues(row)
    if (current[fieldId] === value) return
    const next: RowValues = { ...current, [fieldId]: value }
    try {
      await updateRow(tableId, row.id, next, row.position)
      onChange()
    } catch {
      // interceptor surfaces the error; revalidate to reset the cell
      onChange()
    }
  }

  const handleAddRow = async () => {
    setAdding(true)
    try {
      const pos = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0
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
      await createField(tableId, { name, type: newColType, position: pos })
      setNewColName("")
      setNewColType("text")
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60">
            {sortedFields.map((f) => (
              <ColumnHeader
                key={f.id}
                field={f}
                canManage={canManage}
                onSave={(input) => saveColumn(f, input)}
                onDelete={() => deleteColumn(f)}
              />
            ))}
            {canManage && (
              <th className="w-12 px-2 py-2">
                <Button
                  variant="ghost"
                  size="icon"
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
              <tr key={row.id} className="group border-b border-border/40 hover:bg-muted/30">
                {sortedFields.map((f) => (
                  <td key={f.id} className="border-r border-border/30 px-1 py-0.5">
                    <Cell
                      field={f}
                      value={values[f.id]}
                      onCommit={(v) => commitCell(row, f.id, v)}
                    />
                  </td>
                ))}
                {canManage && (
                  <td className="px-2 py-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
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
          <Button size="sm" onClick={handleAddColumn} disabled={busy || !newColName.trim()} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingColumn(false)}>
            Cancel
          </Button>
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
  canManage,
  onSave,
  onDelete,
}: {
  field: TableField
  canManage: boolean
  onSave: (input: { name: string; type: FieldType; config?: Record<string, unknown> }) => void
  onDelete: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(field.name)
  const [type, setType] = React.useState<FieldType>(field.type)
  const [options, setOptions] = React.useState<SelectOption[]>(
    () => parseFieldConfig(field).options || [],
  )
  const [newOption, setNewOption] = React.useState("")
  const [relationTarget, setRelationTarget] = React.useState<string>(
    () => (parseFieldConfig(field).relation_target as string) || "any",
  )

  React.useEffect(() => {
    if (open) {
      setName(field.name)
      setType(field.type)
      setOptions(parseFieldConfig(field).options || [])
      setRelationTarget((parseFieldConfig(field).relation_target as string) || "any")
      setNewOption("")
    }
  }, [open, field])

  const isSelect = type === "select" || type === "multi_select"
  const isRelation = type === "relation"

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const config = isSelect ? { options } : isRelation ? { relation_target: relationTarget } : {}
    onSave({ name: trimmed, type, config })
    setOpen(false)
  }

  const addOption = () => {
    const label = newOption.trim()
    if (!label || options.some((o) => o.label === label)) return
    setOptions((prev) => [...prev, { label }])
    setNewOption("")
  }

  if (!canManage) {
    return (
      <th className="min-w-[160px] border-r border-border/40 px-3 py-2 text-left font-medium text-muted-foreground">
        {field.name}
        <span className="ml-1 text-[10px] uppercase opacity-50">{field.type}</span>
      </th>
    )
  }

  return (
    <th className="min-w-[160px] border-r border-border/40 px-1 py-1 text-left font-medium text-muted-foreground">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1 hover:bg-muted/50">
            <span className="truncate">
              {field.name}
              <span className="ml-1 text-[10px] uppercase opacity-50">{field.type}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-3" onCloseAutoFocus={(e) => e.preventDefault()}>
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
                        className="text-destructive opacity-70 hover:opacity-100"
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
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {isRelation && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Links to</label>
                <select
                  value={relationTarget}
                  onChange={(e) => setRelationTarget(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                >
                  {RELATION_TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!name.trim()}>
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
}: {
  field: TableField
  value: unknown
  onCommit: (value: unknown) => void
}) {
  if (field.type === "checkbox") {
    return (
      <div className="flex justify-center py-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onCommit(e.target.checked)}
          className="h-4 w-4 rounded border-border"
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
        className="h-8 w-full bg-transparent px-2 text-sm outline-none"
      >
        <option value="">—</option>
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
          <button className="flex min-h-8 w-full flex-wrap items-center gap-1 px-2 py-1 text-left text-sm outline-none">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              selected.map((s) => (
                <span key={s} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs">
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
    const target = (parseFieldConfig(field).relation_target as RelationTarget) || "any"
    return (
      <RelationCell
        value={value}
        target={target}
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

  return <TextCell type={inputType} value={value} onCommit={onCommit} />
}

// TextCell is an uncontrolled-on-edit input that commits on blur / Enter,
// keeping typing snappy without a round trip per keystroke.
function TextCell({
  type,
  value,
  onCommit,
}: {
  type: string
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
      className={cn("h-8 w-full bg-transparent px-2 text-sm outline-none focus:bg-background")}
    />
  )
}

export default DataTableGrid
