import { describe, expect, it } from "vitest"
import { buildInvoice, defaultPeriod, money, round2, suggestNumber, type Period } from "./invoice"
import type { TimeReport } from "@/lib/tasks/time"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const report = {
  by_task: [
    { id: "a", name: "Design", seconds: 7200, billable_seconds: 5400 }, // 1.5h billable
    { id: "b", name: "Internal", seconds: 3600, billable_seconds: 0 },
    { id: "c", name: "Build", seconds: 1000, billable_seconds: 1000 }, // 0.28h
  ],
  by_person: [{ id: "p", name: "Maya", seconds: 11800, billable_seconds: 6400 }], // 1.78h
}

describe("buildInvoice", () => {
  it("bills billable hours only, line by line", () => {
    const inv = buildInvoice(report, { by: "task", rate: 2000, taxPercent: 18 })
    expect(inv.lines.map((l) => [l.description, l.hours, l.amount])).toEqual([
      ["Design", 1.5, 3000],
      ["Build", 0.28, 560],
    ])
    expect(inv.subtotal).toBe(3560)
    expect(inv.tax).toBe(640.8)
    expect(inv.total).toBe(4200.8)
    expect(inv.hours).toBe(1.78)
  })
  it("can bill by person", () => {
    expect(buildInvoice(report, { by: "person", rate: 100, taxPercent: 0 }).lines).toEqual([{ description: "Maya", hours: 1.78, rate: 100, amount: 178 }])
  })
  it("bills at the project's rates when no rate is typed, each line multiplying out, and a typed rate overrides them", () => {
    const priced = {
      by_task: [
        // Two hours on Design, by two people on different rates.
        {
          id: "a",
          name: "Design",
          seconds: 7200,
          billable_seconds: 7200,
          amount_cents: 15000,
          rated: [
            { rate_cents: 9000, billable_seconds: 3600 },
            { rate_cents: 6000, billable_seconds: 3600 },
          ],
        },
      ],
      by_person: [
        { id: "p", name: "Maya", seconds: 3600, billable_seconds: 3600, amount_cents: 9000, rate_cents: 9000 },
        { id: "q", name: "Sam", seconds: 4000, billable_seconds: 4000, amount_cents: 6667, rate_cents: 6000 }, // 1.11 h
      ],
    }
    expect(buildInvoice(priced, { by: "person", rate: 0, taxPercent: 0 }).lines).toEqual([
      { description: "Maya", hours: 1, rate: 90, amount: 90 },
      // 1.11 h as shown, times 60: what a client can check, not the report's 66.67.
      { description: "Sam", hours: 1.11, rate: 60, amount: 66.6 },
    ])
    // A task worked at two rates is a line per rate.
    expect(buildInvoice(priced, { by: "task", rate: 0, taxPercent: 0 }).lines).toEqual([
      { description: "Design", hours: 1, rate: 90, amount: 90 },
      { description: "Design", hours: 1, rate: 60, amount: 60 },
    ])
    expect(buildInvoice(priced, { by: "task", rate: 100, taxPercent: 0 }).total).toBe(200)
    for (const l of buildInvoice(priced, { by: "person", rate: 0, taxPercent: 0 }).lines) expect(l.amount).toBe(Math.round(l.hours * l.rate * 100) / 100)
  })
  it("treats a missing or negative rate or tax as none", () => {
    const inv = buildInvoice(report, { by: "task", rate: Number.NaN, taxPercent: -5 })
    expect(inv.total).toBe(0)
    expect(inv.tax).toBe(0)
  })
  it("rounds money to two places", () => expect(round2(1.005)).toBe(1.01))
})

describe("formatting", () => {
  it("formats money in the currency", () => expect(money("USD", "en-US")(1234.5)).toBe("$1,234.50"))
  it("survives an unknown currency", () => expect(money("XYZ1", "en-US")(2)).toBe("2.00 XYZ1"))
  it("suggests an invoice number", () => expect(suggestNumber("Q4 launch", new Date(2026, 9, 5))).toBe("QL-2026-10"))
})

describe("defaultPeriod (PTC-41)", () => {
  const now = new Date(2026, 9, 15, 10) // 15 Oct 2026
  const timeIn = (billable: Record<string, number>) => {
    const asked: string[] = []
    const timeOf = async (p: Period): Promise<TimeReport> => {
      const key = `${p.from.getMonth() + 1}/${p.from.getDate()}`
      asked.push(key)
      const b = billable[key] ?? 0
      return { from: p.from.toISOString(), to: p.to.toISOString(), seconds: b, billable_seconds: b, entries: b ? 1 : 0, running: 0, by_person: [], by_task: [], truncated: false }
    }
    return { timeOf, asked }
  }

  it("bills last month, as a monthly bill does, when it has billable time", async () => {
    const { timeOf, asked } = timeIn({ "9/1": 3600 })
    const { period, report } = await defaultPeriod(timeOf, now)
    expect([period.from, period.to]).toEqual([new Date(2026, 8, 1), new Date(2026, 9, 1)])
    expect(report.billable_seconds).toBe(3600)
    expect(asked).toEqual(["9/1"])
  })

  it("bills this month so far when last month has nothing to bill and this month has", async () => {
    const { timeOf, asked } = timeIn({ "10/1": 23040 })
    const { period, report } = await defaultPeriod(timeOf, now)
    expect([period.from, period.to]).toEqual([new Date(2026, 9, 1), new Date(2026, 9, 16)])
    expect(report.billable_seconds).toBe(23040)
    expect(asked).toEqual(["9/1", "10/1"])
  })

  it("stays on last month when neither has anything to bill", async () => {
    const { timeOf } = timeIn({})
    const { period } = await defaultPeriod(timeOf, now)
    expect(period.from).toEqual(new Date(2026, 8, 1))
  })
})
