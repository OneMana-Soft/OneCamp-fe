import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The address's query: a saved invoice opens with ?id= (the void tests below).
const nav = vi.hoisted(() => ({ query: "" }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.query), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
const toasted = vi.hoisted(() => [] as unknown[])
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasted.push(t) }) }))
// A saved invoice, as GET /project/p1/invoices/inv1 answers it; its status changes as the page sends one.
const stored = vi.hoisted(() => ({
  invoice: null as null | Record<string, unknown>,
  sent: [] as unknown[],
  // The server's refusal, and the state it was in meanwhile: paid in another tab.
  refuse: null as null | { msg: string; now: string },
  refused: null as unknown,
}))
// Two billable hours on one task, with no project rates.
const report = { from: "", to: "", seconds: 7200, billable_seconds: 7200, entries: 1, running: 0, by_person: [], by_task: [{ id: "t1", name: "Design", seconds: 7200, billable_seconds: 7200 }], truncated: false }
// The report for a period, by the address asked: every period has time unless a test says otherwise.
let timeFor: (url: string) => typeof report = () => report
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes("/time?")) return Promise.resolve({ data: { data: timeFor(url) } })
      if (url.includes("/invoices/inv1")) return Promise.resolve({ data: { data: stored.invoice } })
      if (url.includes("/invoices")) return Promise.resolve({ data: { data: { next_number: "INV-7" } } })
      return Promise.resolve({ data: { data: { project_name: "Acme relaunch" } } })
    }),
    post: vi.fn((url: string, body: { status: string }) => {
      stored.sent.push({ url, body })
      if (stored.refuse) {
        stored.invoice = { ...stored.invoice!, status: stored.refuse.now }
        return Promise.reject((stored.refused = Object.assign(new Error("Request failed with status code 400"), { isAxiosError: true, response: { status: 400, data: { msg: stored.refuse.msg } } })))
      }
      stored.invoice = { ...stored.invoice!, status: body.status }
      return Promise.resolve({ data: { data: stored.invoice } })
    }),
  },
}))

import InvoicePage from "@/app/invoice/[project]/page"
import { pinTestClock } from "@/lib/testing/testClock"
import { wasSaid } from "@/lib/http/writeSaid"

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
    // In the reader's currency (an en-US test browser), on purpose: it was rupees for everyone (ADMIN-17).
    expect(paper.textContent).toContain("$3,000.00")
    expect(paper.textContent).toContain("Tax (18.5%)")
    expect(paper.textContent).toContain("$3,555.00")
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

// ADMIN-17: Void posted at once, on a sent invoice and on a paid one, though
// it can't be undone. Now it is Stripe's rule: void only from sent, behind a
// confirm that names the number; a paid invoice is marked unpaid first.
describe("voiding an invoice", () => {
  const saved = (status: string) => ({
    id: "inv1", project_id: "p1", number: "INV-7", status, issued_on: "2026-10-01", due_on: "2026-10-16", currency: "USD",
    seller: { name: "Kestrel" , address: "" }, client: { name: "Acme", address: "" }, lines: [{ description: "Design", hours: 2, rate_cents: 10000, amount_cents: 20000 }],
    subtotal_cents: 20000, tax_percent: 0, tax_cents: 0, total_cents: 20000, notes: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    nav.query = ""
    stored.sent = []
    stored.refuse = null
    toasted.length = 0
  })

  it("Void on a sent invoice asks first, naming its number; Keep it changes nothing", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("sent")
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    const ask = await screen.findByRole("alertdialog")
    expect(ask).toHaveTextContent("Void invoice INV-7?")
    expect(ask).toHaveTextContent("Its number is retired and it can't be paid. This can't be undone; make a new invoice to bill again.")
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    expect(stored.sent).toEqual([])

    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Void invoice" }))
    })
    expect(stored.sent).toEqual([{ url: "/project/p1/invoices/inv1/status", body: { status: "void" } }])
    await waitFor(() => expect(toasted).toContainEqual({ title: "Voided" }))
  })

  it("a refusal says the server's words in the confirm, and the page shows what the invoice is now", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("sent")
    stored.refuse = { msg: "A paid invoice is marked unpaid before it is voided.", now: "paid" }
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Void invoice" }))
    })
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("A paid invoice is marked unpaid before it is voided.")
    // Said once: the confirm claims it, so the request's own toast stays quiet (V-397).
    expect(wasSaid(stored.refused)).toBe(true)
    expect(toasted).not.toContainEqual(expect.objectContaining({ title: "Voided" }))
    // Paid meanwhile: behind the confirm, the page offers Mark unpaid now.
    expect(await screen.findByRole("button", { name: "Mark unpaid", hidden: true })).toBeTruthy()
  })

  // DESIGN-BUILD-147: Void, the confirm's opener, is gone once the invoice is void or paid, so the
  // confirm can't hand focus back to it; the page gives focus a home instead of the page itself.
  it("once voided, focus goes to Print, the action left where Void was", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("sent")
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Void invoice" }))
    })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Print or save as PDF" })))
  })

  it("after a refusal, Keep it leaves focus on Mark unpaid, the step the refusal names", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("sent")
    stored.refuse = { msg: "A paid invoice is marked unpaid before it is voided.", now: "paid" }
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Void invoice" }))
    })
    await screen.findByRole("button", { name: "Mark unpaid", hidden: true })
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark unpaid" })))
  })

  // The home gate: focus moves only when the confirm has just closed. A status that loads or
  // changes outside the confirm, as when a saved draft opens, leaves focus where it was.
  it("opening a saved draft leaves focus where it was, not on an action", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("draft")
    await open()
    await screen.findByRole("button", { name: "Mark sent" })
    expect(document.activeElement).toBe(document.body)
  })

  it("a paid invoice offers Mark unpaid, never Void", async () => {
    nav.query = "id=inv1"
    stored.invoice = saved("paid")
    await open()
    expect(screen.getByRole("button", { name: "Mark unpaid" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull()
    expect(screen.getByText("Paid. To void it, mark it unpaid first.")).toBeTruthy()
  })

  it("with no project currency an en-US reader starts in USD", async () => {
    await open()
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("USD")
  })
})

// ADMIN-17 (CR-280): a new invoice starts in its reader's currency, from their region; one this
// browser saved for the client still wins over the region.
describe("a new invoice's currency", () => {
  let language: { mockRestore: () => void } | undefined
  const reader = (tag: string) => {
    language = vi.spyOn(navigator, "language", "get").mockReturnValue(tag)
  }
  afterEach(() => {
    cleanup()
    localStorage.clear()
    language?.mockRestore()
  })

  it("is pounds for an en-GB reader", async () => {
    reader("en-GB")
    await open()
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("GBP")
  })

  it("stays rupees when this browser saved rupees for the client, though the reader is en-GB", async () => {
    reader("en-GB")
    localStorage.setItem("oc_invoice_client_p1", JSON.stringify({ currency: "INR" }))
    await open()
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveTextContent("INR")
  })
})
