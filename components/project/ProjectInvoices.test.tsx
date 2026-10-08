import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { SavedInvoice } from "@/lib/invoice/saved"

let invoices: Partial<SavedInvoice>[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { invoices, next_number: "QL-0004" } }, isLoading: false, isError: undefined, mutate: vi.fn() }),
}))
vi.mock("@/lib/utils/timeZone", () => ({ localDay: () => "2026-10-08" }))

const { ProjectInvoices } = await import("@/components/project/ProjectInvoices")

const inv = (over: Partial<SavedInvoice>): Partial<SavedInvoice> => ({
  id: over.number, number: "QL-0001", status: "sent", issued_on: "2026-09-01", due_on: "2026-09-16", currency: "USD", total_cents: 100000,
  client: { name: "Northwind", address: "" }, ...over,
})

afterEach(() => {
  cleanup()
  invoices = []
})

describe("a project's invoices", () => {
  it("say which are owed, paid and late, and what's still owed", () => {
    invoices = [
      inv({ number: "QL-0003", status: "draft", due_on: "2026-10-30", total_cents: 5000 }),
      inv({ number: "QL-0002", status: "sent", due_on: "2026-10-01", total_cents: 42000 }),
      inv({ number: "QL-0001", status: "paid", total_cents: 99900 }),
    ]
    render(<ProjectInvoices projectId="p" />)
    const rows = screen.getAllByRole("link")
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/invoice/p?id=QL-0003", "/invoice/p?id=QL-0002", "/invoice/p?id=QL-0001"])
    expect(within(rows[1]).getByText("Overdue")).toBeTruthy()
    expect(within(rows[2]).getByText("Paid")).toBeTruthy()
    expect(within(rows[2]).getByText(/Issued/)).toBeTruthy()
    // Owed is the sent one only: not the draft, not the paid one.
    expect(screen.getByText(/^Owed:/).textContent).toBe("Owed: $420.00")
  })

  it("explain how to start when there are none", () => {
    render(<ProjectInvoices projectId="p" />)
    expect(screen.getByText(/None saved yet/)).toBeTruthy()
  })
})
