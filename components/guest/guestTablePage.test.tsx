import { Suspense } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const getGuestTable = vi.fn()
vi.mock("@/services/guestService", () => ({ getGuestTable: (token: string) => getGuestTable(token) }))
vi.mock("@/components/guest/GuestTableViewer", () => ({ GuestTableViewer: () => null }))

import GuestTablePage from "@/app/guest/t/[token]/page"

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GuestTablePage params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}

describe("a table shared with a guest", () => {
  afterEach(() => cleanup())

  it("is headed with its name, which a long name doesn't break", async () => {
    const name = "Vendor shortlist for the Q4 brand refresh, with costs and contacts"
    getGuestTable.mockResolvedValue({ ok: true, data: { table: { name }, fields: [], rows: [] } })
    await open()
    const h1 = screen.getByRole("heading", { level: 1, name })
    expect(h1.className).toMatch(/\btruncate\b/)
    expect(h1).toHaveAttribute("title", name)
  })

  it("says it's a shared table when it has no name", async () => {
    getGuestTable.mockResolvedValue({ ok: true, data: { table: { name: "" }, fields: [], rows: [] } })
    await open()
    expect(screen.getByRole("heading", { level: 1, name: "Shared table" })).toBeInTheDocument()
  })
})
