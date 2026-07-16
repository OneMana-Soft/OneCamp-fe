// queryPlanSpec.ts — pure, dependency-free parsing/normalization for the agent
// "query plan" block. When an agent answers a data question with the deterministic
// query_plan tool, it emits a fenced ```queryplan code block whose body is the
// JSON { table, plan } that produced the answer. MarkdownMessage detects that
// fence, runs the body through normalizeQueryPlan, and renders it as a clean,
// inspectable "Query plan" card (see AgentQueryPlan.tsx) — so the answer is
// explainable and reproducible, not a raw JSON blob.
//
// UI-free and total: never throws, returns null for anything it can't turn into
// a safe, bounded plan (so a malformed/streaming block falls back to a plain
// code block). Every dimension is hard-capped so a hostile/huge spec can't blow
// up the DOM.

export interface PlanMetricView {
    /** count | sum | avg | min | max */
    aggregate: string;
    valueField?: string;
    label?: string;
}

export interface PlanFilterView {
    field: string;
    op: string;
    value?: string;
}

export interface PlanHavingView {
    metric: string;
    op: string;
    value: number;
}

/** A validated, bounded, render-ready query plan. */
export interface NormalizedQueryPlan {
    table?: string;
    /** The table's uuid, when the emitting tool included it — lets the card
     * re-run an edited plan against the SAME table via /tables/{id}/query-plan. */
    tableUuid?: string;
    /** The external data source's uuid, when the plan came from a data source.
     * Present INSTEAD of tableUuid; makes the card re-run via
     * /data-sources/{id}/query-plan. Mutually exclusive with tableUuid. */
    dataSourceUuid?: string;
    /** For a data-source plan, the schema.table being queried — carried in the
     * plan body and echoed back on re-run (native tables identify by uuid). */
    sourceTable?: string;
    groupBy?: string;
    metrics: PlanMetricView[];
    filters: PlanFilterView[];
    having: PlanHavingView[];
    shareOf?: string;
    sortBy?: string;
    ascending: boolean;
    limit?: number;
}

// Hard caps mirroring the backend engine (maxPlanMetrics=10, maxFilters=25).
const MAX_METRICS = 10;
const MAX_FILTERS = 25;
const MAX_HAVING = 25;
const MAX_STR = 80;

const AGG_OPS: ReadonlySet<string> = new Set(["count", "sum", "avg", "min", "max"]);

function clampString(v: unknown, max = MAX_STR): string {
    if (typeof v !== "string") return "";
    const t = v.trim();
    return t.length > max ? t.slice(0, max) : t;
}

function toFiniteNumber(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}

/**
 * normalizeQueryPlan turns arbitrary parsed JSON (or a raw JSON string) from a
 * ```queryplan block into a safe, bounded NormalizedQueryPlan, or null when it
 * can't (invalid JSON, no metrics). The block body may be either the plan
 * itself or { table, plan }. Never throws.
 */
