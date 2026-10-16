import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const BUDGET = { id: "8d78abe2-ad66-493c-9fe0-85a27b66a8bc", name: "Launch budget", visibility: "workspace", created_by: "", created_at: "", updated_at: "" }
let tables: (typeof BUDGET)[] = [BUDGET]
// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: tables }, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const { updateTable, generateTable } = vi.hoisted(() => ({ updateTable: vi.fn(), generateTable: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/tableService")>()), updateTable, generateTable }))

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
    // One primary on the page: the header's. The tray's own button is secondary.
    const primaries = screen.getAllByRole("button").filter((b) => /\bbg-brand\b/.test(b.className))
    expect(primaries).toHaveLength(1)
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

// TAB-BUG-12: a rename from the list sent the list's whole copy of the table,
// so a copy from before the table was made private put it back on show.
describe("renaming a table from the list", () => {
  it("sends the name alone", async () => {
    updateTable.mockResolvedValue(BUDGET)
    render(<TablesPage />)
    const more = screen.getByRole("button", { name: "More for Launch budget" })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(more, { key: "Enter" })
    const rename = screen.getByRole("menuitem", { name: "Rename" })
    fireEvent.pointerDown(rename)
    fireEvent.click(rename)
    const input = await screen.findByRole("textbox", { name: "Table name" })
    fireEvent.change(input, { target: { value: "Launch budget 2027" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(updateTable).toHaveBeenCalledWith(BUDGET.id, { name: "Launch budget 2027" }))
  })
})

// TAB-BUG-6: a table AI builds may hold rows from the asker's private
// messages, so it's made private, and its page says so when it opens.
// With AI off, or on the edition without it, Generate could only fail.
describe("the tables list where AI is off", () => {
  it("offers no AI bar and no suggestions", () => {
    ai.on = false
    try {
      render(<TablesPage />)
      expect(screen.queryByRole("textbox", { name: "Describe a table for AI to build" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Generate" })).toBeNull()
      expect(document.querySelector("[data-ai-bar]")).toBeNull()
    } finally {
      ai.on = true
    }
  })
})

describe("a table the AI bar builds", () => {
  it("opens marked as made by AI", async () => {
    generateTable.mockResolvedValue({ ...BUDGET, id: "made", visibility: "private" })
    render(<TablesPage />)
    fireEvent.change(screen.getByRole("textbox", { name: "Describe a table for AI to build" }), { target: { value: "My plans this week" } })
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/tables/made?made=ai"))
  })
})
