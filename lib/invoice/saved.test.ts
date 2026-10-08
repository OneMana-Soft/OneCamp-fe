import { describe, expect, it } from "vitest"
import { buildInvoice } from "@/lib/invoice/invoice"
import { linesOf, linesToSave, outstanding, shownStatus, type SavedInvoice } from "@/lib/invoice/saved"

describe("saved invoices", () => {
  it("are overdue when sent and past their due day, never otherwise", () => {
    expect(shownStatus({ status: "sent", due_on: "2026-10-07" }, "2026-10-08")).toBe("overdue")
    expect(shownStatus({ status: "sent", due_on: "2026-10-08" }, "2026-10-08")).toBe("sent")
    expect(shownStatus({ status: "paid", due_on: "2026-01-01" }, "2026-10-08")).toBe("paid")
    expect(shownStatus({ status: "draft", due_on: "2026-01-01" }, "2026-10-08")).toBe("draft")
  })

  it("save the page's lines in hundredths, and show them back the same", () => {
    const report = {
      by_task: [{ id: "t", name: "Write the post", seconds: 12000, billable_seconds: 12000, entries: 1, rated: [{ rate_cents: 9550, billable_seconds: 12000, amount_cents: 31833 }] }],
      by_person: [],
    }
    const page = buildInvoice(report as never, { by: "task", rate: 0, taxPercent: 0 })
    const saved = linesToSave(page.lines)
    expect(saved).toEqual([{ description: "Write the post", hours: 3.33, rate_cents: 9550 }])
    // The server works out 3.33 × 9550 = 31801.5 → 31802, as the page did: 318.02.
    const back = linesOf({ lines: [{ ...saved[0], amount_cents: 31802 }] } as SavedInvoice)
    expect(back[0]).toEqual(page.lines[0])
  })

  it("add up what's owed by currency, from sent invoices only", () => {
    expect(
      outstanding([
        { status: "sent", currency: "USD", total_cents: 1000 },
        { status: "sent", currency: "USD", total_cents: 250 },
        { status: "paid", currency: "USD", total_cents: 9999 },
        { status: "sent", currency: "EUR", total_cents: 700 },
        { status: "draft", currency: "EUR", total_cents: 5 },
      ]),
    ).toEqual({ USD: 1250, EUR: 700 })
  })
})
