import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const BUDGET = { id: "8d78abe2-ad66-493c-9fe0-85a27b66a8bc", name: "Launch budget", visibility: "workspace", created_by: "", created_at: "", updated_at: "" }
let tables: (typeof BUDGET)[] = [BUDGET]
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: tables }, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import TablesPage from "./page"

afterEach(() => {
  cleanup()
  tables = [BUDGET]
})

describe("the tables list", () => {
  it("lists each table as a link to it", () => {
    render(<TablesPage />)
    const link = screen.getByRole("link", { name: /Launch budget/ })
    expect(link.getAttribute("href")).toBe(`/app/tables/${BUDGET.id}`)
  })

  it("with no tables yet, draws a tray over its words and its one action", () => {
    tables = []
    render(<TablesPage />)
    expect(screen.getByRole("heading", { name: "Make your first table" })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: /New table/ }).length).toBeGreaterThan(0)
    const svg = document.querySelector("[data-empty-illustration] svg")
    expect(svg?.getAttribute("class")).toContain("hue-moss")
  })

  it("lists tables on the sheet with no box around them and no trash can on each row", () => {
    render(<TablesPage />)
    const list = document.querySelector("[data-tables-list]") as HTMLElement
    expect(list.className).not.toMatch(/\brounded-lg\b.*\bborder\b|\bborder\b.*\brounded-lg\b/)
    expect(screen.queryByRole("button", { name: /Delete this table/ })).toBeNull()
    // Delete lives in the row's More menu.
    expect(screen.getByRole("button", { name: "More for Launch budget" })).toBeTruthy()
  })

  it("offers the AI bar's suggestions as chips that fill it", () => {
    render(<TablesPage />)
    fireEvent.click(screen.getByRole("button", { name: /Vendor list/ }))
    const input = screen.getByRole("textbox", { name: "Describe a table for AI to build" }) as HTMLInputElement
    expect(input.value).toMatch(/vendor list/i)
  })

  it("filters the list from the search pill", () => {
    tables = [BUDGET, { ...BUDGET, id: "v", name: "Vendors" }]
    render(<TablesPage />)
    fireEvent.change(screen.getByRole("textbox", { name: "Search tables" }), { target: { value: "vend" } })
    expect(screen.queryByRole("link", { name: /Launch budget/ })).toBeNull()
    expect(screen.getByRole("link", { name: /Vendors/ })).toBeTruthy()
  })
})
