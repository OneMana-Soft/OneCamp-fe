"use client";

import React from "react";
import { cn } from "@/lib/utils/helpers/cn";
import { niceTicks, type NormalizedChart } from "@/lib/utils/chartSpec";

/**
 * SvgChart — a tiny, dependency-free, theme-aware SVG chart. It draws charts in AI
 * answers, documents, table views and Reports, in both editions: it calls nothing.
 *
 * It renders a NormalizedChart (see chartSpec.ts) as inline SVG built from React
 * nodes — no charting library, no canvas, no dangerouslySetInnerHTML — so it
 * carries no new bundle weight and no XSS surface, matching MarkdownMessage's
 * philosophy. Series colors come from the existing --chart-1..5 theme tokens so
 * charts follow light/dark mode automatically.
 *
 * Supported types: bar (grouped), line, area, pie/donut. It is purely
 * presentational: all validation/bounding happens upstream in normalizeChartSpec.
 */

// One calm palette: the first series in the info token, the one chart hue
// (with its own dark-mode step); the second in the neutral faint ink, so a
// pair reads as "this, against that" (validated: ΔE 18.5 light, 20.7 dark).
// Only a third series onward reaches into the theme's chart ramp, alternating
// light and dark steps. The ramp is one blue, so past two series identity
// leans on the legend and tooltips; a categorical chart set is a token change
// in globals.css, not something to invent here.
const SERIES_COLORS = [
    "var(--info)",
    "var(--faint-foreground)",
    "var(--chart-1)",
    "var(--chart-5)",
    "var(--chart-2)",
];

const colorAt = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

// A guide (a dashed ideal pace) is context, not data: it reads in the neutral
// faint ink, so the series it is a guide for carries the only colour.
const GUIDE_COLOR = "var(--faint-foreground)";

// A series' colour: its own (an app chart's status), a guide's neutral, or the
// theme's in turn, counting only the series that are data.
const seriesColor = (chart: NormalizedChart, i: number) => {
    const s = chart.series[i];
    if (s?.color) return s.color;
    if (s?.dashed) return GUIDE_COLOR;
    const slot = chart.series.slice(0, i).filter((x) => !x.dashed && !x.color).length;
    return colorAt(slot);
};

// The ring and gap colour: the surface a chart sits on, so touching marks
// read as separate without a stroke of their own.
const SURFACE = "var(--card)";

// Bars never fill their slot: at most this wide (in viewBox units), with the
// band's leftover as air, and a round data end of this radius.
const MAX_BAR_W = 24;
const BAR_GAP = 2;
const BAR_RADIUS = 4;

// The drawing's geometry. Its viewBox is the width the chart is shown at, so
// one unit is one pixel and an 11px label is 11px on a phone as on a wide
// screen: a fixed 560-wide viewBox scaled down to a phone drew its axis labels
// at about 6px. Before the width is known (and in tests) it is 560.
const DEFAULT_W = 560;
const PAD = { top: 24, right: 16, bottom: 36, left: 44 };
interface Geo {
    w: number;
    h: number;
    plotW: number;
    plotH: number;
}
function geoFor(width: number): Geo {
    const w = Math.round(Math.min(1200, Math.max(240, width)));
    // About 4:7, between 200 and 320 tall.
    const h = Math.round(Math.min(320, Math.max(200, w * 0.57)));
    return { w, h, plotW: w - PAD.left - PAD.right, plotH: h - PAD.top - PAD.bottom };
}

