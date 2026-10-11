import { Suspense } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const report = { from: "", to: "", seconds: 7200, billable_seconds: 7200, entries: 1, running: 0, by_person: [], by_task: [], truncated: false }
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes("/time?")) return Promise.resolve({ data: { data: report } })
      if (url.includes("/invoices")) return Promise.resolve({ data: { data: { next_number: "INV-7" } } })
      return Promise.resolve({ data: { data: { project_name: "Acme relaunch" } } })
    }),
  },
}))

import InvoicePage from "@/app/invoice/[project]/page"

describe("the invoice page (work.md W54)", () => {
  afterEach(() => cleanup())

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
