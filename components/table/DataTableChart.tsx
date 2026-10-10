"use client"

import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import SvgChart from "@/components/charts/SvgChart"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { TableToolbar, TableViewState, TABLE_VIEW_BODY, TABLE_VIEW_INSET } from "@/components/table/TableViewFrame"
import { normalizeChartSpec, type NormalizedChart } from "@/lib/utils/chartSpec"
import { aggregateTable, type AggregateOp, type AggregateResult, type TableField, isComputed, computedOf } from "@/services/tableService"
import { partialNote } from "@/lib/tables/chartNote"

// DataTableChart — a Notion-style "chart view" for a table. The user picks a
// column to group by, an aggregation (count / sum / avg / min / max) and a chart
// type; the grouped result is computed server-side (permission-scoped, bounded)
// by the SAME engine the AI query_table tool uses, and drawn with the SAME
// dependency-free SvgChart renderer used in AI messages. No row data is pulled
// to the client — only the aggregated buckets — so it stays fast on big tables.

const CHART_TYPES = ["bar", "line", "area", "pie"] as const
type ChartType = (typeof CHART_TYPES)[number]

const AGG_OPS: AggregateOp[] = ["count", "sum", "avg", "min", "max"]

// Types whose cells are numeric enough to sum/average.
const NUMERIC_FIELD_TYPES = new Set(["number"])

interface DataTableChartProps {
    tableId: string
    fields: TableField[]
    // A value that changes whenever the table's rows change (add/edit/delete),
    // so the chart re-aggregates and stays live instead of going stale. The
    // parent derives it from the bundle it already revalidates over MQTT.
    dataVersion?: string
}

// Persisted (per-table) chart config so the view is remembered across tab
// switches and reloads — a table's chart is a standing view, not a throwaway.
interface ChartConfig {
    chartType: ChartType
    groupBy: string
    op: AggregateOp
    valueField: string
}

const configKey = (tableId: string) => `onecamp:tableChart:${tableId}`

// loadConfig reads the saved config, VALIDATING that any referenced column
// still exists (a column may have been deleted since it was saved) and falling
// back to sensible defaults otherwise. Never throws; SSR-safe.
function loadConfig(tableId: string, fields: TableField[], numericFields: TableField[]): ChartConfig {
    const fallback: ChartConfig = {
        chartType: "bar",
        groupBy: fields[0]?.id ?? "",
        op: "count",
        valueField: numericFields[0]?.id ?? "",
    }
    if (typeof window === "undefined") return fallback
    try {
        const raw = window.localStorage.getItem(configKey(tableId))
        if (!raw) return fallback
        const saved = JSON.parse(raw) as Partial<ChartConfig>
        const fieldIds = new Set(fields.map((f) => f.id))
        const numericIds = new Set(numericFields.map((f) => f.id))
        return {
            chartType: CHART_TYPES.includes(saved.chartType as ChartType)
                ? (saved.chartType as ChartType)
                : fallback.chartType,
            groupBy: saved.groupBy && fieldIds.has(saved.groupBy) ? saved.groupBy : fallback.groupBy,
            op: AGG_OPS.includes(saved.op as AggregateOp) ? (saved.op as AggregateOp) : fallback.op,
            valueField:
                saved.valueField && numericIds.has(saved.valueField)
                    ? saved.valueField
                    : fallback.valueField,
        }
    } catch {
        return fallback
    }
}

