// chartSpec.ts — pure, dependency-free parsing/normalization for the agent
// chart block. An agent (or any AI surface) can visualize data by emitting a
// fenced ```chart code block whose body is a small JSON spec; MarkdownMessage
// detects that fence, runs the body through normalizeChartSpec, and renders the
// result as a dependency-free inline SVG (see AgentChart.tsx).
//
// This module is intentionally UI-free and total: it never throws and returns
// null for anything it can't turn into a safe, bounded chart, so a malformed or
// still-streaming block simply falls back to a plain code block. All limits are
// hard caps so a hostile/huge spec can't blow up the DOM or the render cost.

export type ChartType = "bar" | "line" | "area" | "pie";

export interface ChartSeries {
    /** Optional series label, shown in the legend. */
    name?: string;
    values: number[];
}

/** The raw shape an agent emits inside a ```chart block (before validation). */
export interface ChartSpecInput {
    type?: string;
    title?: string;
    labels?: unknown[];
    series?: unknown;
    /** Convenience: a single unnamed series may be given as `values` directly. */
    values?: unknown;
}

/** A validated, bounded, render-ready chart. Every series has the same length
 * as `labels`, and every value is a finite number. */
export interface NormalizedChart {
    type: ChartType;
    title: string;
    labels: string[];
    series: Required<ChartSeries>[];
}

// Hard caps. Charts are meant to summarize, not to dump a whole dataset into
// the DOM, so we bound every dimension. Anything beyond a cap is truncated.
const MAX_POINTS = 60;
const MAX_SERIES = 8;
const MAX_TITLE = 120;
const MAX_LABEL = 40;
const MAX_NAME = 40;

const CHART_TYPES: ReadonlySet<string> = new Set(["bar", "line", "area", "pie"]);

function clampString(v: unknown, max: number): string {
    if (typeof v !== "string") return "";
    const t = v.trim();
    return t.length > max ? t.slice(0, max) : t;
}

// Coerce a value to a finite number. Accepts numbers and numeric strings
// (tolerating thousands separators / surrounding whitespace); everything else,
// including NaN/Infinity, becomes null so callers can decide how to fill.
function toFiniteNumber(v: unknown): number | null {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const cleaned = v.replace(/[,\s]/g, "");
        if (cleaned === "") return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function asArray(v: unknown): unknown[] | null {
    return Array.isArray(v) ? v : null;
}

// Pull the list of series out of the input, tolerating the two shapes an agent
// might reasonably produce: an explicit `series` array of {name, values}, or a
// bare `values` array (a single unnamed series). A `series` given as a flat
// number array is also accepted as one unnamed series.
function extractRawSeries(input: ChartSpecInput): { name?: unknown; values: unknown[] }[] {
    const out: { name?: unknown; values: unknown[] }[] = [];

    const series = input.series;
    if (Array.isArray(series)) {
        // Flat number/string array => a single unnamed series.
        const looksFlat = series.every((e) => typeof e === "number" || typeof e === "string");
        if (looksFlat && series.length > 0) {
            out.push({ values: series });
        } else {
            for (const entry of series) {
                if (entry && typeof entry === "object") {
                    const e = entry as { name?: unknown; values?: unknown };
                    const values = asArray(e.values);
                    if (values) out.push({ name: e.name, values });
                }
            }
        }
    }

    if (out.length === 0) {
        const bare = asArray(input.values);
        if (bare) out.push({ values: bare });
    }

    return out;
}

/**
 * normalizeChartSpec turns arbitrary parsed JSON (or a raw JSON string) into a
 * safe, bounded NormalizedChart, or null when it can't (invalid JSON, no usable
 * numeric data, etc.). It never throws.
 */
export function normalizeChartSpec(raw: unknown): NormalizedChart | null {
    let input: ChartSpecInput | null = null;

    if (typeof raw === "string") {
        const t = raw.trim();
        if (t === "") return null;
        try {
            input = JSON.parse(t) as ChartSpecInput;
        } catch {
            return null;
        }
    } else if (raw && typeof raw === "object") {
        input = raw as ChartSpecInput;
    }
    if (!input || typeof input !== "object") return null;

    const rawSeries = extractRawSeries(input);
    if (rawSeries.length === 0) return null;

    const type: ChartType = CHART_TYPES.has(String(input.type).toLowerCase())
        ? (String(input.type).toLowerCase() as ChartType)
        : "bar";

    // Determine the number of points from the raw labels and the longest series.
    const rawLabels = asArray(input.labels) ?? [];
    let points = Math.min(rawLabels.length, MAX_POINTS);
    for (const s of rawSeries) {
        points = Math.max(points, Math.min(s.values.length, MAX_POINTS));
    }
    if (points === 0) return null;

    // Labels: use provided labels, padding with 1-based indices when short.
    const labels: string[] = [];
    for (let i = 0; i < points; i++) {
        const l = clampString(rawLabels[i], MAX_LABEL);
        labels.push(l !== "" ? l : String(i + 1));
    }

    // Series: coerce every value to a finite number (non-finite/blank => 0) and
    // pad/truncate to `points`. Drop a series that has no finite value at all.
    const series: Required<ChartSeries>[] = [];
    for (let si = 0; si < rawSeries.length && series.length < MAX_SERIES; si++) {
        const rs = rawSeries[si];
        const values: number[] = [];
        let sawFinite = false;
        for (let i = 0; i < points; i++) {
            const n = toFiniteNumber(rs.values[i]);
            if (n !== null) sawFinite = true;
            values.push(n ?? 0);
        }
        if (!sawFinite) continue;
        series.push({
            name: clampString(rs.name, MAX_NAME) || `Series ${series.length + 1}`,
            values,
        });
    }
    if (series.length === 0) return null;

    // A pie chart is single-series by definition; keep only the first.
    const finalSeries = type === "pie" ? series.slice(0, 1) : series;

    return {
        type,
        title: clampString(input.title, MAX_TITLE),
        labels,
        series: finalSeries,
    };
}
