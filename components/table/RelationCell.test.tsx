import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

const pick = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  pickRows: (...args: unknown[]) => pick(...args),
}))
// Stable, as the real hook's is.
const { search } = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock("@/services/searchService", () => ({ useGlobalSearch: () => ({ search }) }))

import { RelationCell } from "@/components/table/RelationCell"

afterEach(() => {
  cleanup()
  pick.mockReset()
})

describe("linking to a table's rows", () => {
  it("offers the table's rows before anything is typed, and links one", async () => {
    pick.mockResolvedValue([
      { id: "acme", label: "Acme" },
      { id: "globex", label: "Globex" },
    ])
    const committed = vi.fn()
    render(<RelationCell value={[]} target="table" tableId="vendors" onCommit={committed} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }))
    await waitFor(() => expect(screen.getByText("Globex")).toBeTruthy())
    expect(pick).toHaveBeenCalledWith("vendors", "")
    fireEvent.click(screen.getByText("Globex"))
    expect(committed).toHaveBeenCalledWith([{ id: "globex", label: "Globex", type: "row", table_id: "vendors" }])
  })

  it("changes links one at a time, not as a whole cell", async () => {
    pick.mockResolvedValue([{ id: "globex", label: "Globex" }])
    const linked = vi.fn()
    const committed = vi.fn()
    render(<RelationCell value={[{ id: "acme", label: "Acme", type: "row", table_id: "vendors" }]} target="table" tableId="vendors" onLink={linked} onCommit={committed} />)
    fireEvent.click(screen.getByRole("button", { name: "Unlink Acme" }))
    expect(linked).toHaveBeenLastCalledWith({ remove: ["acme"] })
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }))
    await waitFor(() => expect(screen.getByText("Globex")).toBeTruthy())
    fireEvent.click(screen.getByText("Globex"))
    expect(linked).toHaveBeenLastCalledWith({ add: ["globex"] })
    expect(committed).not.toHaveBeenCalled()
  })

  it("counts the links past those it shows, and leaves a table the reader can't open as it is", () => {
    render(
      <RelationCell
        value={[
          { id: "a", label: "Private row", type: "row", table_id: "vendors" },
          { id: "", label: "3 more", type: "more", table_id: "vendors" },
        ]}
        target="table"
        tableId="vendors"
        readOnly
        onLink={vi.fn()}
        onCommit={vi.fn()}
      />,
    )
    expect(screen.getByText("3 more")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("shows each linked row by name, opening its table", () => {
    render(<RelationCell value={[{ id: "acme", label: "Acme Inc", type: "row", table_id: "vendors" }]} target="table" tableId="vendors" onCommit={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Acme Inc" }).getAttribute("href")).toBe("/app/tables/vendors")
  })
})
