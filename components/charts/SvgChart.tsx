"use client";

import React from "react";
import { cn } from "@/lib/utils/helpers/cn";
import { niceTicks, type NormalizedChart } from "@/lib/utils/chartSpec";
import { useGrow } from "@/hooks/useGrow";

/**
 * SvgChart — a tiny, dependency-free, theme-aware SVG chart. It draws charts in AI
 * answers, documents, table views and Reports, in both editions: it calls nothing.
 *
 * It renders a NormalizedChart (see chartSpec.ts) as inline SVG built from React
 * nodes — no charting library, no canvas, no dangerouslySetInnerHTML — so it
 * carries no new bundle weight and no XSS surface, matching MarkdownMessage's
 * philosophy. Series colours are the camp hues (--camp-*), so charts follow
 * light and dark mode automatically.
 *
 * Supported types: bar (grouped), line, area, pie/donut. It is purely
 * presentational: all validation/bounding happens upstream in normalizeChartSpec.
 */

// The camp hues, the same six every person and project is drawn in, in the
// app's one chart order: sky, berry, sun, lake, dusk, moss. Every chart takes
// it, a report's and a table's alike, so a series is the same colour on both.
// The order is the colour-blind-safe one: neighbours stay 8 or more apart
// (OKLab x100) under protanopia and deuteranopia, in both themes (8.4 at
// worst, lake and dusk for a deuteranope in dark), 15 or more in normal vision
// (17.9 at worst), and the first three are apart as a set, for a pie. The
// playful layer's first order (sky, moss, sun, dusk, berry, lake) put moss
// beside sun at 6.3 for a protanope. Never cycled by rank: a series keeps its
// slot. app/chartPalette.test.ts measures it, with 3:1 on the card.
export const SERIES_HUES = ["sky", "berry", "sun", "lake", "dusk", "moss"] as const
const SERIES_COLORS = SERIES_HUES.map((h) => `var(--camp-${h})`);

const colorAt = (i: number, palette: readonly string[] = SERIES_COLORS) => palette[i % palette.length];

// A chart can still be drawn in a palette of its own, passed in. Every series
// and slice reads it from here; a chart given none draws the series above.
const PaletteContext = React.createContext<readonly string[]>(SERIES_COLORS);

// A guide (a dashed ideal pace) is context, not data: it reads in the neutral
// faint ink, so the series it is a guide for carries the only colour.
const GUIDE_COLOR = "var(--faint-foreground)";

// A series' colour: its own (an app chart's status), a guide's neutral, or the
// theme's in turn, counting only the series that are data.
const seriesColor = (chart: NormalizedChart, i: number, palette: readonly string[] = SERIES_COLORS) => {
    const s = chart.series[i];
    if (s?.color) return s.color;
    if (s?.dashed) return GUIDE_COLOR;
    const slot = chart.series.slice(0, i).filter((x) => !x.dashed && !x.color).length;
    return colorAt(slot, palette);
};

// The ring and gap colour: the surface a chart sits on, so touching marks
// read as separate without a stroke of their own.
const SURFACE = "var(--card)";

// Bars never fill their slot. Two looks share one drawing:
// - "sheet" (content.md T18), a chart in a doc, a table view or an answer:
//   at most 32 wide, 2 apart within a group, 70% of the band, r4 data end.
// - "card" (work.md W44), a report's chart on its own card: thin, 8 to 14
//   wide, 4 apart, 40% of the band left as air between groups, r3.
const BARS = {
    sheet: { maxW: 32, gap: 2, radius: 4, share: 0.7 },
    card: { maxW: 14, gap: 4, radius: 3, share: 0.6 },
} as const;
type Variant = keyof typeof BARS;

/**
 * What the reader is pointing at and has picked out: the hovered band (its
 * bars at full strength, the others at 40%, a crosshair and a tooltip) and an
 * isolated series (picked from the legend; the others fade). And whether the
 * chart is on its first reveal, when bars grow from the baseline and lines
 * draw in.
 */
