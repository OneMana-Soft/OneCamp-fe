import { describe, expect, it } from "vitest"
import { normalizeChartSpec } from "@/lib/utils/chartSpec"

describe("normalizeChartSpec", () => {
    it("returns null for invalid / empty / non-object input", () => {
        expect(normalizeChartSpec("")).toBeNull()
        expect(normalizeChartSpec("   ")).toBeNull()
        expect(normalizeChartSpec("not json")).toBeNull()
        expect(normalizeChartSpec("{ broken")).toBeNull()
        expect(normalizeChartSpec(42)).toBeNull()
        expect(normalizeChartSpec(null)).toBeNull()
        expect(normalizeChartSpec({})).toBeNull()
    })

    it("returns null when there is no finite numeric data", () => {
        expect(normalizeChartSpec({ type: "bar", labels: ["a"], series: [{ values: ["x", null] }] })).toBeNull()
        expect(normalizeChartSpec({ series: [] })).toBeNull()
    })

    it("parses a raw JSON string", () => {
        const c = normalizeChartSpec('{"type":"bar","labels":["a","b"],"series":[{"name":"S","values":[1,2]}]}')
        expect(c).not.toBeNull()
        expect(c!.type).toBe("bar")
        expect(c!.labels).toEqual(["a", "b"])
        expect(c!.series[0]).toEqual({ name: "S", values: [1, 2] })
    })

    it("accepts a parsed object directly", () => {
        const c = normalizeChartSpec({ type: "line", labels: ["a"], series: [{ values: [3] }] })
        expect(c!.type).toBe("line")
        expect(c!.series[0].name).toBe("Series 1")
    })

    it("defaults an unknown/missing type to bar and lowercases valid types", () => {
        expect(normalizeChartSpec({ labels: ["a"], series: [{ values: [1] }] })!.type).toBe("bar")
        expect(normalizeChartSpec({ type: "PIE", series: [{ values: [1] }] })!.type).toBe("pie")
        expect(normalizeChartSpec({ type: "wat", series: [{ values: [1] }] })!.type).toBe("bar")
    })

    it("pads short/missing labels with 1-based indices", () => {
        const c = normalizeChartSpec({ series: [{ values: [1, 2, 3] }] })
        expect(c!.labels).toEqual(["1", "2", "3"])
        const c2 = normalizeChartSpec({ labels: ["only"], series: [{ values: [1, 2] }] })
        expect(c2!.labels).toEqual(["only", "2"])
    })

    it("coerces non-finite values to 0 but keeps the series if any value is finite", () => {
        const c = normalizeChartSpec({ labels: ["a", "b", "c"], series: [{ values: [1, "NaN", null] }] })
        expect(c!.series[0].values).toEqual([1, 0, 0])
    })

    it("pads/truncates series to the label count", () => {
        const c = normalizeChartSpec({ labels: ["a", "b", "c"], series: [{ values: [5] }] })
        expect(c!.series[0].values).toEqual([5, 0, 0])
    })

    it("parses numeric strings with thousands separators", () => {
        const c = normalizeChartSpec({ labels: ["a"], series: [{ values: ["1,234"] }] })
        expect(c!.series[0].values).toEqual([1234])
    })

    it("accepts a bare values array as a single series", () => {
        const c = normalizeChartSpec({ type: "line", labels: ["a", "b"], values: [1, 2] })
        expect(c!.series).toHaveLength(1)
        expect(c!.series[0].values).toEqual([1, 2])
    })

    it("accepts a flat number array given as series", () => {
        const c = normalizeChartSpec({ labels: ["a", "b"], series: [10, 20] })
        expect(c!.series).toHaveLength(1)
        expect(c!.series[0].values).toEqual([10, 20])
    })

    it("keeps only the first series for a pie chart", () => {
        const c = normalizeChartSpec({
            type: "pie",
            labels: ["a", "b"],
            series: [{ name: "one", values: [1, 2] }, { name: "two", values: [3, 4] }],
        })
        expect(c!.series).toHaveLength(1)
        expect(c!.series[0].name).toBe("one")
    })

    it("caps the number of series at 8", () => {
        const series = Array.from({ length: 20 }, (_, i) => ({ values: [i + 1] }))
        const c = normalizeChartSpec({ labels: ["a"], series })
        expect(c!.series.length).toBe(8)
    })

    it("caps the number of points at 60", () => {
        const values = Array.from({ length: 200 }, (_, i) => i)
        const c = normalizeChartSpec({ series: [{ values }] })
        expect(c!.labels.length).toBe(60)
        expect(c!.series[0].values.length).toBe(60)
    })

    it("trims and caps an overlong title", () => {
        const c = normalizeChartSpec({ title: "  hi  ", series: [{ values: [1] }] })
        expect(c!.title).toBe("hi")
        const long = normalizeChartSpec({ title: "x".repeat(500), series: [{ values: [1] }] })
        expect(long!.title.length).toBe(120)
    })
})