export function normalizeQueryPlan(raw: unknown): NormalizedQueryPlan | null {
    let obj: Record<string, unknown> | null = null;
    if (typeof raw === "string") {
        const t = raw.trim();
        if (t === "") return null;
        try {
            obj = JSON.parse(t) as Record<string, unknown>;
        } catch {
            return null;
        }
    } else if (raw && typeof raw === "object") {
        obj = raw as Record<string, unknown>;
    }
    if (!obj || typeof obj !== "object") return null;

    // Accept a native-table envelope { table, table_uuid, plan } OR a
    // data-source envelope { data_source_uuid, source_name, plan:{table,...} }
    // OR a bare plan. data_source_uuid switches the card to the data-source
    // re-run endpoint; sourceTable comes from the plan body.
    const tableUuid = clampString(obj.table_uuid, 64);
    const dataSourceUuid = clampString(obj.data_source_uuid, 64);
    const planObj = (obj.plan && typeof obj.plan === "object" ? obj.plan : obj) as Record<string, unknown>;
    const sourceTable = clampString(planObj.table);
    // Header label: source_name for a data source, else the native table name.
    const table = dataSourceUuid ? clampString(obj.source_name) || sourceTable : clampString(obj.table);

    // Metrics (required).
    const metrics: PlanMetricView[] = [];
    for (const m of asArray(planObj.metrics)) {
        if (metrics.length >= MAX_METRICS) break;
        if (!m || typeof m !== "object") continue;
        const mm = m as Record<string, unknown>;
        const agg = clampString(mm.aggregate).toLowerCase() || "count";
        if (!AGG_OPS.has(agg)) continue;
        metrics.push({
            aggregate: agg,
            valueField: clampString(mm.value_field) || undefined,
            label: clampString(mm.label) || undefined,
        });
    }
    if (metrics.length === 0) return null;

    const filters: PlanFilterView[] = [];
    for (const f of asArray(planObj.filters)) {
        if (filters.length >= MAX_FILTERS) break;
        if (!f || typeof f !== "object") continue;
        const ff = f as Record<string, unknown>;
        const field = clampString(ff.field);
        const op = clampString(ff.op).toLowerCase();
        if (field === "" || op === "") continue;
        filters.push({ field, op, value: clampString(ff.value) || undefined });
    }

    const having: PlanHavingView[] = [];
    for (const h of asArray(planObj.having)) {
        if (having.length >= MAX_HAVING) break;
        if (!h || typeof h !== "object") continue;
        const hh = h as Record<string, unknown>;
        const metric = clampString(hh.metric);
        const op = clampString(hh.op).toLowerCase();
        const value = toFiniteNumber(hh.value);
        if (metric === "" || op === "" || value === null) continue;
        having.push({ metric, op, value });
    }

    const limitNum = toFiniteNumber(planObj.limit);
    return {
        table: table || undefined,
        tableUuid: tableUuid || undefined,
        dataSourceUuid: dataSourceUuid || undefined,
        sourceTable: sourceTable || undefined,
        groupBy: clampString(planObj.group_by) || undefined,
        metrics,
        filters,
        having,
        shareOf: clampString(planObj.share_of) || undefined,
        sortBy: clampString(planObj.sort_by) || undefined,
        ascending: planObj.ascending === true,
        limit: limitNum !== null && limitNum > 0 ? Math.floor(limitNum) : undefined,
    };
}

/** Human label for a metric ("count", "sum of Amount", "avg of Age (age)"). */
export function metricLabel(m: PlanMetricView): string {
    const base = m.aggregate === "count" || !m.valueField ? m.aggregate : `${m.aggregate} of ${m.valueField}`;
    return m.label && m.label !== base ? `${base} → ${m.label}` : base;
}

/**
 * denormalizeQueryPlan converts a (possibly human-edited) NormalizedQueryPlan
 * back into the exact wire shape the backend /tables/{id}/query-plan endpoint
 * (business.QueryPlan) expects, so an edited plan re-runs through the identical
 * deterministic engine. Only well-formed, bounded fields are emitted; empties
 * are dropped so the JSON stays minimal and matches what the agent sent.
 */
export function denormalizeQueryPlan(p: NormalizedQueryPlan): {
    table?: string;
    filters?: { field: string; op: string; value?: string }[];
    group_by?: string;
    metrics: { aggregate: string; value_field?: string; label?: string }[];
    having?: { metric: string; op: string; value: number }[];
    sort_by?: string;
    ascending?: boolean;
    limit?: number;
    share_of?: string;
} {
    const out: ReturnType<typeof denormalizeQueryPlan> = {
        metrics: p.metrics.map((m) => ({
            aggregate: m.aggregate,
            ...(m.valueField ? { value_field: m.valueField } : {}),
            ...(m.label ? { label: m.label } : {}),
        })),
    };
    // A data-source plan identifies its table in the plan body (native tables
    // use the uuid), so carry it back on re-run.
    if (p.sourceTable) out.table = p.sourceTable;
    if (p.filters.length > 0) {
        out.filters = p.filters.map((f) => ({
            field: f.field,
            op: f.op,
            ...(f.value !== undefined ? { value: f.value } : {}),
        }));
    }
    if (p.groupBy) out.group_by = p.groupBy;
    if (p.having.length > 0) {
        out.having = p.having.map((h) => ({ metric: h.metric, op: h.op, value: h.value }));
    }
    if (p.sortBy) out.sort_by = p.sortBy;
    if (p.ascending) out.ascending = true;
    if (p.limit && p.limit > 0) out.limit = p.limit;
    if (p.shareOf) out.share_of = p.shareOf;
    return out;
}
