"use client"

// Settings for fields that reach into another table:
//  - what a relation links to: OneCamp items, or a table's rows, with the
//    links shown in that table too, or not (and, for one made without, later);
//  - what a rollup adds up from the rows a relation links to.

import * as React from "react"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { parseFieldConfig, relationOf, rollupOf, tableFieldsKey, type DataTable, type RollupHow, type TableField } from "@/services/tableService"
import { OPS_FOR, sortWords } from "@/lib/tables/viewRules"
import { Plus, X } from "@/lib/icons"
import { canRollUp, canSortRollupBy, rollupOptions, ROLLUP_LABELS, tableRelations, workedOutElsewhere } from "@/lib/tables/links"
import { filterKind } from "@/lib/fieldTypes/registry"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const labelClass = "text-xs font-medium text-muted-foreground"

/** A rollup's field left unchosen: it counts the linked rows. A select's item can't be "", so it has a name of its own. */
const JUST_THE_ROWS = "__rows__"

/**
 * One of these settings' choices: the app's select (components/ui/select),
 * never the browser's own, named by its label (id) or aria-label; "" shows
 * its placeholder.
 */
function LinkSelect({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id?: string
  label?: string
  value: string
  placeholder?: string
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label} dense className="h-8">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const RELATION_TARGETS: { value: string; label: string }[] = [
  { value: "table", label: "Rows of a table" },
  { value: "any", label: "Anything in OneCamp" },
  { value: "task", label: "Tasks" },
  { value: "doc", label: "Docs" },
  { value: "board", label: "Boards" },
  { value: "project", label: "Projects" },
  { value: "user", label: "People" },
]

/** A relation's settings being chosen: what it links to and, for a table's rows, which table, and whether its links show there too. */
export interface RelationDraft {
  relation_target: string
  table_id?: string
  two_way?: boolean
}

export function relationDraftOf(f?: TableField): RelationDraft {
  if (!f) return { relation_target: "table" }
  const r = relationOf(f)
  return { relation_target: r.target, table_id: r.tableId }
}

/** Whether a relation's settings are complete: one linking to a table's rows needs the table. */
export function relationReady(d: RelationDraft): boolean {
  return d.relation_target !== "table" || !!d.table_id
}

export function RelationSettings({
  tableId,
  field,
  draft,
  onChange,
}: {
  tableId: string
  /** The field being changed; none for a new one. */
  field?: TableField
  draft: RelationDraft
  onChange: (d: RelationDraft) => void
}) {
  const id = React.useId()
  const made = field ? relationOf(field) : undefined
  // A link to a table's rows keeps its table: one to another is a new relation.
  const fixed = made?.target === "table"
  // Made without showing its links in that table: they can be, later.
  const oneWay = fixed && !made.inverseOf && !made.inverse
  const { data } = useFetch<{ data: DataTable[] }>(oneWay || (!fixed && draft.relation_target === "table") ? GetEndpointUrl.GetTables : "")
  const tables = data?.data ?? []
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  // Showing links in a table adds a column there: for those who can change it.
  const canChange = (t?: DataTable) => !!t && (!!self?.user_is_admin || t.created_by === self?.user_uuid)
  const here = tables.find((t) => t.id === tableId)
  const showIn = (t: DataTable | undefined, name: string) => (
    <>
      <label className="flex cursor-pointer items-start gap-2 text-2xs leading-snug text-muted-foreground">
        <input
          type="checkbox"
          checked={!!draft.two_way}
          disabled={!canChange(t)}
          onChange={(e) => onChange({ ...draft, two_way: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5"
        />
        <span>
          Also show these links in {name}
          {t && !canChange(t) ? " (only someone who can change it can add that)" : ""}
        </span>
      </label>
      {draft.two_way && t && here && t.id !== here.id && here.visibility === "private" && t.visibility !== "private" && (
        <p className="text-2xs leading-snug text-warning-ink">
          {here.name} is private, but everyone who can open {t.name} will see a column there named after it. Its rows and links stay hidden
          from them.
        </p>
      )}
    </>
  )
  if (fixed) {
    return (
      <div className="space-y-1">
        <p className={labelClass}>Links to</p>
        <p className="text-sm">Rows of {made.tableName ?? "a table you can't open"}</p>
        <p className="text-2xs leading-snug text-muted-foreground">
          {made.inverseOf ? "These are the links that table makes to this one. " : ""}
          {made.inverse ? `These links show in ${made.tableName ?? "that table"} too. ` : ""}To link to another table, add a new relation.
        </p>
        {oneWay && made.tableName && showIn(tables.find((t) => t.id === made.tableId), made.tableName)}
      </div>
    )
  }
  const chosen = tables.find((t) => t.id === draft.table_id)
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={`${id}-target`} className={labelClass}>
          Links to
        </label>
        <LinkSelect id={`${id}-target`} value={draft.relation_target} options={RELATION_TARGETS} onChange={(v) => onChange({ relation_target: v })} />
      </div>
      {draft.relation_target === "table" && (
        <>
          <LinkSelect
            label="Table"
            value={draft.table_id ?? ""}
            placeholder="Choose a table…"
            options={tables.map((t) => ({ value: t.id, label: t.id === tableId ? `${t.name} (this table)` : t.name }))}
            onChange={(v) => {
              const next = tables.find((t) => t.id === v)
              onChange({ ...draft, table_id: v || undefined, two_way: canChange(next) })
            }}
          />
          {draft.table_id && showIn(chosen, chosen?.name ?? "that table")}
        </>
      )}
    </div>
  )
}

/**
 * A rollup's settings being chosen: the relation it reads, the linked rows'
 * field it adds up (none to count the rows), and how: one of the ways, or a
 * formula over values (B2); and the conditions a linked row meets to count.
 */
export interface RollupDraft {
  relation: string
  field: string
  aggregate: RollupHow | ""
  formula?: string
  where?: RollupCondition[]
  /** A field of the linked rows that orders them before they're added up (a list follows it), desc each way, and how many of the first are added up. */
  sort?: string
  desc?: boolean
  limit?: number
}

/** The most linked rows a rollup adds up for a row, so the most of its first it can take (the server's maxRolledUp). */
const MAX_ROLLED_UP = 10_000

/** A rollup's condition as the server keeps it: a field of the linked rows, an operator and a value. */
export interface RollupCondition {
  field: string
  op: string
  value?: string
}

/** A rollup's draft from its field's settings: the ones rollupOf reads, and its formula and conditions. */
export function rollupDraftOf(f?: TableField): RollupDraft {
  const c = f ? parseFieldConfig(f) : {}
  const r = f ? rollupOf(f) : { relation: "", field: "", aggregate: "" as const }
  return {
    relation: r.relation,
    field: r.field,
    aggregate: r.aggregate,
    formula: typeof c.formula === "string" ? c.formula : undefined,
    where: Array.isArray(c.where) ? (c.where as RollupCondition[]) : undefined,
    sort: typeof c.sort === "string" && c.sort ? c.sort : undefined,
    desc: c.desc === true ? true : undefined,
    limit: typeof c.limit === "number" ? c.limit : undefined,
  }
}

/** Whether a rollup's settings are complete. */
export function rollupReady(d: RollupDraft): boolean {
  return !!d.relation && !!d.aggregate && (d.aggregate === "count" || !!d.field) && (d.aggregate !== "formula" || !!d.formula?.trim())
}

/** A rollup's settings as saved: a formula only for a formula, no empty conditions, a direction only with a sort, and the field's format kept. */
export function rollupConfigOf(d: RollupDraft, f?: TableField): Record<string, unknown> {
  const format = f ? parseFieldConfig(f).format : undefined
  const where = (d.where ?? []).filter((w) => w.field && w.op)
  return {
    relation: d.relation,
    field: d.field,
    aggregate: d.aggregate,
    ...(d.aggregate === "formula" ? { formula: d.formula } : {}),
    ...(where.length ? { where } : {}),
    ...(d.sort ? { sort: d.sort, ...(d.desc ? { desc: true } : {}) } : {}),
    ...(d.limit ? { limit: d.limit } : {}),
    ...(format ? { format } : {}),
  }
}

// The grid's filter menu's operators (lib/tables/viewRules), as the server's
// filters name them; "doesn't contain" has none there.
const SERVER_OP: Record<string, { op: string; value?: string }> = {
  is: { op: "eq" },
  is_not: { op: "ne" },
  contains: { op: "contains" },
  gt: { op: "gt" },
  lt: { op: "lt" },
  gte: { op: "gte" },
  lte: { op: "lte" },
  before: { op: "lt" },
  after: { op: "gt" },
  empty: { op: "empty" },
  not_empty: { op: "not_empty" },
  checked: { op: "eq", value: "true" },
  unchecked: { op: "ne", value: "true" },
}

/** The conditions a rollup may have on a kind of field: the filter menu's, those the server reads, each with its own key. */
function conditionOps(field?: TableField) {
  const kind = field ? filterKind(field) : "text"
  return OPS_FOR[kind]
    .filter((o) => SERVER_OP[o.op])
    .map((o) => ({ key: o.op, label: o.label, needsValue: o.needsValue, ...SERVER_OP[o.op] }))
}

/** Which of the menu's operators a stored condition is, for its field. */
function conditionKey(w: RollupCondition, field?: TableField): string {
  return conditionOps(field).find((o) => o.op === w.op && (o.value === undefined || o.value === w.value))?.key ?? ""
}

/** The rollup's conditions: only the linked rows that meet all of them are added up. */
function RollupConditions({ fields, where, onChange }: { fields: TableField[]; where: RollupCondition[]; onChange: (w: RollupCondition[]) => void }) {
  const set = (i: number, w: RollupCondition) => onChange(where.map((x, j) => (j === i ? w : x)))
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>Only rows where</p>
      {where.map((w, i) => {
        const field = fields.find((f) => f.id === w.field)
        const ops = conditionOps(field)
        const key = conditionKey(w, field)
        const needsValue = ops.find((o) => o.key === key)?.needsValue ?? true
        return (
          <div key={i} className="space-y-1 rounded-lg bg-sunken p-1" data-rollup-condition="">
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <LinkSelect
                  label="Condition's field"
                  value={w.field}
                  placeholder="Field"
                  options={fields.map((f) => ({ value: f.id, label: f.name }))}
                  onChange={(v) => {
                    const first = conditionOps(fields.find((f) => f.id === v))[0]
                    set(i, { field: v, op: first.op, value: first.value })
                  }}
                />
              </div>
              <div className="w-32 shrink-0">
                <LinkSelect
                  label="Condition"
                  value={key}
                  placeholder="is"
                  options={ops.map((o) => ({ value: o.key, label: o.label }))}
                  onChange={(v) => {
                    const o = ops.find((x) => x.key === v)!
                    set(i, { ...w, op: o.op, value: o.value ?? (o.needsValue ? w.value : undefined) })
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Remove the condition"
                data-touch-target=""
                onClick={() => onChange(where.filter((_, j) => j !== i))}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            {needsValue && conditionOps(field).find((o) => o.key === key)?.value === undefined ? (
              <input
                aria-label="Condition's value"
                placeholder="Value"
                value={w.value ?? ""}
                onChange={(e) => set(i, { ...w, value: e.target.value })}
                className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus:focus-halo"
              />
            ) : null}
          </div>
        )
      })}
      {where.length < 20 ? (
        <button
          type="button"
          data-touch-target=""
          onClick={() => {
            const first = conditionOps(fields[0])[0]
            onChange([...where, { field: fields[0]?.id ?? "", op: first.op, value: first.value }])
          }}
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-ui-sm font-medium text-ink-2 hover:bg-hover hover:text-ink"
        >
          <Plus className="size-3.5" aria-hidden />
          Add a condition
        </button>
      ) : null}
    </div>
  )
}

/** The linked rows in link order, until a field orders them. */
const LINK_ORDER = "link-order"

/** The order a rollup adds up its linked rows in, and how many of the first: Airtable's sorted rollups and first N (airtable-02). */
function RollupOrder({ fields, all, draft, onChange }: { fields: TableField[]; all: TableField[]; draft: RollupDraft; onChange: (d: RollupDraft) => void }) {
  const by = fields.find((f) => f.id === draft.sort)
  const words = sortWords(by)
  // A saved sort by a field since deleted, or one it can't sort by, shows as
  // one (never as Link order over it), so any other choice clears it (CR-77),
  // the reason first, since the select truncates a long name (DB-30).
  const kept = all.find((f) => f.id === draft.sort)
  const unusable = draft.sort && !by ? [{ value: draft.sort, label: kept ? `Can't sort by ${kept.name}` : "Can't sort by a deleted field", disabled: true }] : []
  return (
    <div className="space-y-1.5">
      <p className={labelClass}>Order</p>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <LinkSelect
            label="Sort the rows by"
            value={draft.sort || LINK_ORDER}
            options={[{ value: LINK_ORDER, label: "Link order" }, ...fields.map((f) => ({ value: f.id, label: f.name })), ...unusable]}
            onChange={(v) => onChange(v === LINK_ORDER ? { ...draft, sort: undefined, desc: undefined } : { ...draft, sort: v })}
          />
        </div>
        {by ? (
          <div className="w-32 shrink-0">
            <LinkSelect
              label="Direction"
              value={draft.desc ? "desc" : "asc"}
              options={[
                { value: "asc", label: words.asc },
                { value: "desc", label: words.desc },
              ]}
              onChange={(v) => onChange({ ...draft, desc: v === "desc" || undefined })}
            />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-ui text-ink-2">
        <span aria-hidden>Only the first</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_ROLLED_UP}
          step={1}
          aria-label="Only the first rows"
          placeholder="All"
          value={draft.limit ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value)
            // Not a whole number from 1 (or nothing): every row.
            onChange({ ...draft, limit: Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_ROLLED_UP) : undefined })
          }}
          className="h-8 w-20 rounded-lg bg-raised px-2.5 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus:focus-halo"
        />
        <span aria-hidden>rows</span>
      </div>
    </div>
  )
}

export function RollupSettings({ fields, draft, onChange }: { fields: TableField[]; draft: RollupDraft; onChange: (d: RollupDraft) => void }) {
  const id = React.useId()
  const relations = tableRelations(fields)
  const relation = relations.find((f) => f.id === draft.relation)
  const linkedTable = relation ? relationOf(relation).tableId : undefined
  // A table the reader can't open says so here, not in an error message.
  const { data, isLoading, isError } = useFetch<{ data: TableField[] }>(linkedTable ? tableFieldsKey(linkedTable) : "", undefined, undefined, {
    suppressErrorToast: true,
  } as never)
  const linkedFields = (data?.data ?? []).filter(canRollUp)
  const of = linkedFields.find((f) => f.id === draft.field)
  const options = rollupOptions(of ? filterKind(of) : null)
  if (relations.length === 0) {
    return (
      <p className="text-2xs leading-snug text-muted-foreground">
        A rollup adds up the rows a relation links to. Add a relation to a table&apos;s rows first.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={`${id}-relation`} className={labelClass}>
          Rows of
        </label>
        <LinkSelect
          id={`${id}-relation`}
          value={draft.relation}
          placeholder="Choose a relation…"
          options={relations.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(v) => onChange({ relation: v, field: "", aggregate: v ? "count" : "" })}
        />
      </div>
      {relation && isError && (
        <p className="text-2xs leading-snug text-muted-foreground">You can&apos;t open the table this relation links to, so it can&apos;t be added up here.</p>
      )}
      {relation && !isError && (
        <>
          <div className="space-y-1">
            <label htmlFor={`${id}-field`} className={labelClass}>
              Field
            </label>
            <LinkSelect
              id={`${id}-field`}
              value={isLoading ? "" : draft.field || JUST_THE_ROWS}
              placeholder="Loading…"
              disabled={isLoading}
              options={[{ value: JUST_THE_ROWS, label: "None: just the rows" }, ...linkedFields.map((f) => ({ value: f.id, label: f.name }))]}
              onChange={(v) => {
                const fieldId = v === JUST_THE_ROWS ? "" : v
                const next = linkedFields.find((f) => f.id === fieldId)
                onChange({ ...draft, field: fieldId, aggregate: rollupOptions(next ? filterKind(next) : null)[0] })
              }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-how`} className={labelClass}>
              Calculate
            </label>
            <LinkSelect id={`${id}-how`} value={draft.aggregate} options={options.map((how) => ({ value: how, label: ROLLUP_LABELS[how] }))} onChange={(v) => onChange({ ...draft, aggregate: v as RollupHow })} />
          </div>
          {draft.aggregate === "formula" && (
            <div className="space-y-1">
              <label htmlFor={`${id}-formula`} className={labelClass}>
                Formula
              </label>
              <input
                id={`${id}-formula`}
                value={draft.formula ?? ""}
                onChange={(e) => onChange({ ...draft, formula: e.target.value })}
                placeholder="SUM(values) * 1.18"
                spellCheck={false}
                className="h-8 w-full rounded-lg bg-raised px-2.5 font-mono text-ui text-ink shadow-e1 outline-none focus:focus-halo"
              />
              <p className="text-2xs leading-snug text-muted-foreground">values is the linked rows&apos; values, as a list: SUM(values), ARRAYJOIN(values, &quot;; &quot;).</p>
            </div>
          )}
          {!isLoading && <RollupConditions fields={(data?.data ?? []).filter((f) => !workedOutElsewhere(f))} where={draft.where ?? []} onChange={(where) => onChange({ ...draft, where })} />}
          {!isLoading && <RollupOrder fields={(data?.data ?? []).filter(canSortRollupBy)} all={data?.data ?? []} draft={draft} onChange={onChange} />}
        </>
      )}
    </div>
  )
}
