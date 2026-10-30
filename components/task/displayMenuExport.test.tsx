import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"

import { DisplayMenuBody } from "@/components/task/displayMenu"

vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: () => ({ views: [], save: vi.fn(), busy: false }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }) }))

afterEach(cleanup)

function Display({ onExport }: { onExport?: () => Promise<void> }) {
  const table = useReactTable({ data: [], columns: [], getCoreRowModel: getCoreRowModel() })
  return (
    <DisplayMenuBody
      projectId="p"
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
      onExport={onExport}
    />
  )
}

describe("Display's Export CSV", () => {
  it("saves the list once, and says it is working until the file is made", async () => {
    let done = () => {}
    const onExport = vi.fn(() => new Promise<void>((resolve) => (done = resolve)))
    render(<Display onExport={onExport} />)
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }))
    const working = screen.getByRole("button", { name: "Exporting…" })
    expect(working).toHaveAttribute("aria-busy", "true")
    fireEvent.click(working)
    expect(onExport).toHaveBeenCalledTimes(1)
    await act(async () => done())
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled()
  })

  it("is offered only where the list can be saved", () => {
    render(<Display />)
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument()
  })
})
