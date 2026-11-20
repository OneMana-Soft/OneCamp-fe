import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { getCoreRowModel, useReactTable, type ColumnFiltersState, type SortingState } from "@tanstack/react-table"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"

// The SLA facet, chip and sort on a project's toolbar (linear-24 W1). SLA state is read by the
// project's members only: a guest's GET /sla is a 403, and then the list is as it was, with no
// SLA facet and no SLA filter or sort left in it (V-1011). SLAs off, or a read that fails, the same.

const h = vi.hoisted(() => ({ sla: { shows: false, refused: false }, asked: [] as boolean[] }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: undefined, isLoading: false }),
}))
vi.mock("@/hooks/useSlaView", () => ({
  useSlaView: (_p: string | undefined, when: boolean) => {
    h.asked.push(when)
    return when ? h.sla : { shows: false, refused: false }
  },
}))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }))
vi.mock("@/hooks/useProjectFields", () => ({ useProjectFields: () => ({ fields: [] }), usePeople: () => ({ nameOf: () => undefined, people: [] }) }))

const { WorkToolbar } = await import("./WorkToolbar")

const seen: { filters: ColumnFiltersState; sorting: SortingState } = { filters: [], sorting: [] }
function List({ filters = [], sorting = [] }: { filters?: ColumnFiltersState; sorting?: SortingState }) {
  const [columnFilters, setColumnFilters] = React.useState(filters)
  const [sort, setSorting] = React.useState(sorting)
  seen.filters = columnFilters
  seen.sorting = sort
  const table = useReactTable({
    data: [],
    columns: [],
    state: { columnFilters, sorting: sort },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
  })
  return <WorkToolbar table={table} projectId="p-launch" display={<span />} />
}

const openFilter = async () => {
  const trigger = screen.getByRole("button", { name: /Filter/ })
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(trigger, { key: "Enter" })
  })
}

afterEach(() => {
  cleanup()
  h.asked = []
})

describe("SLAs on a project's toolbar (linear-24 W1)", () => {
  it("reads the project's SLA view only once the Filter opens or an SLA filter is there", () => {
    h.sla = { shows: true, refused: false }
    render(<List />)
    expect(h.asked.every((w) => w === false)).toBe(true)
  })

  it("offers an SLA facet to a member with SLAs on, and names a chosen SLA filter in words", async () => {
    h.sla = { shows: true, refused: false }
    render(<List filters={[{ id: "task_sla", value: ["breached", "at_risk"] }]} />)
    expect(await screen.findByText("Breached, At risk")).toBeTruthy()
    await openFilter()
    expect(screen.getByRole("menuitem", { name: "SLA" })).toBeTruthy()
  })

  it("a guest (403) sees no SLA facet, and an SLA filter and sort that came with the address are taken out", async () => {
    h.sla = { shows: false, refused: true }
    render(<List filters={[{ id: "task_sla", value: ["breached"] }, { id: "task_priority", value: ["high"] }]} sorting={[{ id: "task_sla", desc: false }]} />)
    expect(seen.filters).toEqual([{ id: "task_priority", value: ["high"] }])
    expect(seen.sorting).toEqual([])
    expect(screen.queryByText("Breached")).toBeNull()
    await openFilter()
    expect(screen.queryByRole("menuitem", { name: "SLA" })).toBeNull()
  })
})