/** The width an element is shown at, measured off render as it changes. */
function useWidth(ref: React.RefObject<Element | null>): number {
    const [width, setWidth] = React.useState(DEFAULT_W);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([entry]) => {
            const next = Math.round(entry.contentRect.width);
            if (next > 0) setWidth((prev) => (Math.abs(prev - next) > 1 ? next : prev));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return width;
}

// "Nice" number formatting for axis ticks and tooltips: compact for large
// magnitudes (1.2k, 3.4M), trimmed decimals otherwise.
function fmtNumber(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return trimZeros(n / 1_000_000) + "M";
    if (abs >= 1_000) return trimZeros(n / 1_000) + "k";
    if (Number.isInteger(n)) return String(n);
    return trimZeros(n);
}
function trimZeros(n: number): string {
    return parseFloat(n.toFixed(2)).toString();
}

// Compute the value range across every series, always including 0 as a baseline
// so bars/areas read correctly. Guards a flat dataset (min === max).
function valueBounds(chart: NormalizedChart): { min: number; max: number } {
    let min = 0;
    let max = 0;
    for (const s of chart.series) {
        for (const v of s.values) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    if (min === max) max = min + 1;
    return { min, max };
}

interface SvgChartProps {
    chart: NormalizedChart;
    className?: string;
}

const SvgChart: React.FC<SvgChartProps> = ({ chart, className }) => {
    const isPie = chart.type === "pie";
    const box = React.useRef<HTMLDivElement>(null);
    const g = geoFor(useWidth(box));

    return (
        <figure
            className={cn(
                "my-1 w-full rounded-lg border border-border/60 p-3",
                className
            )}
        >
            {chart.title ? (
                <figcaption className="mb-1 text-sm font-medium text-foreground">
                    {chart.title}
                </figcaption>
            ) : null}

            <div ref={box}>
                <svg
                    viewBox={`0 0 ${g.w} ${g.h}`}
                    className="w-full h-auto"
                    role="img"
                    aria-label={chart.title || `${chart.type} chart`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {isPie ? <PieChart chart={chart} g={g} /> : <CartesianChart chart={chart} g={g} />}
                </svg>
            </div>

            <Legend chart={chart} />
        </figure>
    );
};

// stackedTotals is, for a stacked area chart, each series' top edge: its
// values plus every series below it.
function stackedTotals(chart: NormalizedChart): number[][] {
    const out: number[][] = [];
    chart.series.forEach((s, si) => {
        out.push(s.values.map((v, i) => v + (si > 0 ? out[si - 1][i] : 0)));
    });
    return out;
}

// CartesianChart draws bar / line / area on a shared x/y grid.
const CartesianChart: React.FC<{ chart: NormalizedChart; g: Geo }> = ({ chart, g }) => {
    const PLOT_W = g.plotW;
    const PLOT_H = g.plotH;
    const stacked = chart.type === "area" && !!chart.stacked && chart.series.length > 0;
    const bounds = stacked
        ? valueBounds({ ...chart, series: [{ ...chart.series[0], values: stackedTotals(chart)[chart.series.length - 1] }] })
        : valueBounds(chart);
    const n = chart.labels.length;
    // Round ticks, and the axis runs from the first to the last of them.
    // A dashed guide (an ideal pace) doesn't make a count's axis fractional.
    const integers = chart.series.every((s) => s.dashed || s.values.every((v) => Number.isInteger(v)));
    const ticks = niceTicks(bounds.min, bounds.max, 4, integers);
    const min = ticks[0];
    const max = ticks[ticks.length - 1];

    // Map a value to a y pixel (top-down SVG coords).
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
    // Category slot geometry along x.
    const slotW = PLOT_W / Math.max(n, 1);
    const xCenter = (i: number) => PAD.left + slotW * (i + 0.5);

    const baselineY = yOf(Math.max(min, 0));

    // Every label that fits with air around it: an 11px label runs about
    // 6.5 units a character (cut at 10 below). Labels that would touch are
    // thinned to every second, third... one, and the tooltips keep the rest.
    const longest = Math.min(10, Math.max(1, ...chart.labels.map((l) => l.length)));
    const labelStep = Math.max(1, Math.ceil((longest * 6.5 + 12) / slotW), Math.ceil(n / 12));

    return (
        <>
            {/* Y grid lines + tick labels */}
            {ticks.map((t, i) => {
                const y = yOf(t);
                return (
                    <g key={`yt-${i}`}>
                        <line
                            x1={PAD.left}
                            y1={y}
                            x2={PAD.left + PLOT_W}
                            y2={y}
                            stroke="var(--border)"
                            strokeWidth={1}
                            shapeRendering="crispEdges"
                        />
                        <text
                            x={PAD.left - 8}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-muted-foreground tabular-nums"
                            fontSize={11}
                        >
                            {fmtNumber(t)}
                        </text>
                    </g>
                );
            })}

            {/* What the value axis counts, above it. */}
            {chart.unit ? (
                <text x={PAD.left - 8} y={PAD.top - 12} textAnchor="start" className="fill-muted-foreground" fontSize={11}>
                    {chart.unit}
                </text>
            ) : null}

            {/* X category labels */}
            {chart.labels.map((label, i) =>
                i % labelStep === 0 ? (
                    <text
                        key={`xl-${i}`}
                        x={xCenter(i)}
                        y={PAD.top + PLOT_H + 18}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={11}
                    >
                        {label.length > 10 ? label.slice(0, 9) + "\u2026" : label}
                    </text>
                ) : null
            )}

            {chart.type === "bar" && (
                <BarSeries chart={chart} slotW={slotW} xCenter={xCenter} yOf={yOf} baselineY={baselineY} />
            )}
            {stacked ? (
                <StackedAreaSeries chart={chart} xCenter={xCenter} yOf={yOf} baselineY={baselineY} />
            ) : (chart.type === "line" || chart.type === "area") && (
                <LineSeries chart={chart} xCenter={xCenter} yOf={yOf} baselineY={baselineY} area={chart.type === "area"} />
            )}
        </>
    );
};

// A bar from the baseline: square where it stands, rounded at its data end
// (the top, or the bottom for a negative value). A zero still shows as a
// hairline, so an empty week reads as zero rather than missing.
function barPath(x: number, baseY: number, w: number, h: number, down: boolean): string {
    const height = Math.max(h, 0.75);
    const r = Math.min(BAR_RADIUS, w / 2, height);
    const end = down ? baseY + height : baseY - height;
    const dir = down ? -1 : 1; // which way the rounded corners curl back
    return [
        `M${x},${baseY}`,
        `L${x},${end + dir * r}`,
        `Q${x},${end} ${x + r},${end}`,
        `L${x + w - r},${end}`,
        `Q${x + w},${end} ${x + w},${end + dir * r}`,
        `L${x + w},${baseY}`,
        "Z",
    ].join(" ");
}

const BarSeries: React.FC<{
    chart: NormalizedChart;
    slotW: number;
    xCenter: (i: number) => number;
    yOf: (v: number) => number;
    baselineY: number;
}> = ({ chart, slotW, xCenter, yOf, baselineY }) => {
    const groups = chart.series.length;
    // A group takes at most ~70% of its slot; each bar is capped at
    // MAX_BAR_W, and neighbours in a group stand BAR_GAP apart.
    const barW = Math.max(1, Math.min(MAX_BAR_W, (slotW * 0.7 - BAR_GAP * (groups - 1)) / groups));
    const groupW = barW * groups + BAR_GAP * (groups - 1);
    return (
        <>
            {chart.series.map((s, si) =>
                s.values.map((v, i) => {
                    const x = xCenter(i) - groupW / 2 + (barW + BAR_GAP) * si;
                    const y = yOf(v);
                    const h = Math.abs(baselineY - y);
                    return (
                        <path
                            key={`b-${si}-${i}`}
                            data-bar=""
                            d={barPath(x, baselineY, barW, h, v < 0)}
                            fill={seriesColor(chart, si)}
                        >
                            <title>{`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`}</title>
                        </path>
                    );
                })
            )}
        </>
    );
};

// StackedAreaSeries draws each series as a band on the ones before it, the
// first at the bottom. A point's tip gives the series' own value, not the
// running total its edge sits at.
const StackedAreaSeries: React.FC<{
    chart: NormalizedChart;
    xCenter: (i: number) => number;
    yOf: (v: number) => number;
    baselineY: number;
}> = ({ chart, xCenter, yOf, baselineY }) => {
    const tops = stackedTotals(chart);
    const n = chart.labels.length;
    if (n === 0) return null;
    return (
        <>
            {chart.series.map((s, si) => {
                const top = tops[si].map((v, i) => `${xCenter(i)},${yOf(v)}`);
                const bottom = si > 0
                    ? tops[si - 1].map((v, i) => `${xCenter(i)},${yOf(v)}`).reverse()
                    : [`${xCenter(n - 1)},${baselineY}`, `${xCenter(0)},${baselineY}`];
                return (
                    <g key={`band-${si}`}>
                        <path data-band={s.name} d={`M${top.join(" L")} L${bottom.join(" L")} Z`} fill={seriesColor(chart, si)} fillOpacity={0.7} />
                        {/* A surface gap along the band's top edge, so neighbouring
                            bands read apart by the gap rather than by hue alone. */}
                        <path d={"M" + top.join(" L")} fill="none" stroke={SURFACE} strokeWidth={2} strokeLinejoin="round" />
                        {s.values.map((v, i) => (
                            <circle key={`bp-${si}-${i}`} cx={xCenter(i)} cy={yOf(tops[si][i])} r={6} fill="transparent">
                                <title>{`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`}</title>
                            </circle>
                        ))}
                    </g>
                );
            })}
        </>
    );
};

const LineSeries: React.FC<{
    chart: NormalizedChart;
    xCenter: (i: number) => number;
    yOf: (v: number) => number;
    baselineY: number;
    area: boolean;
}> = ({ chart, xCenter, yOf, baselineY, area }) => {
    return (
        <>
            {chart.series.map((s, si) => {
                // A series that hasn't happened past upTo yet stops there.
                const shown = s.values.slice(0, s.upTo ?? s.values.length);
                if (shown.length === 0) return null;
                const pts = shown.map((v, i) => `${xCenter(i)},${yOf(v)}`);
                const linePath = "M" + pts.join(" L");
                const areaPath = `M${xCenter(0)},${baselineY} L${pts.join(" L")} L${xCenter(shown.length - 1)},${baselineY} Z`;
                return (
                    <g key={`ln-${si}`}>
                        {area && !s.dashed && (
                            <path d={areaPath} fill={seriesColor(chart, si)} fillOpacity={0.1} />
                        )}
                        <path
                            d={linePath}
                            fill="none"
                            stroke={seriesColor(chart, si)}
                            strokeWidth={s.dashed ? 1.5 : 2}
                            strokeDasharray={s.dashed ? "5 4" : undefined}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {/* A point is a hover target with a tooltip; only the
                            series' last point is drawn (an end dot with a
                            surface ring), not a dot on every value. */}
                        {shown.map((v, i) => (
                            <circle
                                key={`pt-${si}-${i}`}
                                cx={xCenter(i)}
                                cy={yOf(v)}
                                r={!s.dashed && i === shown.length - 1 ? 4 : 6}
                                fill={!s.dashed && i === shown.length - 1 ? seriesColor(chart, si) : "transparent"}
                                stroke={!s.dashed && i === shown.length - 1 ? SURFACE : undefined}
                                strokeWidth={2}
                            >
                                <title>{`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`}</title>
                            </circle>
                        ))}
                    </g>
                );
            })}
        </>
    );
};

// PieChart draws a donut from the single (first) series, one slice per label.
// Only positive values contribute a slice; a fully non-positive series renders
// nothing (the legend still lists the categories).
const PieChart: React.FC<{ chart: NormalizedChart; g: Geo }> = ({ chart, g }) => {
    const PLOT_W = g.plotW;
    const PLOT_H = g.plotH;
    const series = chart.series[0];
    const values = series.values.map((v) => (v > 0 ? v : 0));
    const total = values.reduce((a, b) => a + b, 0);

    const cx = PAD.left + PLOT_W / 2;
    const cy = PAD.top + PLOT_H / 2;
    const r = Math.min(PLOT_W, PLOT_H) / 2 - 4;
    const innerR = r * 0.55;

    if (total <= 0) {
        return (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={12}>
                No positive values to chart
            </text>
        );
    }

    let angle = -Math.PI / 2; // start at 12 o'clock
    const arcs = values.map((v, i) => {
        const frac = v / total;
        const start = angle;
        const end = angle + frac * Math.PI * 2;
        angle = end;
        if (v <= 0) return null;
        const large = end - start > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const xi2 = cx + innerR * Math.cos(end);
        const yi2 = cy + innerR * Math.sin(end);
        const xi1 = cx + innerR * Math.cos(start);
        const yi1 = cy + innerR * Math.sin(start);
        const d = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${innerR},${innerR} 0 ${large} 0 ${xi1},${yi1} Z`;
        return (
            <path key={`sl-${i}`} d={d} fill={colorAt(i)} stroke={SURFACE} strokeWidth={2} strokeLinejoin="round">
                <title>{`${chart.labels[i] ?? `#${i + 1}`}: ${fmtNumber(series.values[i])} (${Math.round(frac * 100)}%)`}</title>
            </path>
        );
    });

    return (
        <>
            {arcs}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" fontSize={13} fontWeight={600}>
                {fmtNumber(total)}
            </text>
        </>
    );
};

// Legend lists series (bar/line/area) or categories (pie) with their color.
const Legend: React.FC<{ chart: NormalizedChart }> = ({ chart }) => {
    const items =
        chart.type === "pie"
            ? chart.labels.map((label, i) => ({ label, color: colorAt(i) }))
            : chart.series.map((s, i) => ({ label: s.name, color: seriesColor(chart, i), dashed: s.dashed }));

    if (items.length <= 1 && chart.type !== "pie") return null;

    return (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {items.map((it, i) => (
                <li key={`lg-${i}`} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                    {"dashed" in it && it.dashed ? (
                        <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: it.color }} />
                    ) : (
                        <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: it.color }} />
                    )}
                    <span className="[overflow-wrap:anywhere]">{it.label}</span>
                </li>
            ))}
        </ul>
    );
};

export default SvgChart;
