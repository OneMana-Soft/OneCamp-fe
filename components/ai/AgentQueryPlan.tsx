"use client";

// AgentQueryPlan — renders the deterministic, inspectable query plan an agent
// ran to answer a data question (emitted as a ```queryplan block; see
// queryPlanSpec.ts + MarkdownMessage.tsx). It turns a raw JSON plan into a clean,
// Notion-style card so the answer is explainable AND steerable: the reader sees
// exactly which table, filters, grouping, metrics, group-filters (having),
// share-of-total, sort and limit produced the numbers — and, when the plan
// carries its table's uuid, can tweak the bounded knobs (filter values, having
// thresholds, limit, order) and RE-RUN it live against the same deterministic
// engine the agent used. Editing never changes the methodology (metrics /
// grouping / operators stay fixed), so a human steers the question and gets an
// identical-methodology answer, not a fresh guess.
//
// The structural view is presentational; the only side effect is the optional
// "Run" call, so it stays safe to render anywhere agent markdown renders.

import React from "react";
import {
    Database,
    Filter,
    Layers,
    Sigma,
    ArrowDownWideNarrow,
    Percent,
    Play,
    RotateCcw,
    Loader2,
    AlertTriangle,
    Table as TableIcon,
} from "@/lib/icons";
import {
    metricLabel,
    denormalizeQueryPlan,
    type NormalizedQueryPlan,
    type PlanFilterView,
    type PlanHavingView,
} from "@/lib/utils/queryPlanSpec";
import { runTableQueryPlan, type QueryPlanSpec } from "@/services/tableService";
import { runDataSourceQueryPlan, type DataSourceQueryPlan } from "@/services/dataSourceService";
import type { NormalizedChart } from "@/lib/utils/chartSpec";
import AgentChart from "@/components/ai/AgentChart";

// RenderablePlan is the common shape both re-run endpoints return (native tables
// and external data sources). matched_rows is optional because a data source
// reports truncation but not a scanned-row count.
type RenderablePlan = {
    group_by?: string;
    group_by_type?: string;
    metrics: string[];
    share_of?: string;
    buckets: { label: string; metrics: Record<string, number>; count: number; share_pct?: number }[];
    truncated: boolean;
    matched_rows?: number;
};

const OP_LABEL: Record<string, string> = {
    eq: "=",
    ne: "≠",
    contains: "contains",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    empty: "is empty",
    not_empty: "is not empty",
};

function opText(op: string): string {
    return OP_LABEL[op] || op;
}

// Ops that take no value — hide the value input for these.
const VALUELESS_OPS = new Set(["empty", "not_empty"]);

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 py-1">
            <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
            <span className="w-16 flex-shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground">{children}</span>
        </div>
    );
}

function Chip({ children }: { children: React.ReactNode }) {
    return (
        <span className="mr-1 mb-1 inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {children}
        </span>
    );
}

// A chip that wraps a small inline input, so an editable value reads like the
// static chips around it (Notion-style: the structure looks the same, the
// value is quietly typeable).
function EditableChip({
    children,
    editing,
}: {
    children: React.ReactNode;
    editing: boolean;
}) {
    return (
        <span
            className={
                "mr-1 mb-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-foreground " +
                (editing ? "border-primary/40 bg-primary/5" : "border-border/70 bg-muted/50")
            }
        >
            {children}
        </span>
    );
}

const inputCls =
    "min-w-[2ch] max-w-[16ch] rounded border border-border/60 bg-background px-1 py-px font-mono text-[11px] text-foreground outline-none focus:border-primary/60";

// buildPlanChart turns a PlanResult into a bounded NormalizedChart for the
// primary metric across groups (line for a date group-by, bar otherwise) — the
// same shape the agent's server-emitted ```chart block uses, so re-run results
// visualize identically. Returns null when there's no meaningful shape to draw.
function buildPlanChart(res: RenderablePlan, primaryMetric: string): NormalizedChart | null {
    if (!res.group_by || res.buckets.length < 2 || !primaryMetric) return null;
    const title = `${primaryMetric}${res.group_by ? ` by ${res.group_by}` : ""}`;
    return {
        type: res.group_by_type === "date" ? "line" : "bar",
        title,
        labels: res.buckets.map((b) => b.label),
        series: [
            {
                name: primaryMetric,
                values: res.buckets.map((b) => (Number.isFinite(b.metrics[primaryMetric]) ? b.metrics[primaryMetric] : 0)),
            },
        ],
    };
}

function trimNum(n: number): string {
    if (!Number.isFinite(n)) return "—";
    return parseFloat(n.toFixed(4)).toString();
}

