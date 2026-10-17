"use client"

// Display's body (WorkToolbar's DisplayMenu, work.md W11): saved views, the
// layout, grouping, ordering, completed tasks and the row's properties. A
// chunk of its own, with the app's select (app/firstLoad.test.ts): a list's
// first screen draws only the Display button, and this loads as the pointer
// or the focus reaches it.

import * as React from "react"
import type { ColumnFiltersState, SortingState, Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { RowProp } from "@/components/task/GroupedTaskList"
import type { ListDisplay } from "@/components/task/WorkToolbar"
import { WorkSegmented } from "@/components/task/WorkTabs"
import { useProjectFields } from "@/hooks/useProjectFields"
import { useTaskViews } from "@/hooks/useTaskViews"
import { useToast } from "@/hooks/use-toast"
import { ArrowDown, ArrowUp, Bookmark } from "@/lib/icons"
import { GROUPINGS, type Grouping } from "@/lib/tasks/grouping"
import { sameView, taskViewScope, type TaskViewState } from "@/lib/tasks/views"
import { cn } from "@/lib/utils/helpers/cn"

const PROP_LABELS: Record<Exclude<RowProp, `field:${string}`>, string> = {
  priority: "Priority",
  labels: "Labels",
  due: "Due",
  assignee: "Assignee",
  estimate: "Estimate",
  project: "Project",
  badges: "Badges",
}

const ORDERINGS = [
  { value: "", label: "Manual" },
  { value: "task_due_date", label: "Due date" },
  { value: "task_start_date", label: "Start date" },
  { value: "task_created_at", label: "Created" },
]

/** Display's body (work.md W11): saved views, layout, grouping, ordering, completed, properties. */
export function DisplayMenuBody<TData>({
  projectId,
  table,
  grouping,
  onGrouping,
  props,
  allProps,
  onProps,
  showCompleted,
  onShowCompleted,
  layout,
  onLayout,
  onReset,
}: { projectId?: string; table: Table<TData> } & ListDisplay) {
  const scope = taskViewScope(projectId)
  const { views, save, busy } = useTaskViews(scope)
  const { toast } = useToast()
  const state = table.getState()
  const current: TaskViewState = { filters: state.columnFilters, sort: state.sorting, columns: state.columnVisibility }
  const active = views.find((v) => sameView(v.state, current))
  const [naming, setNaming] = React.useState<string | null>(null)
  const { fields } = useProjectFields(projectId)
  const fieldNames = Object.fromEntries(fields.map((f) => [f.id, f.name]))
  const shownProps = [...allProps, ...fields.map((f) => `field:${f.id}` as RowProp)]
  const sort = state.sorting[0]
  const apply = (v: TaskViewState) => {
    table.setColumnFilters((v.filters ?? []) as ColumnFiltersState)
    table.setSorting((v.sort ?? []) as SortingState)
    if (v.columns) table.setColumnVisibility(v.columns)
  }
  const groupings = GROUPINGS.filter((g) => (projectId ? g.value !== "project" : g.value !== "assignee"))
  return (
    <>
      {views.length > 0 && (
        <Section title="Views">
          <ul className="-mx-1 grid gap-px">
            {views.slice(0, 9).map((v, i) => (
              <li key={v.id}>
                <button type="button" onClick={() => apply(v.state)} className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-press">
                  <Bookmark className="size-3.5 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  {active?.id === v.id && <span aria-label="Showing" className="size-1.5 rounded-full bg-brand" />}
                  <span className="kbd">{i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {onLayout && layout && (
        <Section title="Layout">
          <WorkSegmented
            label="Layout"
            value={layout}
            onChange={onLayout}
            className="flex w-full"
            options={[
              { value: "list", label: "List" },
              { value: "kanban", label: "Board" },
              ...(projectId ? [{ value: "timeline" as const, label: "Timeline" }] : []),
            ]}
          />
        </Section>
      )}
      <Section title="Arrange">
        <Row label="Grouping">
          <MenuSelect value={grouping} onChange={(v) => onGrouping(v as Grouping)} options={groupings} label="Grouping" />
        </Row>
        <Row label="Ordering">
          <span className="flex items-center gap-1">
            <MenuSelect value={sort?.id ?? ""} onChange={(v) => table.setSorting(v ? [{ id: v, desc: !!sort?.desc }] : [])} options={ORDERINGS} label="Ordering" />
            {sort && (
              <button type="button" aria-label={sort.desc ? "Descending" : "Ascending"} title={sort.desc ? "Descending" : "Ascending"} onClick={() => table.setSorting([{ id: sort.id, desc: !sort.desc }])} className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-raised text-ink-2 shadow-e1 hover:text-foreground">
                {sort.desc ? <ArrowDown className="size-3.5" aria-hidden="true" /> : <ArrowUp className="size-3.5" aria-hidden="true" />}
              </button>
            )}
          </span>
        </Row>
        <Row label="Completed">
          <WorkSegmented
            label="Show completed"
            value={showCompleted}
            onChange={onShowCompleted}
            options={[
              { value: "all", label: "All" },
              { value: "week", label: "7 days" },
              { value: "none", label: "None" },
            ]}
          />
        </Row>
      </Section>
      <Section title="Properties">
        <div className="flex flex-wrap gap-1">
          {shownProps.map((p) => {
            const on = props.includes(p)
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => onProps(on ? props.filter((x) => x !== p) : [...props, p])}
                className={cn("h-7 rounded-md px-2 text-ui-sm font-[510] transition-colors", on ? "bg-raised text-foreground shadow-e1" : "text-ink-3 hover:text-ink-2")}
              >
                {p.startsWith("field:") ? fieldNames[p.slice(6)] ?? "Field" : PROP_LABELS[p as keyof typeof PROP_LABELS]}
              </button>
            )
          })}
        </div>
      </Section>
      <div className="-mx-3 mt-3 flex items-center justify-between border-t border-line px-2 pt-2">
        {naming === null ? (
          <Button variant="ghost" size="sm" onClick={() => setNaming("")}>
            Save as view…
          </Button>
        ) : (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault()
              const name = naming.trim()
              if (!name) return
              const v = await save(name, current)
              if (v) toast({ title: `Saved “${v.name}”` })
              setNaming(null)
            }}
          >
            <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} maxLength={60} aria-label="View name" placeholder="Name this view" className="field-surface h-7 min-w-0 flex-1 rounded-md px-2 text-ui-sm" />
            <Button type="submit" size="sm" variant="secondary" disabled={busy || !naming.trim()}>
              Save
            </Button>
          </form>
        )}
        {naming === null && (
          <Button variant="ghost" size="sm" className="text-ink-3" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-[510] text-ink-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[30px] items-center justify-between gap-2">
      <span className="text-ui-sm text-ink-2">{label}</span>
      {children}
    </div>
  )
}

/**
 * A choice inside the Display menu: the app's own select (a native one drew
 * the system's chevron and list), 28 px to match the rows' controls. Radix
 * takes no empty value, so "none" stands in for the option whose value is "".
 */
const NONE = "__none"
function MenuSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger dense aria-label={label} className="h-7 w-[128px] bg-raised text-ui-sm font-[510] text-foreground shadow-e1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value || NONE} value={o.value || NONE}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
