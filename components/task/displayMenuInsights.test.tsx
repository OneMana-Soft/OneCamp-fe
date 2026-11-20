import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable, type ColumnFiltersState } from "@tanstack/react-table"

import { DisplayMenuBody } from "@/components/task/displayMenu"
import { DUE_WEEK } from "@/lib/tasks/listAddress"

// Display's Insights (B9-b1): a project's list opens its report narrowed to
// the list's filters and search, under the saved view's name when one shows.

const h = vi.hoisted(() => ({ views: [] as { id: string; name: string; state: unknown }[] }))
vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: () => ({ views: h.views, save: vi.fn(), busy: false }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }) }))
// The project's SLA view (linear-24): SLAs off, so Display offers no SLA grouping or ordering.
vi.mock("@/hooks/useSlaView", () => ({ useSlaView: () => ({ shows: false, refused: true }) }))

afterEach(() => {
  cleanup()
  h.views = []
})

function Display({ projectId, filters = [], search = "" }: { projectId?: string; filters?: ColumnFiltersState; search?: string }) {
  const table = useReactTable({ data: [], columns: [], getCoreRowModel: getCoreRowModel(), state: { columnFilters: filters, globalFilter: search } })
  return (
    <DisplayMenuBody
      projectId={projectId}
      table={table}
      grouping="status"
      onGrouping={() => {}}
      props={[]}
      allProps={[]}
      onProps={() => {}}
      showCompleted="all"
      onShowCompleted={() => {}}
      layout="list"
      onReset={() => {}}
    />
  )
}

const insights = () => new URL(screen.getByRole("link", { name: /^Insights for this view/ }).getAttribute("href")!, "http://x")

describe("Display's Insights", () => {
  it("opens the project's report with the list's filters and search", () => {
    render(<Display projectId="p1" filters={[{ id: "task_priority", value: ["high"] }]} search=" launch " />)
    const href = insights()
    expect(href.pathname).toBe("/app/project")
    expect(href.searchParams.get("view")).toBe("reports")
    expect(href.searchParams.get("projects")).toBe("p1")
    expect(JSON.parse(href.searchParams.get("filters")!)).toEqual([
      { id: "task_priority", value: ["high"] },
      { id: "task_name", value: "launch" },
    ])
    expect(href.searchParams.get("name")).toBeNull()
  })

  it("names the saved view that shows", () => {
    const filters = [{ id: "task_priority", value: ["high"] }]
    h.views = [{ id: "v1", name: "High work", state: { filters, sort: [], columns: {} } }]
    render(<Display projectId="p1" filters={filters} />)
    expect(insights().searchParams.get("name")).toBe("High work")
  })

  it("says the report can't keep due this week, the list's own filter", () => {
    render(<Display projectId="p1" filters={[{ id: DUE_WEEK, value: "1" }]} />)
    expect(screen.getByText("without due this week")).toBeInTheDocument()
    expect(insights().searchParams.get("filters")).toBeNull()
  })

  it("on My tasks opens the report of the reader's own work, with the list's filters (L32)", () => {
    render(<Display filters={[{ id: "task_priority", value: ["high"] }]} />)
    const href = insights()
    expect(href.searchParams.get("projects")).toBeNull()
    expect(href.searchParams.get("mine")).toBe("1")
    expect(JSON.parse(href.searchParams.get("filters")!)).toEqual([{ id: "task_priority", value: ["high"] }])
  })
})