export function AgentQueryPlan({ plan }: { plan: NormalizedQueryPlan }) {
    // A stable signature of the incoming plan: when it changes (e.g. a new
    // message, or a streamed block finally closing) we reset local edits so the
    // card always reflects what the agent actually ran.
    const signature = React.useMemo(() => JSON.stringify(plan), [plan]);

    // Editable knobs (bounded): filter values, having thresholds, limit, order.
    // Metrics / group-by / operators stay fixed so the methodology can't drift.
    const [filters, setFilters] = React.useState<PlanFilterView[]>(plan.filters);
    const [having, setHaving] = React.useState<PlanHavingView[]>(plan.having);
    const [limit, setLimit] = React.useState<number | undefined>(plan.limit);
    const [ascending, setAscending] = React.useState<boolean>(plan.ascending);

    const [running, setRunning] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<RenderablePlan | null>(null);

    React.useEffect(() => {
        setFilters(plan.filters);
        setHaving(plan.having);
        setLimit(plan.limit);
        setAscending(plan.ascending);
        setRunning(false);
        setError(null);
        setResult(null);
    }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

    const canRun = Boolean(plan.tableUuid || plan.dataSourceUuid);

    // Dirty = the reader changed a knob from what the agent ran.
    const dirty = React.useMemo(() => {
        return (
            JSON.stringify(filters) !== JSON.stringify(plan.filters) ||
            JSON.stringify(having) !== JSON.stringify(plan.having) ||
            limit !== plan.limit ||
            ascending !== plan.ascending
        );
    }, [filters, having, limit, ascending, plan]);

    const primaryMetric = React.useMemo(() => {
        if (plan.sortBy) return plan.sortBy;
        const first = plan.metrics[0];
        return first ? (first.label || (first.aggregate === "count" || !first.valueField ? first.aggregate : `${first.aggregate}_${first.valueField}`)) : "";
    }, [plan]);

    const run = React.useCallback(async () => {
        if (!plan.tableUuid && !plan.dataSourceUuid) return;
        setRunning(true);
        setError(null);
        try {
            // denormalize returns validated-but-generic string ops; the wire
            // shape narrows them to the FilterOp/AggregateOp unions (the values
            // are already constrained by normalization, so this cast is safe).
            const wire = denormalizeQueryPlan({ ...plan, filters, having, limit, ascending });
            let res: RenderablePlan;
            if (plan.dataSourceUuid) {
                // External data source: re-run against /data-sources/{id}/query-plan
                // (the wire carries `table` = schema.table for the source).
                res = await runDataSourceQueryPlan(plan.dataSourceUuid, wire as unknown as DataSourceQueryPlan);
            } else {
                res = await runTableQueryPlan(plan.tableUuid as string, wire as unknown as QueryPlanSpec);
            }
            setResult(res);
        } catch (e: unknown) {
            const msg =
                (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
                (e as Error)?.message ||
                "Could not run this plan.";
            setError(msg);
        } finally {
            setRunning(false);
        }
    }, [plan, filters, having, limit, ascending]);

    const reset = React.useCallback(() => {
        setFilters(plan.filters);
        setHaving(plan.having);
        setLimit(plan.limit);
        setAscending(plan.ascending);
        setError(null);
        setResult(null);
    }, [plan]);

    const chart = result ? buildPlanChart(result, primaryMetric) : null;

    return (
        <div className="my-1.5 overflow-hidden rounded-lg border border-border/70 bg-card/40">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span className="text-[12px] font-semibold text-foreground">Query plan</span>
                {plan.table ? <span className="truncate font-mono text-[11px] text-muted-foreground">{plan.table}</span> : null}
                <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                    deterministic
                </span>
            </div>

            <div className="px-3 py-1.5">
                {filters.length > 0 && (
                    <Row icon={<Filter className="h-3.5 w-3.5" />} label="Filter">
                        <span className="flex flex-wrap items-center">
                            {filters.map((f, i) => (
                                <EditableChip key={i} editing={canRun && !VALUELESS_OPS.has(f.op)}>
                                    {f.field} {opText(f.op)}
                                    {!VALUELESS_OPS.has(f.op) &&
                                        (canRun ? (
                                            <input
                                                aria-label={`Filter value for ${f.field}`}
                                                className={inputCls}
                                                value={f.value ?? ""}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setFilters((prev) => prev.map((pf, pi) => (pi === i ? { ...pf, value: v } : pf)));
                                                }}
                                            />
                                        ) : (
                                            f.value ? ` ${f.value}` : ""
                                        ))}
                                </EditableChip>
                            ))}
                        </span>
                    </Row>
                )}

                {plan.groupBy && (
                    <Row icon={<Layers className="h-3.5 w-3.5" />} label="Group by">
                        <Chip>{plan.groupBy}</Chip>
                    </Row>
                )}

                <Row icon={<Sigma className="h-3.5 w-3.5" />} label="Measure">
                    <span className="flex flex-wrap">
                        {plan.metrics.map((m, i) => (
                            <Chip key={i}>{metricLabel(m)}</Chip>
                        ))}
                    </span>
                </Row>

                {having.length > 0 && (
                    <Row icon={<Filter className="h-3.5 w-3.5" />} label="Keep">
                        <span className="flex flex-wrap items-center">
                            {having.map((h, i) => (
                                <EditableChip key={i} editing={canRun}>
                                    {h.metric} {opText(h.op)}{" "}
                                    {canRun ? (
                                        <input
                                            aria-label={`Threshold for ${h.metric}`}
                                            type="number"
                                            className={inputCls}
                                            value={Number.isFinite(h.value) ? h.value : 0}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setHaving((prev) => prev.map((ph, pi) => (pi === i ? { ...ph, value: Number.isFinite(v) ? v : 0 } : ph)));
                                            }}
                                        />
                                    ) : (
                                        h.value
                                    )}
                                </EditableChip>
                            ))}
                        </span>
                    </Row>
                )}

                {plan.shareOf && (
                    <Row icon={<Percent className="h-3.5 w-3.5" />} label="Share">
                        <span className="text-muted-foreground">% of total {plan.shareOf}</span>
                    </Row>
                )}

                <Row icon={<ArrowDownWideNarrow className="h-3.5 w-3.5" />} label="Order">
                    <span className="flex flex-wrap items-center gap-1 text-muted-foreground">
                        {plan.sortBy ? (
                            <>
                                by <span className="font-mono text-foreground">{plan.sortBy}</span>
                            </>
                        ) : null}
                        {canRun ? (
                            <button
                                type="button"
                                onClick={() => setAscending((a) => !a)}
                                className="rounded border border-border/60 bg-background px-1.5 py-px text-[11px] text-foreground hover:border-primary/60"
                            >
                                {ascending ? "ascending" : "descending"}
                            </button>
                        ) : (
                            <span>{ascending ? "ascending" : "descending"}</span>
                        )}
                        <span>· top</span>
                        {canRun ? (
                            <input
                                aria-label="Limit"
                                type="number"
                                min={1}
                                className={inputCls + " max-w-[7ch]"}
                                value={limit ?? ""}
                                placeholder="auto"
                                onChange={(e) => {
                                    const v = e.target.value.trim();
                                    if (v === "") return setLimit(undefined);
                                    const n = Math.floor(Number(v));
                                    setLimit(Number.isFinite(n) && n > 0 ? n : undefined);
                                }}
                            />
                        ) : (
                            <span className="font-mono text-foreground">{limit ?? "auto"}</span>
                        )}
                    </span>
                </Row>
            </div>

            {canRun && (
                <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-3 py-1.5">
                    <button
                        type="button"
                        onClick={run}
                        disabled={running}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                        {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {running ? "Running" : result ? "Re-run" : "Run plan"}
                    </button>
                    {dirty && !running && (
                        <button
                            type="button"
                            onClick={reset}
                            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Reset
                        </button>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                        {dirty ? "Edited — runs the same method, your inputs" : "Runs exactly what the agent ran"}
                    </span>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-2 border-t border-border/60 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {result && <PlanResultView res={result} chart={chart} primaryMetric={primaryMetric} />}
        </div>
    );
}

// PlanResultView renders a re-run's real numbers as a compact table (label +
// each metric + optional share%) plus the same inline SVG chart the agent uses.
function PlanResultView({
    res,
    chart,
    primaryMetric,
}: {
    res: RenderablePlan;
    chart: NormalizedChart | null;
    primaryMetric: string;
}) {
    return (
        <div className="border-t border-border/60 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <TableIcon className="h-3.5 w-3.5" />
                <span>
                    {res.matched_rows != null
                        ? `${res.matched_rows} matching row${res.matched_rows === 1 ? "" : "s"}`
                        : `${res.buckets.length} group${res.buckets.length === 1 ? "" : "s"}`}
                    {res.truncated ? " · partial results" : ""}
                </span>
            </div>

            {res.buckets.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No rows matched.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12px]">
                        <thead>
                            <tr className="border-b border-border/60 text-left text-muted-foreground">
                                <th className="py-1 pr-3 font-medium">{res.group_by || "Group"}</th>
                                {res.metrics.map((m) => (
                                    <th key={m} className="py-1 pr-3 text-right font-mono font-medium">
                                        {m}
                                    </th>
                                ))}
                                {res.share_of ? <th className="py-1 text-right font-medium">share</th> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {res.buckets.map((b, i) => (
                                <tr key={i} className="border-b border-border/30 last:border-0">
                                    <td className="py-1 pr-3 text-foreground">{b.label}</td>
                                    {res.metrics.map((m) => (
                                        <td
                                            key={m}
                                            className={
                                                "py-1 pr-3 text-right font-mono " +
                                                (m === primaryMetric ? "text-foreground" : "text-muted-foreground")
                                            }
                                        >
                                            {trimNum(b.metrics[m])}
                                        </td>
                                    ))}
                                    {res.share_of ? (
                                        <td className="py-1 text-right font-mono text-muted-foreground">
                                            {b.share_pct != null ? `${b.share_pct.toFixed(1)}%` : "—"}
                                        </td>
                                    ) : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {chart && <AgentChart chart={chart} className="mt-2" />}
        </div>
    );
}

export default AgentQueryPlan;
