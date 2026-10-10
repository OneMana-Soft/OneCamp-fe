import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import SvgChart from "@/components/charts/SvgChart"
import { normalizeChartSpec, type NormalizedChart } from "@/lib/utils/chartSpec"

// Renders through the real normalizeChartSpec → SvgChart path so these tests
// exercise the exact SVG code that ships. They guard against runtime errors in
// the drawing path (which can't be caught by type-checking alone) and lock the
// rendering contract for each chart type.

function chartFrom(spec: unknown): NormalizedChart {
    const c = normalizeChartSpec(spec)
    if (!c) throw new Error("fixture did not normalize")
    return c
}

describe("SvgChart", () => {
    it("renders a titled SVG with bars for a bar chart", () => {
        const chart = chartFrom({
            type: "bar",
            title: "Deals by stage",
            labels: ["Won", "Lost", "Open"],
            series: [{ name: "count", values: [3, 1, 2] }],
        })
        const { container, getByText } = render(<SvgChart chart={chart} />)
        expect(container.querySelector("svg")).toBeTruthy()
        expect(getByText("Deals by stage")).toBeTruthy()
        // One bar per value, each a path rounded at its data end only.
        expect(container.querySelectorAll("path[data-bar]").length).toBe(3)
    })

    it("renders a polyline path for a line chart", () => {
        const chart = chartFrom({
            type: "line",
            labels: ["Jan", "Feb", "Mar"],
            series: [{ name: "revenue", values: [10, 20, 15] }],
        })
        const { container } = render(<SvgChart chart={chart} />)
        expect(container.querySelector("svg")).toBeTruthy()
        expect(container.querySelector("path")).toBeTruthy()
        // Data points rendered as circles.
        expect(container.querySelectorAll("circle").length).toBe(3)
    })

    it("renders a filled area path for an area chart", () => {
        const chart = chartFrom({
            type: "area",
            labels: ["a", "b"],
            series: [{ values: [1, 2] }],
        })
        const { container } = render(<SvgChart chart={chart} />)
        // At least two paths: the filled area + the line stroke.
        expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2)
    })

    it("renders pie slices and a category legend", () => {
        const chart = chartFrom({
            type: "pie",
            title: "Share",
            labels: ["A", "B", "C"],
            series: [{ values: [5, 3, 2] }],
        })
        const { container, getByText } = render(<SvgChart chart={chart} />)
        expect(container.querySelector("svg")).toBeTruthy()
        // Three slices (arc paths).
        expect(container.querySelectorAll("path").length).toBe(3)
        // Legend lists each category.
        getByText("A")
        getByText("B")
        getByText("C")
    })

    it("shows a legend entry per series for a multi-series chart", () => {
        const chart = chartFrom({
            type: "bar",
            labels: ["Q1", "Q2"],
            series: [
                { name: "2024", values: [1, 2] },
                { name: "2025", values: [3, 4] },
            ],
        })
        const { getByText, container } = render(<SvgChart chart={chart} />)
        getByText("2024")
        getByText("2025")
        // 2 series × 2 points = 4 bars.
        expect(container.querySelectorAll("path[data-bar]").length).toBe(4)
    })

    it("stops a line where its series hasn't happened yet, and dashes a guide", () => {
        const chart: NormalizedChart = {
            type: "line",
            title: "Burndown",
            labels: ["Mon", "Tue", "Wed", "Thu"],
            series: [
                { name: "Ideal pace", values: [4.5, 3, 1.5, 0], dashed: true },
                { name: "Still to do", values: [6, 5, 0, 0], upTo: 2 },
            ],
        }
        const { container, getByText } = render(<SvgChart chart={chart} />)
        const [guide, left] = Array.from(container.querySelectorAll("path"))
        expect(guide.getAttribute("stroke-dasharray")).toBe("5 4")
        expect(left.getAttribute("stroke-dasharray")).toBeNull()
        // Two points drawn, not the zeros that pad it to the end.
        expect(left.getAttribute("d")!.split("L")).toHaveLength(2)
        expect(container.querySelectorAll("circle")).toHaveLength(4 + 2)
        getByText("Ideal pace")
        // The guide's fractions don't make the count's axis fractional.
        const ticks = Array.from(container.querySelectorAll("text")).map((t) => t.textContent)
        expect(ticks.some((t) => t && t.includes("."))).toBe(false)
    })

    it("stacks area bands, the first at the bottom, and scales to their total", () => {
        const { container } = render(
            <SvgChart
                chart={{
                    type: "area",
                    stacked: true,
                    title: "Flow",
                    labels: ["a", "b"],
                    series: [
                        { name: "Done", values: [1, 2] },
                        { name: "To do", values: [3, 3] },
                    ],
                }}
            />
        )
        const bands = container.querySelectorAll("path[data-band]")
        expect([...bands].map((b) => b.getAttribute("data-band"))).toEqual(["Done", "To do"])
        // The axis reaches the stacked total (5), not the largest single value (3).
        expect([...container.querySelectorAll("text")].some((t) => t.textContent === "5" || t.textContent === "6")).toBe(true)
        // A point's tip gives the band's own value.
        expect([...container.querySelectorAll("circle title")].map((t) => t.textContent)).toContain("To do · b: 3")
    })

    it("keeps bars thin, square at the baseline and apart in a group", () => {
        const chart = chartFrom({
            type: "bar",
            labels: ["a"],
            series: [
                { name: "x", values: [4] },
                { name: "y", values: [2] },
            ],
        })
        const { container } = render(<SvgChart chart={chart} />)
        const [a, b] = Array.from(container.querySelectorAll("path[data-bar]")).map((p) => p.getAttribute("d")!)
        const xs = (d: string) => d.match(/-?[\d.]+(?=,)/g)!.map(Number)
        const aLeft = Math.min(...xs(a))
        const aRight = Math.max(...xs(a))
        const bLeft = Math.min(...xs(b))
        // At most 24 wide, even alone in a wide slot.
        expect(aRight - aLeft).toBeLessThanOrEqual(24)
        // A 2-unit gap between neighbours.
        expect(bLeft - aRight).toBeCloseTo(2, 5)
        // Starts and ends on the baseline (square there): first and last points share y.
        const ys = (d: string) => d.match(/,(-?[\d.]+)/g)!.map((m) => Number(m.slice(1)))
        expect(ys(a)[0]).toBe(ys(a)[ys(a).length - 1])
    })

    it("writes the value axis's unit when the chart has one", () => {
        const { getByText } = render(
            <SvgChart chart={{ type: "bar", title: "Hours logged each week", unit: "Hours", labels: ["a"], series: [{ name: "Hours", values: [3] }] }} />
        )
        getByText("Hours")
    })

    it("draws a dashed guide in the neutral ink, not a series colour", () => {
        const { container } = render(
            <SvgChart
                chart={{
                    type: "line",
                    title: "Burndown",
                    labels: ["a", "b"],
                    series: [
                        { name: "Ideal pace", values: [2, 0], dashed: true },
                        { name: "Still to do", values: [2, 1] },
                    ],
                }}
            />
        )
        const [guide, left] = Array.from(container.querySelectorAll("path"))
        expect(guide.getAttribute("stroke")).toBe("var(--faint-foreground)")
        // The data series takes the first chart colour, as if the guide weren't there.
        expect(left.getAttribute("stroke")).toBe("var(--info)")
    })

    it("renders a placeholder message for an all-zero pie", () => {
        const chart = chartFrom({ type: "pie", labels: ["a", "b"], series: [{ values: [0, 0] }] })
        const { getByText } = render(<SvgChart chart={chart} />)
        getByText(/no positive values/i)
    })
})
