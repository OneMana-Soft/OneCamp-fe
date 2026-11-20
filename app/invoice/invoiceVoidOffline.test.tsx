import { Suspense } from "react"
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Void's confirm is a chunk of its own, fetched on the first press (lib/lazy/lazyDialog). When it
// can't come (offline, a dropped connection), the press says so and closes, the invoice stays as
// it was, and the next press tries again. With raw next/dynamic, Void opened nothing, said
// nothing and stayed dead for the visit (CR-B85 F1, the invoice half of V-978).

const hoisted = vi.hoisted(() => ({ confirmFails: true, asked: 0, toasted: [] as unknown[] }))
vi.mock("@/components/dialog/confirmAlertDialog", async (original) => {
  if (hoisted.confirmFails) throw new Error("Loading chunk 9 failed")
  const real = await original<Record<string, unknown>>()
  // Counted as the page's loader takes the confirm from its module: once per fetch, however the module is cached.
  return {
    ...real,
    get ConfirmAlertDialog() {
      hoisted.asked++
      return real.ConfirmAlertDialog
    },
  }
})
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: unknown) => (hoisted.toasted.push(t), { id: "1", dismiss: () => {}, update: () => {} })
  return { toast, useToast: () => ({ toast }) }
})
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("id=inv1"), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const sent = {
  id: "inv1", project_id: "p1", number: "INV-7", status: "sent", issued_on: "2026-10-01", due_on: "2026-10-16", currency: "USD",
  seller: { name: "Kestrel", address: "" }, client: { name: "Acme", address: "" }, lines: [{ description: "Design", hours: 2, rate_cents: 10000, amount_cents: 20000 }],
  subtotal_cents: 20000, tax_percent: 0, tax_cents: 0, total_cents: 20000, notes: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
}
const report = { from: "", to: "", seconds: 7200, billable_seconds: 7200, entries: 1, running: 0, by_person: [], by_task: [{ id: "t1", name: "Design", seconds: 7200, billable_seconds: 7200 }], truncated: false }
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes("/time?")) return Promise.resolve({ data: { data: report } })
      if (url.includes("/invoices/inv1")) return Promise.resolve({ data: { data: sent } })
      if (url.includes("/invoices")) return Promise.resolve({ data: { data: { next_number: "INV-8" } } })
      return Promise.resolve({ data: { data: { project_name: "Acme relaunch" } } })
    }),
    post: vi.fn(),
  },
}))

import InvoicePage from "@/app/invoice/[project]/page"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("voiding when the confirm's code can't come", () => {
  it("says the confirm couldn't open, keeps the invoice, and the next press opens it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <InvoicePage params={Promise.resolve({ project: "p1" })} />
        </Suspense>,
      )
    })
    fireEvent.click(await screen.findByRole("button", { name: "Void" }))
    await waitFor(() =>
      expect(hoisted.toasted).toContainEqual({ title: "Couldn't open the void confirmation", description: "Check your connection, then try again.", variant: "destructive" }),
    )
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Void" })).toBeTruthy()

    hoisted.confirmFails = false
    fireEvent.click(screen.getByRole("button", { name: "Void" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Void invoice INV-7?")
    expect(hoisted.toasted).toHaveLength(1)
  })
})

/** The invoice as a fresh load: its Void's confirm not asked for yet (lib/lazy/lazyDialog keeps its code once in). */
async function freshVoid() {
  vi.resetModules()
  const Page = (await import("@/app/invoice/[project]/page")).default
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <Page params={Promise.resolve({ project: "p1" })} />
      </Suspense>,
    )
  })
  return screen.findByRole("button", { name: "Void" })
}

describe("Void's confirm, asked for ahead of the press (CR-311 F3)", () => {
  /** Long enough for a second fetch, had one been asked, to have landed. */
  const settle = () => act(() => new Promise((done) => setTimeout(done, 50)))

  it("is asked for as Void is pointed at, once though it's then focused, and opens nothing", async () => {
    hoisted.confirmFails = false
    hoisted.asked = 0
    const voidButton = await freshVoid()
    expect(hoisted.asked).toBe(0)
    fireEvent.pointerEnter(voidButton)
    await waitFor(() => expect(hoisted.asked).toBe(1))
    fireEvent.focus(voidButton)
    await settle()
    expect(hoisted.asked).toBe(1)
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("is asked for as Void is focused, by keyboard, before any press", async () => {
    hoisted.confirmFails = false
    hoisted.asked = 0
    const voidButton = await freshVoid()
    expect(hoisted.asked).toBe(0)
    fireEvent.focus(voidButton)
    await waitFor(() => expect(hoisted.asked).toBe(1))
    await settle()
    expect(hoisted.asked).toBe(1)
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})