interface ChartState {
    hover: number | null;
    setHover: (i: number | null) => void;
    isolated: number | null;
    grow: boolean;
    variant: Variant;
}
const ChartStateContext = React.createContext<ChartState>({ hover: null, setHover: () => {}, isolated: null, grow: false, variant: "sheet" });

// The donut's tooltip (content.md T18): an HTML pop card, not an SVG <title>.
// A slice reports what it shows and where (viewBox units); the figure places
// the card. Bands on a cartesian chart use the band tooltip (Tip) instead.
interface TipRow {
    color: string;
    label: string;
    value: string;
}
interface SliceTip {
    x: number;
    y: number;
    title: string;
    rows: TipRow[];
}
const SliceTipContext = React.createContext<(tip: SliceTip | null) => void>(() => {});

/** How strongly series si's mark in band i shows, given the hover and the isolated series. */
const strength = (st: ChartState, si: number, i?: number) => (st.isolated !== null && st.isolated !== si ? 0.15 : st.hover !== null && i !== undefined && i !== st.hover ? 0.4 : 1);

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
    /** Series colours in order, as CSS colours; the app's chart order (SERIES_HUES) when left out. */
    palette?: readonly string[];
    /** One line under the title that says what to read in it. */
    subtitle?: React.ReactNode;
    /** What to say instead of an empty chart, when every value is zero. */
    empty?: React.ReactNode;
    /**
     * "sheet" (the default): on the page with no frame and bars up to 32
     * wide (content.md T18). "card": a report's chart on its own raised card
     * with thin bars (work.md W44).
     */
    variant?: Variant;
}

