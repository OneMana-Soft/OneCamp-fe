import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

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
    expect(screen.getByRole("heading", { name: "No tables yet" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Create your first table/ })).toBeTruthy()
    const svg = document.querySelector("[data-empty-illustration] svg")
    expect(svg?.getAttribute("class")).toContain("hue-sky")
  })
})
