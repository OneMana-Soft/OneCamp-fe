import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const { createRow } = vi.hoisted(() => ({ createRow: vi.fn() }))
vi.mock("@/services/tableService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/tableService")>()
  return { ...real, createRow }
})

import { DataTableCalendar } from "./DataTableCalendar"
import { localDay } from "@/lib/utils/timeZone"
import type { TableField, TableRow } from "@/services/tableService"

const TABLE = "7ab1e000-0000-4000-8000-000000000001"
const field = (id: string, name: string, type: TableField["type"], position: number): TableField => ({ id, table_id: TABLE, name, type, config: "{}", position })
const FIELDS = [field("f-name", "Item", "text", 0), field("f-due", "Due", "date", 1)]
const today = new Date()
const row = (id: string, name: string, day: Date): TableRow => ({ id, table_id: TABLE, values: JSON.stringify({ "f-name": name, "f-due": localDay(day) }), position: 0, created_at: "", updated_at: "" })

afterEach(cleanup)

// content.md T17: a table's calendar is the Calendar's month, not a second
// design of it. It started on Sunday, filled today with the brand, and its
// chips couldn't be opened.
describe("a table's calendar view", () => {
  it("starts the week where the Calendar does, with weekends set apart", () => {
    render(<DataTableCalendar tableId={TABLE} fields={FIELDS} rows={[]} canManage onChange={() => {}} month={new Date(2026, 9, 1)} />)
    const heads = Array.from(document.querySelectorAll("[data-month-grid] > div")).slice(0, 7).map((d) => d.textContent)
    expect(heads).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(document.querySelectorAll("[data-weekend]").length).toBeGreaterThan(0)
  })

  it("rings today in the brand instead of filling it", () => {
    render(<DataTableCalendar tableId={TABLE} fields={FIELDS} rows={[]} canManage onChange={() => {}} month={new Date(today.getFullYear(), today.getMonth(), 1)} />)
    const cell = document.querySelector("[data-today]")!
    expect(cell).toBeTruthy()
    expect(cell.innerHTML).toMatch(/ring-brand/)
    expect(cell.innerHTML).not.toMatch(/bg-primary/)
  })

  it("opens a row's record from its chip", () => {
    const open = vi.fn()
    render(<DataTableCalendar tableId={TABLE} fields={FIELDS} rows={[row("r1", "Launch film edit", today)]} canManage onChange={() => {}} month={new Date(today.getFullYear(), today.getMonth(), 1)} onOpenRow={open} />)
    fireEvent.click(screen.getByRole("button", { name: "Launch film edit" }))
    expect(open).toHaveBeenCalledWith("r1")
  })
})

// A day drew every row on it; the TAB-BUG-2 amendment caps it at three.
describe("a busy day", () => {
  it("draws three rows and \"+N more\", which lists them all", () => {
    const open = vi.fn()
    const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`, `Post ${i}`, today))
    render(<DataTableCalendar tableId={TABLE} fields={FIELDS} rows={rows} canManage onChange={() => {}} month={new Date(today.getFullYear(), today.getMonth(), 1)} onOpenRow={open} />)
    expect(document.querySelectorAll("[data-table-calendar-row]")).toHaveLength(3)
    fireEvent.click(screen.getByRole("button", { name: "+9 more" }))
    expect(document.querySelectorAll("[data-table-calendar-row]")).toHaveLength(15)
    fireEvent.click(screen.getAllByRole("button", { name: "Post 11" })[0])
    expect(open).toHaveBeenCalledWith("r11")
  })
})

// QA PG2-11 (14 Oct): on a phone the month drew a "+" in every day and chips
// cut to a letter. A phone's month is dots per day and the picked day's rows.
describe("a table's calendar on a phone", () => {
  const PHONE_FIELDS = [...FIELDS, field("f-cost", "Cost", "number", 2)]
  const on = (id: string, name: string, day: Date, cost: number): TableRow => ({ ...row(id, name, day), values: JSON.stringify({ "f-name": name, "f-due": localDay(day), "f-cost": cost }) })
  const month = new Date(today.getFullYear(), today.getMonth(), 1)
  const other = new Date(today.getFullYear(), today.getMonth(), today.getDate() === 10 ? 11 : 10)
  const rows = [on("r1", "Catering deposit", today, 1200), on("r2", "Printed programmes", today, 300), on("r3", "Venue walk-through", other, 0)]
  const phone = (onOpenRow = vi.fn()) => render(<DataTableCalendar tableId={TABLE} fields={PHONE_FIELDS} rows={rows} canManage onChange={() => {}} month={month} compact onOpenRow={onOpenRow} />)

  it("draws a dot per row on a day, no + in any day, and today's rows by title and field", () => {
    const open = vi.fn()
    phone(open)
    expect(document.querySelector(`[data-day="${localDay(today)}"] [data-day-dots]`)?.getAttribute("data-day-dots")).toBe("2")
    expect(screen.queryAllByRole("button", { name: /^Add a row on/ })).toHaveLength(1)
    const day = document.querySelector(`[data-table-calendar-day="${localDay(today)}"]`) as HTMLElement
    expect(within(day).getByRole("heading", { level: 2, name: "Today" })).toBeTruthy()
    expect(document.querySelector(`[data-day="${localDay(today)}"]`)?.getAttribute("aria-current")).toBe("date")
    expect(document.querySelector(`[data-day="${localDay(other)}"]`)?.hasAttribute("aria-current")).toBe(false)
    const first = within(day).getAllByRole("button").find((b) => b.textContent?.includes("Catering deposit"))!
    expect(first.textContent).toContain("Cost 1,200")
    fireEvent.click(first)
    expect(open).toHaveBeenCalledWith("r1")
  })

  it("lists the day tapped, and adds a row on it", async () => {
    createRow.mockResolvedValue({ ...row("new", "", other), id: "new" })
    phone()
    fireEvent.click(document.querySelector(`[data-day="${localDay(other)}"]`)!)
    const day = document.querySelector(`[data-table-calendar-day="${localDay(other)}"]`) as HTMLElement
    expect(within(day).getByText("Venue walk-through")).toBeTruthy()
    expect(within(day).queryByText("Catering deposit")).toBeNull()
    await act(async () => fireEvent.click(within(day).getByRole("button", { name: /^Add a row on/ })))
    expect(createRow).toHaveBeenCalledWith(TABLE, { "f-due": localDay(other) })
  })
})
