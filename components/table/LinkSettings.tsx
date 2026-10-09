"use client"

// Settings for fields that reach into another table:
//  - what a relation links to: OneCamp items, or a table's rows, with the
//    links shown in that table too, or not (and, for one made without, later);
//  - what a rollup adds up from the rows a relation links to.

import * as React from "react"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { relationOf, tableFieldsKey, type DataTable, type RollupHow, type TableField } from "@/services/tableService"
import { canRollUp, rollupOptions, ROLLUP_LABELS, tableRelations } from "@/lib/tables/links"
import { kindOfField } from "@/lib/tables/viewRules"

const selectClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
const labelClass = "text-xs font-medium text-muted-foreground"

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
        <p className="text-2xs leading-snug text-warning">
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
        <select
          id={`${id}-target`}
          value={draft.relation_target}
          onChange={(e) => onChange({ relation_target: e.target.value })}
          className={selectClass}
        >
          {RELATION_TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {draft.relation_target === "table" && (
        <>
          <select
            aria-label="Table"
            value={draft.table_id ?? ""}
            onChange={(e) => {
              const next = tables.find((t) => t.id === e.target.value)
              onChange({ ...draft, table_id: e.target.value || undefined, two_way: canChange(next) })
            }}
            className={selectClass}
          >
            <option value="">Choose a table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id === tableId ? `${t.name} (this table)` : t.name}
              </option>
            ))}
          </select>
          {draft.table_id && showIn(chosen, chosen?.name ?? "that table")}
        </>
      )}
    </div>
  )
}

/** A rollup's settings being chosen: the relation it reads, the linked rows' field it adds up (none to count the rows), and how. */
export interface RollupDraft {
  relation: string
  field: string
  aggregate: RollupHow | ""
}

/** Whether a rollup's settings are complete. */
export function rollupReady(d: RollupDraft): boolean {
  return !!d.relation && !!d.aggregate && (d.aggregate === "count" || !!d.field)
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
  const options = rollupOptions(of ? kindOfField(of) : null)
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
        <select
          id={`${id}-relation`}
          value={draft.relation}
          onChange={(e) => onChange({ relation: e.target.value, field: "", aggregate: e.target.value ? "count" : "" })}
          className={selectClass}
        >
          <option value="">Choose a relation…</option>
          {relations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
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
            <select
              id={`${id}-field`}
              value={draft.field}
              disabled={isLoading}
              onChange={(e) => {
                const next = linkedFields.find((f) => f.id === e.target.value)
                onChange({ ...draft, field: e.target.value, aggregate: rollupOptions(next ? kindOfField(next) : null)[0] })
              }}
              className={selectClass}
            >
              <option value="">{isLoading ? "Loading…" : "None: just the rows"}</option>
              {linkedFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-how`} className={labelClass}>
              Calculate
            </label>
            <select
              id={`${id}-how`}
              value={draft.aggregate}
              onChange={(e) => onChange({ ...draft, aggregate: e.target.value as RollupHow })}
              className={selectClass}
            >
              {options.map((how) => (
                <option key={how} value={how}>
                  {ROLLUP_LABELS[how]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}