const SvgChart: React.FC<SvgChartProps> = ({ chart, className, palette, subtitle, empty, variant = "sheet" }) => {
    const isPie = chart.type === "pie";
    const box = React.useRef<HTMLDivElement>(null);
    const g = geoFor(useWidth(box));
    const [hover, setHover] = React.useState<number | null>(null);
    const [isolated, setIsolated] = React.useState<number | null>(null);
    // Bars grow and lines draw the first time a chart is shown in a session.
    const grow = useGrow(`chart:${chart.type}:${chart.title}`).mode === "animate";
    const state = React.useMemo(() => ({ hover, setHover, isolated, grow, variant }), [hover, isolated, grow, variant]);
    const [sliceTip, setSliceTip] = React.useState<SliceTip | null>(null);
    // The card's place, in CSS pixels: the drawing is shown at its viewBox
    // width or scaled to fit, so scale the slice's point the same way.
    const scale = (box.current?.clientWidth || g.w) / g.w;
    // A chart whose every value is zero says so in a sentence (W44), rather
    // than drawing an empty grid. A pie says it in its own middle.
    const allZero = !isPie && chart.series.filter((x) => !x.dashed).every((x) => x.values.every((v) => v === 0));

    return (
        <PaletteContext.Provider value={palette && palette.length ? palette : SERIES_COLORS}>
        <ChartStateContext.Provider value={state}>
        <SliceTipContext.Provider value={setSliceTip}>
        {/* On the sheet with no frame (T18); a report's card is raised (W44). */}
        <figure
            data-chart=""
            data-svg-chart=""
            className={cn(
                "relative my-1 w-full",
                variant === "card" && "rounded-lg bg-raised px-5 pb-3 pt-4 shadow-e1",
                className
            )}
            onMouseLeave={() => setHover(null)}
        >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                    {chart.title ? (
                        <figcaption className={variant === "card" ? "text-sm font-[590] text-foreground" : "text-ui-sm font-medium text-ink"}>
                            {chart.title}
                        </figcaption>
                    ) : null}
                    {subtitle ? <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p> : null}
                </div>
                {!allZero && <Legend chart={chart} isolated={isolated} onIsolate={setIsolated} />}
            </div>

            {allZero ? (
                <p data-chart-empty="" className="py-6 text-sm text-ink-2">
                    {empty ?? "Nothing to chart yet."}
                </p>
            ) : (
                <div ref={box} className="relative">
                    <svg
                        viewBox={`0 0 ${g.w} ${g.h}`}
                        className="h-auto w-full overflow-visible"
                        role="img"
                        aria-label={chart.title || `${chart.type} chart`}
                        preserveAspectRatio="xMidYMid meet"
                    >
                        {isPie ? <PieChart chart={chart} g={g} /> : <CartesianChart chart={chart} g={g} />}
                    </svg>
                    {!isPie && hover !== null && <Tip chart={chart} g={g} i={hover} />}
                    {isPie && sliceTip ? (
                        <div
                            role="tooltip"
                            data-chart-tip=""
                            className="content-float pointer-events-none absolute z-10 min-w-32 max-w-60 rounded-lg bg-pop px-2.5 py-2 text-meta text-ink shadow-e3"
                            style={{ left: sliceTip.x * scale, top: sliceTip.y * scale, marginTop: -8, translate: "-50% -100%" }}
                        >
                            <div className="mb-1 truncate font-medium">{sliceTip.title}</div>
                            {sliceTip.rows.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-ink-2">
                                    <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: r.color }} />
                                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                    <span className="tabular-nums text-ink">{r.value}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            )}
        </figure>
        </SliceTipContext.Provider>
        </ChartStateContext.Provider>
        </PaletteContext.Provider>
    );
};

/**
 * The hovered band's tooltip (W44): pop, e3, r10, padding 8 10: the label,
 * each series' swatch, name and value in tabular figures, and the difference
 * when there are two.
 */
const Tip: React.FC<{ chart: NormalizedChart; g: Geo; i: number }> = ({ chart, g, i }) => {
    const palette = React.useContext(PaletteContext);
    const slotW = g.plotW / Math.max(chart.labels.length, 1);
    const x = PAD.left + slotW * (i + 0.5);
    const data = chart.series.map((s, si) => ({ s, si })).filter(({ s }) => !s.dashed && i < (s.upTo ?? s.values.length));
    const pct = (x / g.w) * 100;
    return (
        <div
            role="tooltip"
            data-chart-tip=""
            className="pointer-events-none absolute top-1 z-10 min-w-[8rem] rounded-[10px] bg-pop px-2.5 py-2 text-xs shadow-e3 [animation:work-pop-in_180ms_var(--ease-out)_both]"
            style={{ left: `${pct}%`, transform: `translateX(${pct > 70 ? "-100%" : pct < 30 ? "0" : "-50%"})` }}
        >
            <p className="mb-1 font-[510] text-foreground">{chart.labels[i]}</p>
            {data.map(({ s, si }) => (
                <p key={si} className="flex items-center justify-between gap-4 text-ink-2">
                    <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: seriesColor(chart, si, palette) }} />
                        {s.name}
                    </span>
                    <span className="tabular-nums font-[510] text-foreground">{fmtNumber(s.values[i])}</span>
                </p>
            ))}
            {data.length === 2 && (
                <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 text-ink-3">
                    <span>Difference</span>
                    <span className="tabular-nums">{fmtNumber(data[0].s.values[i] - data[1].s.values[i])}</span>
                </p>
            )}
        </div>
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
                            // The zero line a step darker (T18), the rest hairlines.
                            stroke={t === 0 ? "var(--line-3)" : "var(--line)"}
                            strokeWidth={1}
                            shapeRendering="crispEdges"
                        />
                        <text
                            x={PAD.left - 8}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-ink-3 tabular-nums"
                            fontSize={11.5}
                        >
                            {fmtNumber(t)}
                        </text>
                    </g>
                );
            })}

            {/* What the value axis counts, above it. */}
            {chart.unit ? (
                <text x={PAD.left - 8} y={PAD.top - 12} textAnchor="start" className="fill-ink-3" fontSize={11.5}>
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
                        className="fill-ink-3"
                        fontSize={11.5}
                    >
                        {label.length > 10 ? label.slice(0, 9) + "\u2026" : label}
                    </text>
                ) : null
            )}

            <Crosshair xCenter={xCenter} top={PAD.top} bottom={PAD.top + PLOT_H} />

            {chart.type === "bar" && (
                <BarSeries chart={chart} slotW={slotW} xCenter={xCenter} yOf={yOf} baselineY={baselineY} />
            )}
            {stacked ? (
                <StackedAreaSeries chart={chart} xCenter={xCenter} yOf={yOf} baselineY={baselineY} />
            ) : (chart.type === "line" || chart.type === "area") && (
                <LineSeries chart={chart} xCenter={xCenter} yOf={yOf} baselineY={baselineY} area={chart.type === "area"} />
            )}

            <HoverBands n={n} slotW={slotW} top={PAD.top} height={PLOT_H} />
        </>
    );
};

