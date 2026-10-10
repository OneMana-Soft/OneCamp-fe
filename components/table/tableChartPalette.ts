import type { CampHue } from "@/lib/campHue"

/**
 * A table's chart, in the camp hues (the playful layer: "charts use the six
 * hues in a fixed order"). The order is the one that passes the chart guard
 * (app/chartPalette.test.ts's thresholds, run on these six in
 * tableChartPalette.test.ts): neighbours at least 8 apart in OKLab under
 * protanopia and deuteranopia and 15 apart in normal vision, in both themes,
 * and the first three apart as a set. The order the direction proposes (sky,
 * moss, sun, dusk, berry, lake) puts moss beside sun, 6.3 apart for a
 * protanope, and berry beside lake, 6.5 for a deuteranope in the dark, so a
 * bar beside its neighbour would read as the same colour to them.
 */
export const TABLE_CHART_HUES: readonly CampHue[] = ["sky", "berry", "sun", "lake", "dusk", "moss"]

/** The same, as CSS colours, which follow the theme. */
export const TABLE_CHART_PALETTE: readonly string[] = TABLE_CHART_HUES.map((h) => `var(--camp-${h})`)
