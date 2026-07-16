import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import AgentChart from "@/components/ai/AgentChart"
import { normalizeChartSpec, type NormalizedChart } from "@/lib/utils/chartSpec"

// Renders through the real normalizeChartSpec → AgentChart path so these tests
// exercise the exact SVG code that ships. They guard against runtime errors in
// the drawing path (which can't be caught by type-checking alone) and lock the
// rendering contract for each chart type.

function chartFrom(spec: unknown): NormalizedChart {
    const c = normalizeChartSpec(spec)
    if (!c) throw new Error("fixture did not normalize")
    return c
}

describe("AgentChart", () => {
    it("renders a titled SVG with bars for a bar chart", () => {
        const chart = chartFrom({
            type: "bar",
            title: "Deals by stage",
            labels: ["Won", "Lost", "Open"],
            series: [{ name: "count", values: [3, 1, 2] }],
        })
        const { container, getByText } = render(<AgentChart chart={chart} />)
        expect(container.querySelector("svg")).toBeTruthy()
        expect(getByText("Deals by stage")).toBeTruthy()
        // One <rect> per bar (plus none for a single series group).
        expect(container.querySelectorAll("rect").length).toBe(3)
    })

    it("renders a polyline path for a line chart", () => {
        const chart = chartFrom({
            type: "line",
            labels: ["Jan", "Feb", "Mar"],
            series: [{ name: "revenue", values: [10, 20, 15] }],
        })
        const { container } = render(<AgentChart chart={chart} />)
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
        const { container } = render(<AgentChart chart={chart} />)
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
        const { container, getByText } = render(<AgentChart chart={chart} />)
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
        const { getByText, container } = render(<AgentChart chart={chart} />)
        getByText("2024")
        getByText("2025")
        // 2 series × 2 points = 4 bars.
        expect(container.querySelectorAll("rect").length).toBe(4)
    })

    it("renders a placeholder message for an all-zero pie", () => {
        const chart = chartFrom({ type: "pie", labels: ["a", "b"], series: [{ values: [0, 0] }] })
        const { getByText } = render(<AgentChart chart={chart} />)
        getByText(/no positive values/i)
    })
})