/** The crosshair (W44): a 1 px ink-3 line through the hovered band. */
const Crosshair: React.FC<{ xCenter: (i: number) => number; top: number; bottom: number }> = ({ xCenter, top, bottom }) => {
    const { hover } = React.useContext(ChartStateContext);
    if (hover === null) return null;
    return <line data-crosshair="" x1={xCenter(hover)} x2={xCenter(hover)} y1={top} y2={bottom} stroke="var(--ink-3)" strokeWidth={1} shapeRendering="crispEdges" />;
};

/** One transparent target per band, the band's full height, so pointing anywhere in it hovers it. */
const HoverBands: React.FC<{ n: number; slotW: number; top: number; height: number }> = ({ n, slotW, top, height }) => {
    const { setHover } = React.useContext(ChartStateContext);
    return (
        <g data-hover-bands="">
            {Array.from({ length: n }, (_, i) => (
                <rect key={i} data-band-target={i} x={PAD.left + slotW * i} y={top} width={slotW} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
        </g>
    );
};

// A bar from the baseline: square where it stands, rounded at its data end
// (the top, or the bottom for a negative value). A zero still shows as a
// hairline, so an empty week reads as zero rather than missing.
function barPath(x: number, baseY: number, w: number, h: number, down: boolean, radius: number): string {
    const height = Math.max(h, 0.75);
    const r = Math.min(radius, w / 2, height);
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
    const palette = React.useContext(PaletteContext);
    const st = React.useContext(ChartStateContext);
    const { maxW, gap, radius, share } = BARS[st.variant];
    const groups = chart.series.length;
    // A group takes at most `share` of its slot; each bar is capped at
    // maxW, and neighbours in a group stand `gap` apart.
    const barW = Math.max(1, Math.min(maxW, (slotW * share - gap * (groups - 1)) / groups));
    const groupW = barW * groups + gap * (groups - 1);
    return (
        <>
            {chart.labels.map((label, i) => (
                // One band's bars: pointing at them hovers the band, as its
                // full-height target does.
                <g key={`bg-${i}`} data-bar-group={i} onMouseEnter={() => st.setHover(i)}>
                    {chart.series.map((s, si) => {
                        const v = s.values[i] ?? 0;
                        const x = xCenter(i) - groupW / 2 + (barW + gap) * si;
                        const y = yOf(v);
                        const h = Math.abs(baselineY - y);
                        return (
                            <path
                                key={`b-${si}-${i}`}
                                data-bar=""
                                data-grow=""
                                aria-label={`${s.name}${label ? ` · ${label}` : ""}: ${fmtNumber(v)}`}
                                d={barPath(x, baselineY, barW, h, v < 0, radius)}
                                fill={seriesColor(chart, si, palette)}
                                fillOpacity={strength(st, si, i)}
                                // Grows from the baseline on its first reveal in a
                                // session (320 ms, 16 ms a bar, capped at 240 ms).
                                className={cn("transition-[fill-opacity] duration-[140ms]", st.grow && "chart-bar-grow")}
                                style={st.grow ? { transformOrigin: `0 ${baselineY}px`, animationDelay: `${Math.min(i * groups + si, 15) * 16}ms` } : undefined}
                            />
                        );
                    })}
                </g>
            ))}
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
    const palette = React.useContext(PaletteContext);
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
                        <path data-band={s.name} d={`M${top.join(" L")} L${bottom.join(" L")} Z`} fill={seriesColor(chart, si, palette)} fillOpacity={0.7} />
                        {/* A surface gap along the band's top edge, so neighbouring
                            bands read apart by the gap rather than by hue alone. */}
                        <path d={"M" + top.join(" L")} fill="none" stroke={SURFACE} strokeWidth={2} strokeLinejoin="round" />
                        {s.values.map((v, i) => (
                            <circle key={`bp-${si}-${i}`} cx={xCenter(i)} cy={yOf(tops[si][i])} r={6} fill="transparent" aria-label={`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`} />
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
    const palette = React.useContext(PaletteContext);
    const st = React.useContext(ChartStateContext);
    return (
        <>
            {chart.series.map((s, si) => {
                // A series that hasn't happened past upTo yet stops there.
                const shown = s.values.slice(0, s.upTo ?? s.values.length);
                if (shown.length === 0) return null;
                const pts = shown.map((v, i) => `${xCenter(i)},${yOf(v)}`);
                const linePath = "M" + pts.join(" L");
                const areaPath = `M${xCenter(0)},${baselineY} L${pts.join(" L")} L${xCenter(shown.length - 1)},${baselineY} Z`;
                const draw = st.grow && !s.dashed;
                const last = shown.length - 1;
                return (
                    <g key={`ln-${si}`} opacity={strength(st, si)} className="transition-opacity duration-[140ms]">
                        {area && !s.dashed && (
                            <path d={areaPath} fill={seriesColor(chart, si, palette)} fillOpacity={0.12} />
                        )}
                        <path
                            d={linePath}
                            fill="none"
                            stroke={seriesColor(chart, si, palette)}
                            strokeWidth={s.dashed ? 1.5 : 2}
                            strokeDasharray={s.dashed ? "5 4" : undefined}
                            pathLength={draw ? 1 : undefined}
                            // Draws in on its first reveal in a session (480 ms).
                            className={draw ? "chart-line-draw" : undefined}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {/* Its last value, written at the line's end in its own colour. */}
                        {!s.dashed && !area && (
                            <text data-end-label="" x={xCenter(last)} y={yOf(shown[last]) - 10} textAnchor="end" fontSize={12} fontWeight={510} fill={seriesColor(chart, si, palette)} className="tabular-nums">
                                {fmtNumber(shown[last])}
                            </text>
                        )}
                        {/* A point is a hover target with a tooltip; only the
                            series' last point is drawn (an end dot with a
                            surface ring), not a dot on every value. */}
                        {shown.map((v, i) => (
                            <circle
                                key={`pt-${si}-${i}`}
                                cx={xCenter(i)}
                                cy={yOf(v)}
                                r={!s.dashed && i === shown.length - 1 ? 4 : 6}
                                fill={!s.dashed && i === shown.length - 1 ? seriesColor(chart, si, palette) : "transparent"}
                                stroke={!s.dashed && i === shown.length - 1 ? SURFACE : undefined}
                                strokeWidth={2}
                                aria-label={`${s.name}${chart.labels[i] ? ` · ${chart.labels[i]}` : ""}: ${fmtNumber(v)}`}
                            />
                        ))}
                    </g>
                );
            })}
        </>
    );
};

// One donut segment, with a 2 px surface gap and the tooltip.
const Slice: React.FC<{ d: string; fill: string; label: string; title: string; tipAt: { x: number; y: number }; row: TipRow }> = ({ d, fill, label, title, tipAt, row }) => {
    const set = React.useContext(SliceTipContext);
    const show = () => set({ x: tipAt.x, y: tipAt.y, title, rows: [row] });
    const hide = () => set(null);
    return <path d={d} fill={fill} stroke={SURFACE} strokeWidth={2} strokeLinejoin="round" aria-label={label} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} />;
};

// PieChart draws a donut from the single (first) series, one slice per label.
// Only positive values contribute a slice; a fully non-positive series renders
// nothing (the legend still lists the categories).
const PieChart: React.FC<{ chart: NormalizedChart; g: Geo }> = ({ chart, g }) => {
    const palette = React.useContext(PaletteContext);
    const { grow } = React.useContext(ChartStateContext);
    const PLOT_W = g.plotW;
    const PLOT_H = g.plotH;
    const series = chart.series[0];
    const values = series.values.map((v) => (v > 0 ? v : 0));
    const total = values.reduce((a, b) => a + b, 0);

    const cx = PAD.left + PLOT_W / 2;
    const cy = PAD.top + PLOT_H / 2;
    const r = Math.min(PLOT_W, PLOT_H) / 2 - 4;
    const innerR = r * 0.64;

    if (total <= 0) {
        return (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-ink-3" fontSize={12}>
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
        const mid = (start + end) / 2;
        return (
            <Slice
                key={`sl-${i}`}
                d={d}
                fill={colorAt(i, palette)}
                label={`${chart.labels[i] ?? `#${i + 1}`}: ${fmtNumber(series.values[i])} (${Math.round(frac * 100)}%)`}
                tipAt={{ x: cx + r * Math.cos(mid), y: cy + r * Math.sin(mid) }}
                title={chart.labels[i] ?? `#${i + 1}`}
                row={{ color: colorAt(i, palette), label: series.name, value: `${fmtNumber(series.values[i])} · ${Math.round(frac * 100)}%` }}
            />
        );
    });

    return (
        <>
            <g className={grow ? "chart-donut-in" : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
                {arcs}
            </g>
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-ink tabular-nums" fontSize={24} fontWeight={590} letterSpacing="-0.019em">
                {fmtNumber(total)}
            </text>
        </>
    );
};

// Legend lists series (bar/line/area) or categories (pie) with their color:
// top right, 8 px r2 swatches and 12 ink-2 words (W44). Clicking a series
// isolates it; clicking it again shows them all.
const Legend: React.FC<{ chart: NormalizedChart; isolated: number | null; onIsolate: (i: number | null) => void }> = ({ chart, isolated, onIsolate }) => {
    const palette = React.useContext(PaletteContext);
    const items =
        chart.type === "pie"
            ? chart.labels.map((label, i) => ({ label, color: colorAt(i, palette), dashed: false }))
            : chart.series.map((s, i) => ({ label: s.name, color: seriesColor(chart, i, palette), dashed: !!s.dashed }));

    if (items.length <= 1 && chart.type !== "pie") return null;

    return (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" data-legend="">
            {items.map((it, i) => (
                <li key={`lg-${i}`}>
                    {chart.type === "pie" || it.dashed ? (
                        <span className="flex items-center gap-1.5 text-xs text-ink-2">
                            <Swatch color={it.color} dashed={it.dashed} />
                            <span className="[overflow-wrap:anywhere]">{it.label}</span>
                        </span>
                    ) : (
                        <button
                            type="button"
                            aria-pressed={isolated === i}
                            onClick={() => onIsolate(isolated === i ? null : i)}
                            className={cn("flex items-center gap-1.5 rounded-xs text-xs outline-none transition-opacity hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", isolated !== null && isolated !== i ? "text-ink-3 opacity-60" : "text-ink-2")}
                        >
                            <Swatch color={it.color} />
                            <span className="[overflow-wrap:anywhere]">{it.label}</span>
                        </button>
                    )}
                </li>
            ))}
        </ul>
    );
};

const Swatch: React.FC<{ color: string; dashed?: boolean }> = ({ color, dashed }) =>
    dashed ? <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: color }} /> : <span className="inline-block size-2 rounded-[2px]" style={{ backgroundColor: color }} />;

export default SvgChart;
