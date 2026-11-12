"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import SvgChart from "@/components/charts/SvgChart"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { TableToolbar, TableViewState, TABLE_VIEW_BODY, TABLE_VIEW_INSET } from "@/components/table/TableViewFrame"
import { normalizeChartSpec, type NormalizedChart } from "@/lib/utils/chartSpec"
import { aggregateTable, isNumeric, queryRows, type AggregateOp, type TableField, type TableRow } from "@/services/tableService"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { partialNote } from "@/lib/tables/chartNote"
import { unprocessableReason, workingOutOf, type WorkingOut } from "@/lib/tables/unprocessable"
import { CHART_BARS, CHART_OPS, CHART_TYPES, chartBars, chartSpec, measureWords, readChartLook, type ChartLook, type ChartRules, type ChartType } from "@/lib/tables/chartLook"
import type { RowQueryAnswers } from "@/lib/tables/query"
import type { ViewRules } from "@/lib/tables/viewRules"

// DataTableChart: a table's chart view (TABLES-BOARDS-11). Its numbers are the
// view's: the grid's own query (POST /tables/{id}/query) with the view's
// filter, its rows grouped by the chart's field and the measure as each
// group's summary (lib/tables/chartLook), so it counts only what its reader
// may read, as the grid does. A filter the server can't take yet falls back
// to /aggregate over every row (the engine the AI's query_table uses), and
// says so. Only the groups come to the browser, never the rows. Its look
// (kind, grouping, measure) is the view's (display.chart): everyone who opens
// the view sees the same chart, and a change is the reader's own until they
// save the view. Drawn with the app's one SvgChart, in its hue order.

const TYPE_WORDS: Record<ChartType, string> = { bar: "Bar", line: "Line", area: "Area", pie: "Pie" }
const OP_WORDS: Record<AggregateOp, string> = { count: "Count of rows", sum: "Sum", avg: "Average", min: "Lowest", max: "Highest" }
// The server is still working out a formula or a rollup the chart reads: it asks again after this long.
const WORKING_AGAIN_MS = 3000
// A count past the server's budget (business/RowQuery SummaryBudget, V-48) answers without its groups: said, with Try again.
const LEFT_OUT = "Grouped this way, the rows take too long to count right now. Try again in a moment, or filter the view to fewer rows."

interface DataTableChartProps {
    tableId: string
    fields: TableField[]
    /** The view's rules: the chart counts the rows its filter keeps. */
    rules: ViewRules
    /** What the table's cell index answers (the bundle's row_query): the chart asks the server only that. */
    answers?: RowQueryAnswers | null
    /** The grid's own query and the grouped list's group names, from the page (chartLook ChartRules); null while they load. */
    using: ChartRules | null
    /** The look the view keeps (display.chart), and its change; without onLook the chart keeps its own. */
    look?: unknown
    onLook?: (look: ChartLook) => void
    /** Clears the view's filters, from "No rows match". */
    onClear?: () => void
    /** The rows the page holds and their count: when a row is added, changed or deleted, the chart reads its numbers again. */
    rows?: TableRow[]
    total?: number | null
}

// The look this browser kept before views kept it: read once, then forgotten.
const oldKey = (tableId: string) => `onecamp:tableChart:${tableId}`
function takeOldLook(tableId: string): unknown {
    try {
        const raw = window.localStorage.getItem(oldKey(tableId))
        if (!raw) return null
        window.localStorage.removeItem(oldKey(tableId))
        const old = JSON.parse(raw) as { chartType?: unknown; groupBy?: unknown; op?: unknown; valueField?: unknown }
        return { type: old.chartType, groupBy: old.groupBy, op: old.op, valueField: old.valueField }
    } catch {
        return null
    }
}

/** What the chart drew from: its bars, the notes on them, and whether they are every row's (a filter the server can't take). */
interface Drawn {
    labels: string[]
    values: number[]
    note: string | null
    everyRow: boolean
}

/** Why a read gave nothing to draw: a failure (Try again), the server's refusal in its words, or a fill it's still working out. */
type Failed = { kind: "failed"; why?: string } | { kind: "refused"; why: string } | { kind: "working"; working: WorkingOut }

