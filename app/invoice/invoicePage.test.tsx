import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
// Two billable hours on one task, with no project rates.
const report = { from: "", to: "", seconds: 7200, billable_seconds: 7200, entries: 1, running: 0, by_person: [], by_task: [{ id: "t1", name: "Design", seconds: 7200, billable_seconds: 7200 }], truncated: false }
// The report for a period, by the address asked: every period has time unless a test says otherwise.
let timeFor: (url: string) => typeof report = () => report
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes("/time?")) return Promise.resolve({ data: { data: timeFor(url) } })
      if (url.includes("/invoices")) return Promise.resolve({ data: { data: { next_number: "INV-7" } } })
      return Promise.resolve({ data: { data: { project_name: "Acme relaunch" } } })
    }),
  },
}))

import InvoicePage from "@/app/invoice/[project]/page"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const open = async () => {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <InvoicePage params={Promise.resolve({ project: "p1" })} />
      </Suspense>,
    )
  })
}

describe("the invoice page (work.md W54)", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    timeFor = () => report
  })

  it("bills this month so far when last month has nothing to bill (PTC-41)", async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 10))
    const thisMonth = encodeURIComponent(new Date(2026, 9, 1).toISOString())
    timeFor = (url) => (url.includes(`from=${thisMonth}`) ? { ...report, seconds: 23040, billable_seconds: 23040 } : { ...report, seconds: 0, billable_seconds: 0 })
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <InvoicePage params={Promise.resolve({ project: "p1" })} />
        </Suspense>,
      )
    })
    expect(screen.getByText(/Billable time from 1 Oct 2026 to 15 Oct 2026: 6\.4\d* hours\./)).toBeTruthy()
  })

  it("sits in the app's frame with a way back to the project, the invoice on light paper", async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <InvoicePage params={Promise.resolve({ project: "p1" })} />
        </Suspense>,
      )
    })
    expect(document.querySelector("[data-invoice-page]")!.className).toContain("bg-frame")
    const back = screen.getByRole("link", { name: /Acme relaunch/ })
    expect(back.getAttribute("href")).toBe("/app/project/p1")
    const paper = screen.getByRole("article", { name: "Invoice" })
    expect(paper.className).toContain("invoice-paper")
    expect(paper.className.replace(/print:\S+/g, "")).not.toMatch(/\bborder\b/)
    expect(paper.textContent).toContain("INV-7")
  })
})

// The rate and the tax were read as JavaScript spells numbers: "1,500" an
// hour billed at nothing (the project's rates, here none), and a tax typed
// with a decimal comma was saved as no tax, without a word.
describe("an invoice's rate and tax", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it("are read as the reader writes numbers", async () => {
    await open()
    fireEvent.change(screen.getByLabelText("Hourly rate"), { target: { value: "1,500" } })
    fireEvent.change(screen.getByLabelText("Tax %"), { target: { value: "18.5" } })
    const paper = screen.getByRole("article", { name: "Invoice" })
    expect(paper.textContent).toContain("₹3,000.00")
    expect(paper.textContent).toContain("Tax (18.5%)")
    expect(paper.textContent).toContain("₹3,555.00")
  })

  it("say when they aren't numbers, and aren't saved misread", async () => {
    await open()
    fireEvent.change(screen.getByLabelText("Hourly rate"), { target: { value: "1500" } })
    const tax = screen.getByLabelText("Tax %")
    fireEvent.change(tax, { target: { value: "18,5" } })
    expect(tax.getAttribute("aria-invalid")).toBe("true")
    expect(document.getElementById(tax.getAttribute("aria-describedby")!)?.textContent).toBe("Not a number")
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Save as sent" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
