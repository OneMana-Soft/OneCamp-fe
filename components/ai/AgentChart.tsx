"use client";

import React from "react";
import { cn } from "@/lib/utils/helpers/cn";
import type { NormalizedChart } from "@/lib/utils/chartSpec";

/**
 * AgentChart — a tiny, dependency-free, theme-aware SVG chart for AI messages.
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

// The five theme chart tokens (defined in globals.css / themes.css), cycled for
// multiple series so colors stay consistent with the rest of the product.
const SERIES_COLORS = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
];

const colorAt = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

// Fixed viewBox geometry. The SVG scales responsively to its container width
// while keeping a readable aspect ratio.
const VB_W = 560;
const VB_H = 320;
const PAD = { top: 16, right: 16, bottom: 40, left: 44 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

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

// Evenly spaced y tick values (including bounds) for the value axis.
function yTicks(min: number, max: number, count = 4): number[] {
    const ticks: number[] = [];
    for (let i = 0; i <= count; i++) ticks.push(min + ((max - min) * i) / count);
    return ticks;
}

interface AgentChartProps {
    chart: NormalizedChart;
    className?: string;
}

const AgentChart: React.FC<AgentChartProps> = ({ chart, className }) => {
    const isPie = chart.type === "pie";

    return (
        <figure
            className={cn(
                "my-1 w-full rounded-lg border border-border/60 bg-foreground/[0.03] p-3",
                className
            )}
        >
            {chart.title ? (
                <figcaption className="mb-2 text-sm font-semibold text-foreground">
                    {chart.title}
                </figcaption>
            ) : null}

            <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="w-full h-auto"
                role="img"
                aria-label={chart.title || `${chart.type} chart`}
                preserveAspectRatio="xMidYMid meet"
            >
                {isPie ? <PieChart chart={chart} /> : <CartesianChart chart={chart} />}
            </svg>

            <Legend chart={chart} />
        </figure>
    );
};

// CartesianChart draws bar / line / area on a shared x/y grid.
const CartesianChart: React.FC<{ chart: NormalizedChart }> = ({ chart }) => {
    const { min, max } = valueBounds(chart);
    const n = chart.labels.length;
    const ticks = yTicks(min, max);

    // Map a value to a y pixel (top-down SVG coords).
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
    // Category slot geometry along x.
    const slotW = PLOT_W / Math.max(n, 1);
    const xCenter = (i: number) => PAD.left + slotW * (i + 0.5);

    const baselineY = yOf(Math.max(min, 0));

    // Show every label when few; thin out to ~12 when many, to avoid overlap.
    const labelStep = Math.ceil(n / 12);

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
                            opacity={0.5}
                        />
                        <text
                            x={PAD.left - 6}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-muted-foreground"
                            fontSize={10}
                        >
                            {fmtNumber(t)}
                        </text>
                    </g>
                );
            })}

            {/* X category labels */}
            {chart.labels.map((label, i) =>
                i % labelStep === 0 ? (
                    <text
                        key={`xl-${i}`}
                        x={xCenter(i)}
                        y={PAD.top + PLOT_H + 16}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={10}
                    >
                        {label.length > 10 ? label.slice(0, 9) + "\u2026" : label}
                    </text>
                ) : null
            )}

            {chart.type === "bar" && (
                <BarSeries chart={chart} slotW={slotW} xCenter={xCenter} yOf={yOf} baselineY={baselineY} />
            )}
            {(chart.type === "line" || chart.type === "area") && (
                <LineSeries chart={chart} xCenter={xCenter} yOf={yOf} baselineY={baselineY} area={chart.type === "area"} />
            )}
        </>
    );
};

const BarSeries: React.FC<{
    chart: NormalizedChart;
    slotW: number;
    xCenter: (i: number) => number;
    yOf: (v: number) => number;
    baselineY: number;
}> = ({ chart, slotW, xCenter, yOf, baselineY }) => {
    const groups = chart.series.length;
    // Bars share ~70% of the slot, split across the grouped series.
    const groupW = slotW * 0.7;
    const barW = groupW / groups;
    return (
        <>
            {chart.series.map((s, si) =>
                s.values.map((v, i) => {
                    const cx = xCenter(i) - groupW / 2 + barW * si;
                    const y = yOf(v);
                    const top = Math.min(y, baselineY);
                    const h = Math.abs(baselineY - y);
                    return (
                        <rect
                            key={`b-${si}-${i}`}
                            x={cx}
                            y={top}
                            width={Math.max(barW - 1, 1)}
                            height={Math.max(h, 0.5)}
                            fill={colorAt(si)}
                            rx={1}
                        >
                            <title>{`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`}</title>
                        </rect>
                    );
                })
            )}
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
                const pts = s.values.map((v, i) => `${xCenter(i)},${yOf(v)}`);
                const linePath = "M" + pts.join(" L");
                const areaPath =
                    pts.length > 0
                        ? `M${xCenter(0)},${baselineY} L${pts.join(" L")} L${xCenter(s.values.length - 1)},${baselineY} Z`
                        : "";
                return (
                    <g key={`ln-${si}`}>
                        {area && areaPath && (
                            <path d={areaPath} fill={colorAt(si)} opacity={0.15} />
                        )}
                        <path
                            d={linePath}
                            fill="none"
                            stroke={colorAt(si)}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {s.values.map((v, i) => (
                            <circle key={`pt-${si}-${i}`} cx={xCenter(i)} cy={yOf(v)} r={2.5} fill={colorAt(si)}>
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
const PieChart: React.FC<{ chart: NormalizedChart }> = ({ chart }) => {
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
            <path key={`sl-${i}`} d={d} fill={colorAt(i)}>
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
            : chart.series.map((s, i) => ({ label: s.name, color: colorAt(i) }));

    if (items.length <= 1 && chart.type !== "pie") return null;

    return (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {items.map((it, i) => (
                <li key={`lg-${i}`} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: it.color }} />
                    <span className="[overflow-wrap:anywhere]">{it.label}</span>
                </li>
            ))}
        </ul>
    );
};

export default AgentChart;
