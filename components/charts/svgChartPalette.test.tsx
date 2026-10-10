import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import SvgChart from "@/components/charts/SvgChart"
import { normalizeChartSpec } from "@/lib/utils/chartSpec"

// Every chart, a table's as much as a report's, draws in the app's one chart
// order (SvgChart's SERIES_HUES: sky, berry, sun, lake, dusk, moss, the
// colour-blind-safe order, measured in app/chartPalette.test.ts), so the same
// series is the same colour wherever it shows. A chart can still be handed a
// palette of its own, which wins.
describe("SvgChart's palette", () => {
  const chart = normalizeChartSpec({ type: "pie", labels: ["A", "B"], series: [{ name: "n", values: [2, 1] }] })!
  const fills = (container: HTMLElement) => [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"))

  it("draws a chart given no palette in the chart order", () => {
    const { container } = render(<SvgChart chart={chart} />)
    expect(fills(container).slice(0, 2)).toEqual(["var(--camp-sky)", "var(--camp-berry)"])
  })

  it("draws a chart given a palette in that palette", () => {
    const { container } = render(<SvgChart chart={chart} palette={["var(--camp-lake)", "var(--camp-sun)"]} />)
    expect(fills(container).slice(0, 2)).toEqual(["var(--camp-lake)", "var(--camp-sun)"])
  })
})