export function DataTableChart({ tableId, fields, rules, answers, using, look: kept, onLook, onClear, rows, total }: DataTableChartProps) {
    const numericFields = React.useMemo(() => fields.filter(isNumeric), [fields])
    // The view's look when the page keeps it (onLook); a chart on its own keeps its choices itself.
    const [own, setOwn] = React.useState<unknown>(null)
    const controlled = !!onLook
    const look = React.useMemo(() => readChartLook(controlled ? kept : own, fields), [controlled, kept, own, fields])
    React.useEffect(() => {
        // Once, as the chart opens: a look this browser kept moves into a view that keeps none.
        const old = takeOldLook(tableId)
        if (old == null || kept != null) return
        if (onLook) onLook(readChartLook(old, fields))
        else setOwn(old)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the chart opens
    }, [])
    const change = (patch: Partial<ChartLook>) => {
        const next = { ...look, ...patch }
        if (onLook) onLook(next)
        else setOwn(next)
    }
    const { type: chartType, groupBy, op, valueField } = look
    const needsValue = op !== "count"
    const filtered = rules.filters.length > 0

    const [drawn, setDrawn] = React.useState<Drawn | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [failed, setFailed] = React.useState<Failed | null>(null)
    // The last numbers, kept while the browser is offline.
    const [stale, setStale] = React.useState(false)
    // Try again (and a fill still being worked out) reads again.
    const [attempt, setAttempt] = React.useState(0)

    const ruleKey = JSON.stringify(rules)
    // The rows' cheap signature: their count and their latest change.
    const dataVersion = React.useMemo(() => {
        let latest = ""
        for (const r of rows ?? []) if (r.updated_at > latest) latest = r.updated_at
        return `${total ?? rows?.length ?? 0}:${latest}`
    }, [rows, total])
    React.useEffect(() => {
        if (!groupBy) return
        if (needsValue && !valueField) return
        let cancelled = false
        let again: ReturnType<typeof setTimeout> | undefined
        const stop = new AbortController()
        if (!using) return
        const spec = chartSpec(using, rules, look, fields, answers)
        setLoading(true)
        const read: Promise<Drawn | null> = spec
            ? queryRows(tableId, { spec, n: 1, count: true }, stop.signal).then((w) => {
                  // A view of no rows has no groups; a count that left them out isn't an answer.
                  if (!w.groups && w.total !== 0) throw new Error(LEFT_OUT)
                  const bars = chartBars(using, w.groups ?? [], look, fields)
                  const rest = bars.others
                  const note = rest === 0 ? null : bars.labels.length > CHART_BARS ? `The top ${CHART_BARS} groups, and the other ${rest} as Other.` : `Showing the top ${CHART_BARS} of ${CHART_BARS + rest} groups.`
                  return { labels: bars.labels, values: bars.values, note, everyRow: false }
              })
            : aggregateTable(tableId, { group_by: groupBy, aggregate: op, value_field: needsValue ? valueField : undefined, limit: CHART_BARS }, OWN_ERRORS).then((r) =>
                  // An answer without its buckets is a failure, never a table with nothing to chart.
                  Array.isArray(r?.buckets)
                      ? { labels: r.buckets.map((b) => b.label), values: r.buckets.map((b) => b.value), note: partialNote(r), everyRow: filtered }
                      : null,
              )
        read
            .then((d) => {
                if (cancelled) return
                setStale(false)
                setFailed(d ? null : { kind: "failed" })
                if (d) setDrawn(d)
            })
            .catch((e) => {
                if (cancelled) return
                const working = workingOutOf(e)
                const why = working ? undefined : unprocessableReason(e)
                // Offline: the numbers drawn stay, said to be the last ones (with none, the failure says it).
                const offline = !working && !why && typeof navigator !== "undefined" && !navigator.onLine
                setStale(offline)
                setFailed(offline ? null : working ? { kind: "working", working } : why ? { kind: "refused", why } : { kind: "failed", why: e instanceof Error && e.message === LEFT_OUT ? LEFT_OUT : undefined })
                if (working) again = setTimeout(() => setAttempt((n) => n + 1), WORKING_AGAIN_MS)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
            stop.abort()
            clearTimeout(again)
        }
        // dataVersion reads the numbers again when the table's rows change; rules by what they hold.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- look by its parts, rules by ruleKey
    }, [tableId, groupBy, op, valueField, needsValue, ruleKey, answers?.indexed, answers?.sorts_text, dataVersion, attempt, fields, using])

    const groupField = fields.find((f) => f.id === groupBy)
    const measure = measureWords(op, fields.find((f) => f.id === valueField))
    const chart: NormalizedChart | null = React.useMemo(() => {
        if (!drawn || drawn.labels.length === 0) return null
        return normalizeChartSpec({
            type: chartType,
            // What it counts, over what: its caption, and its picture's name to a screen reader.
            title: groupField ? `${measure} by ${groupField.name}` : measure,
            labels: drawn.labels,
            series: [{ name: measure, values: drawn.values }],
        })
    }, [drawn, chartType, measure, groupField])
    // The drawing's box, as state: the bar values' layer measures in it once it is in the page.
    const [drawing, setDrawing] = React.useState<HTMLDivElement | null>(null)

    if (fields.length === 0) {
        return (
            <>
                <TableToolbar />
                <EmptyState className="py-10" headingLevel={3} title="Nothing to chart yet" description="Add a field to this table to chart it." />
            </>
        )
    }

    const notes = [
        drawn?.everyRow ? "Showing every row: this view's filters can't apply to a chart yet." : null,
        drawn?.note ?? null,
        stale ? "Offline · showing the last numbers" : null,
    ].filter((n): n is string => !!n)
    // At the toolbar's height, with a finger's 44px under touch (app/phone.css F3); a phone opens each as a sheet.
    const trigger = "h-7 w-auto min-w-0 gap-1.5 px-2 text-meta"
    return (
        <>
            {/* The chart's choices: a row under the view's rules, at the toolbar's height. */}
            <TableToolbar>
                <Select value={chartType} onValueChange={(v) => change({ type: v as ChartType })}>
                    <SelectTrigger dense data-touch-target="" className={trigger} aria-label="Chart">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHART_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                                {TYPE_WORDS[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={groupBy} onValueChange={(v) => change({ groupBy: v })}>
                    <SelectTrigger dense data-touch-target="" className={trigger} aria-label="Group by">
                        <span className="text-ink-3">Group by</span>
                        <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                                {f.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={op} onValueChange={(v) => change({ op: v as AggregateOp })}>
                    <SelectTrigger dense data-touch-target="" className={trigger} aria-label="Measure">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHART_OPS.map((o) => (
                            <SelectItem key={o} value={o}>
                                {OP_WORDS[o]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {needsValue && (
                    <Select value={valueField} onValueChange={(v) => change({ valueField: v })}>
                        <SelectTrigger dense data-touch-target="" className={trigger} aria-label="Of field">
                            <span className="text-ink-3">of</span>
                            <SelectValue placeholder="Number field" />
                        </SelectTrigger>
                        <SelectContent>
                            {numericFields.length === 0 ? (
                                <div className="px-2 py-1.5 text-meta text-ink-3">No number fields</div>
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
                    {needsValue && numericFields.length === 0 ? (
                        <EmptyState className="py-10" headingLevel={3} title={`${OP_WORDS[op]} needs a number field`} description="Add one, or switch the measure to Count of rows." />
                    ) : failed?.kind === "working" ? (
                        <TableViewState kind="working" words={failed.working.words} done={failed.working.done} total={failed.working.total} />
                    ) : failed?.kind === "refused" ? (
                        <TableViewState kind="refused" why={failed.why} />
                    ) : failed?.why ? (
                        <ErrorState compact subject="this chart" detail={failed.why} onRetry={() => setAttempt((n) => n + 1)} retrying={loading} />
                    ) : failed || (stale && !drawn) ? (
                        // A failed read, or an answer with nothing to draw from: the shared state, with Try again.
                        <LoadFailureState kind="failed" noun="chart" onRetry={() => setAttempt((n) => n + 1)} retrying={loading} />
                    ) : loading && !drawn ? (
                        <ChartSkeleton />
                    ) : chart ? (
                        <div ref={setDrawing} aria-busy={loading || undefined}>
                            {/* In the app's one chart order, as every chart is; on the frame's ground, without a second border. */}
                            <SvgChart chart={chart} className="my-0" />
                            <BarValues host={drawing} values={chart.series[0]?.values ?? []} />
                            {notes.map((n) => (
                                <p key={n} role="status" className="mt-2 text-center text-meta text-ink-3">
                                    {n}
                                </p>
                            ))}
                        </div>
                    ) : drawn && filtered && !drawn.everyRow ? (
                        <TableViewState kind="no-match" onClear={onClear ?? (() => {})} />
                    ) : drawn ? (
                        <TableViewState kind="nothing-to-chart" hue={hueFor(tableId)} />
                    ) : (
                        <ChartSkeleton />
                    )}
                </div>
            </div>
        </>
    )
}

/** A chart's shape while it is worked out: an axis and bars, where a spinner sat alone in the box. */
function ChartSkeleton() {
    return (
        <div role="status" aria-label="Building the chart" className="flex h-[18rem] items-end gap-6 px-6 pb-px">
            {[62, 88, 45, 70, 30].map((h, i) => (
                <Skeleton key={i} className="w-full max-w-12 rounded-b-none" style={{ height: `${h}%` }} />
            ))}
        </div>
    )
}

// A band holds a bar's number (about four characters) from this many pixels.
const VALUE_ROOM = 26
interface BarMark {
    x: number
    y: number
    text: string
    /** False while its bar still grows in (SvgChart's first reveal of a chart): the value waits to land with it. */
    landed: boolean
}

/**
 * A bar's grow still to run: its own CSS animation (SvgChart's chart-bar-grow, after the bar's stagger) not done yet, as the
 * browser runs it, so a value keeps its bar's time and never a copy of it. A hover's fill change is a transition, not a grow.
 */
function growing(bar: Element): Animation[] {
    return typeof bar.getAnimations === "function" ? bar.getAnimations().filter((a) => "animationName" in a && a.playState === "running") : []
}

/**
 * Each bar's value over it (under it, below zero), for the eye: the bar's name already says it to a screen reader.
 * Drawn from the table chart's own chunk over the app's one SvgChart, which chat, reports and dashboards share and
 * which stays as it is: from what it writes already, each band's target (its slot), each bar's box and its name,
 * whose number is the chart's own words for it ("Sum of Amount · Q4: 1.2k").
 */
function barMarks(svg: SVGSVGElement, values: number[], grows: Animation[]): BarMark[] {
    const marks: BarMark[] = []
    svg.querySelectorAll<SVGGElement>("g[data-bar-group]").forEach((group) => {
        const i = Number(group.getAttribute("data-bar-group"))
        const band = svg.querySelector(`rect[data-band-target="${i}"]`)
        const bar = group.querySelector<SVGGraphicsElement>("path[data-bar]")
        const room = Number(band?.getAttribute("width"))
        if (!band || !bar || !(room >= VALUE_ROOM)) return
        const box = bar.getBBox()
        const name = bar.getAttribute("aria-label") ?? ""
        const grow = growing(bar)
        grows.push(...grow)
        marks.push({
            x: Number(band.getAttribute("x")) + room / 2,
            y: (values[i] ?? 0) < 0 ? box.y + box.height + 14 : box.y - 6,
            text: name.slice(name.lastIndexOf(": ") + 2),
            landed: grow.length === 0,
        })
    })
    return marks
}

/**
 * Writes barMarks into the chart drawn inside `host`, and again whenever its bars are drawn anew (a resize, new numbers). On a
 * chart's first reveal each value lands with its bar: unseen while the bar grows, faded in as its grow ends; with no grow (a
 * chart seen before this session, or reduced motion) it is there at once.
 */
function BarValues({ host, values }: { host: HTMLDivElement | null; values: number[] }) {
    const [drawn, setDrawn] = React.useState<{ svg: SVGSVGElement; marks: BarMark[]; key: string } | null>(null)
    React.useLayoutEffect(() => {
        if (!host) return
        let frame = 0
        let live = true
        const again = () => {
            if (live && !frame) frame = requestAnimationFrame(measure)
        }
        // Each grow is waited on once: measured again as it ends, or is cut short.
        const waited = new WeakSet<Animation>()
        const measure = () => {
            frame = 0
            const bar = host.querySelector<SVGGraphicsElement>("path[data-bar]")
            const svg = bar?.closest("svg")
            const grows: Animation[] = []
            const marks = bar && svg && typeof bar.getBBox === "function" ? barMarks(svg, values, grows) : []
            for (const g of grows) {
                if (waited.has(g)) continue
                waited.add(g)
                g.finished.then(again, again)
            }
            const key = JSON.stringify(marks)
            setDrawn((was) => (svg && marks.length ? (was?.svg === svg && was.key === key ? was : { svg, marks, key }) : null))
        }
        measure()
        // SvgChart learns its width after it mounts, and redraws on every resize: follow its bars, once a frame; and its
        // first reveal gives a bar the grow class a render after it is drawn.
        const watch = new MutationObserver(again)
        watch.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["d", "width", "aria-label", "class"] })
        return () => {
            live = false
            watch.disconnect()
            cancelAnimationFrame(frame)
        }
    }, [host, values])
    if (!drawn) return null
    return createPortal(
        drawn.marks.map((m, i) => (
            // Unseen at once while its bar grows; faded in, in the app's own time for it, as the bar lands.
            <text
                key={i}
                data-bar-value=""
                x={m.x}
                y={m.y}
                textAnchor="middle"
                fontSize={11}
                className={cn("fill-ink-2 tabular-nums", m.landed && "transition-opacity")}
                style={m.landed ? undefined : { opacity: 0 }}
                aria-hidden="true"
            >
                {m.text}
            </text>
        )),
        drawn.svg,
    )
}