export function DataTableChart({ tableId, fields, dataVersion }: DataTableChartProps) {
    const numericFields = React.useMemo(
        // A formula or a rollup that gives a number adds up like a number field.
        () => fields.filter((f) => NUMERIC_FIELD_TYPES.has(f.type) || (isComputed(f) && computedOf(f).result === "number")),
        [fields],
    )

    const initial = React.useMemo(
        () => loadConfig(tableId, fields, numericFields),
        // Only compute once per table/field-set; user edits drive state afterward.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tableId],
    )

    const [chartType, setChartType] = React.useState<ChartType>(initial.chartType)
    const [groupBy, setGroupBy] = React.useState<string>(initial.groupBy)
    const [op, setOp] = React.useState<AggregateOp>(initial.op)
    const [valueField, setValueField] = React.useState<string>(initial.valueField)

    // Persist the config whenever it changes so the chart is remembered.
    React.useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const cfg: ChartConfig = { chartType, groupBy, op, valueField }
            window.localStorage.setItem(configKey(tableId), JSON.stringify(cfg))
        } catch {
            // ignore quota / privacy-mode errors — persistence is best-effort.
        }
    }, [tableId, chartType, groupBy, op, valueField])
    const [result, setResult] = React.useState<AggregateResult | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState("")
    // Try again re-runs the same aggregation.
    const [attempt, setAttempt] = React.useState(0)

    const needsValue = op !== "count"

    React.useEffect(() => {
        if (!groupBy) return
        if (needsValue && !valueField) return
        let cancelled = false
        setLoading(true)
        setError("")
        aggregateTable(tableId, {
            group_by: groupBy,
            aggregate: op,
            value_field: needsValue ? valueField : undefined,
            limit: 50,
        })
            .then((r) => {
                if (!cancelled) setResult(r)
            })
            .catch(() => {
                if (!cancelled) setError("Couldn't build that chart. Try a different column.")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // dataVersion re-runs the aggregation when the table's rows change.
    }, [tableId, groupBy, op, valueField, needsValue, dataVersion, attempt])

    const chart: NormalizedChart | null = React.useMemo(() => {
        if (!result || result.buckets.length === 0) return null
        const metric =
            op === "count" ? "count" : `${op}${result.value_field ? ` of ${result.value_field}` : ""}`
        return normalizeChartSpec({
            type: chartType,
            title: "",
            labels: result.buckets.map((b) => b.label),
            series: [{ name: metric, values: result.buckets.map((b) => b.value) }],
        })
    }, [result, chartType, op])
    const note = result ? partialNote(result) : null

    if (fields.length === 0) {
        return (
            <>
                <TableToolbar />
                <EmptyState className="py-10" headingLevel={3} title="Nothing to chart yet" description="Add a column to this table to chart it." />
            </>
        )
    }

    const trigger = "h-7 w-auto min-w-0 gap-1.5 px-2 text-xs"
    return (
        <>
            {/* The chart's choices sit in the toolbar row every view of the
                table has, at its height: they were labelled selects in a row
                of their own, about 52px, where the other views had Sort and
                Filter. Each keeps its name, inside the control. */}
            <TableToolbar>
                <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                    <SelectTrigger dense className={cn(trigger, "capitalize")} aria-label="Chart">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHART_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">
                                {t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={groupBy} onValueChange={setGroupBy}>
                    <SelectTrigger dense className={trigger} aria-label="Group by">
                        <span className="text-muted-foreground">Group by</span>
                        <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={op} onValueChange={(v) => setOp(v as AggregateOp)}>
                    <SelectTrigger dense className={cn(trigger, "capitalize")} aria-label="Measure">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {AGG_OPS.map((o) => (
                            <SelectItem key={o} value={o} className="capitalize">
                                {o}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {needsValue && (
                    <Select value={valueField} onValueChange={setValueField}>
                        <SelectTrigger dense className={trigger} aria-label="Of column">
                            <span className="text-muted-foreground">of</span>
                            <SelectValue placeholder="Number column" />
                        </SelectTrigger>
                        <SelectContent>
                            {numericFields.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                    No number columns
                                </div>
                            ) : (
                                numericFields.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name}
                                    </SelectItem>
                                ))
                            )}
                        </SelectContent>
                    </Select>
                )}
            </TableToolbar>

            <div className={cn(TABLE_VIEW_BODY, TABLE_VIEW_INSET)} data-table-chart="">
                <div className="min-h-[18rem]">
                    {loading ? (
                        <ChartSkeleton />
                    ) : error ? (
                        <ErrorState subject="this chart" onRetry={() => setAttempt((n) => n + 1)} className="py-10" />
                    ) : needsValue && numericFields.length === 0 ? (
                        <EmptyState
                            className="py-10"
                            headingLevel={3}
                            title={`"${op}" needs a number column`}
                            description="Add one, or switch the measure to count."
                        />
                    ) : chart ? (
                        <>
                            {/* In the app's one chart order, as every chart is; on
                                the frame's ground, without a second border. */}
                            <SvgChart chart={chart} className="my-0 border-0 p-0" />
                            {note && <p className="mt-2 text-center text-xs text-muted-foreground">{note}</p>}
                        </>
                    ) : (
                        <TableViewState kind="nothing-to-chart" hue={hueFor(tableId)} />
                    )}
                </div>
            </div>
        </>
    )
}

/** A chart's shape while it is worked out: an axis and bars, where a spinner sat alone in the box. */
function ChartSkeleton() {
    return (
        <div role="status" aria-label="Building the chart" className="flex h-[18rem] items-end gap-6 border-b border-l border-border/60 px-6 pb-px">
            {[62, 88, 45, 70, 30].map((h, i) => (
                <Skeleton key={i} className="w-full max-w-12 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
        </div>
    )
}
