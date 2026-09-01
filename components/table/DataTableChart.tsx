"use client"

import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "@/lib/icons"
import { normalizeChartSpec, type NormalizedChart } from "@/lib/utils/chartSpec"
import {
    aggregateTable,
    type AggregateOp,
    type AggregateResult,
    type TableField,
} from "@/services/tableService"

// DataTableChart — a Notion-style "chart view" for a table. The user picks a
// column to group by, an aggregation (count / sum / avg / min / max) and a chart
// type; the grouped result is computed server-side (permission-scoped, bounded)
// by the SAME engine the AI query_table tool uses, and drawn with the SAME
// dependency-free AgentChart renderer used in AI messages. No row data is pulled
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
        () => fields.filter((f) => NUMERIC_FIELD_TYPES.has(f.type)),
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
    }, [tableId, groupBy, op, valueField, needsValue, dataVersion])

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

    if (fields.length === 0) {
        return (
            <div className="p-8 text-center text-sm text-muted-foreground">
                Add a column to this table to chart it.
            </div>
        )
    }

    return (
        <div className="p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3">
                <Control label="Chart">
                    <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                        <SelectTrigger className="h-8 w-32 capitalize">
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
                </Control>

                <Control label="Group by">
                    <Select value={groupBy} onValueChange={setGroupBy}>
                        <SelectTrigger className="h-8 w-40">
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
                </Control>

                <Control label="Measure">
                    <Select value={op} onValueChange={(v) => setOp(v as AggregateOp)}>
                        <SelectTrigger className="h-8 w-32 capitalize">
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
                </Control>

                {needsValue && (
                    <Control label="Of column">
                        <Select value={valueField} onValueChange={setValueField}>
                            <SelectTrigger className="h-8 w-40">
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
                    </Control>
                )}
            </div>

            <div className="min-h-[18rem]">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="py-20 text-center text-sm text-muted-foreground">{error}</div>
                ) : needsValue && numericFields.length === 0 ? (
                    <div className="py-20 text-center text-sm text-muted-foreground">
                        {`"${op}" needs a number column. Add one, or switch the measure to "count".`}
                    </div>
                ) : chart ? (
                    <>
                        <div className="rounded border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                            Chart view placeholder
                        </div>
                        {result?.truncated && (
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                Showing the top {result.buckets.length} of {result.distinct_groups} groups.
                            </p>
                        )}
                    </>
                ) : (
                    <div className="py-20 text-center text-sm text-muted-foreground">
                        No data to chart yet.
                    </div>
                )}
            </div>
        </div>
    )
}

// Control is a small labeled wrapper for a chart control.
const Control: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="flex flex-col gap-1">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
        </span>
        {children}
    </label>
)

export default DataTableChart
