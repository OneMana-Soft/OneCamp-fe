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
    // A link is written as its id and type: the server names it for each reader.
    expect(committed).toHaveBeenCalledWith([{ id: "globex", type: "row" }])
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

  it("draws linked rows as raised chips on e1", () => {
    render(<RelationCell value={[{ id: "acme", label: "Acme Inc", type: "row", table_id: "vendors" }]} target="table" tableId="vendors" onCommit={vi.fn()} />)
    const chip = document.querySelector("[data-relation-chip]") as HTMLElement
    expect(chip.className).toContain("shadow-e1")
    expect(chip.className).toContain("bg-raised")
  })

  it("marks the rows already linked, and unlinks one picked again", async () => {
    pick.mockResolvedValue([{ id: "acme", label: "Acme" }])
    const linked = vi.fn()
    render(<RelationCell value={[{ id: "acme", label: "Acme", type: "row", table_id: "vendors" }]} target="table" tableId="vendors" tableName="Vendors" onLink={linked} onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a link" }))
    expect(screen.getByPlaceholderText("Link a row from Vendors")).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText("Linked")).toBeTruthy())
    fireEvent.click(screen.getByRole("option", { name: "Acme" }))
    expect(linked).toHaveBeenLastCalledWith({ remove: ["acme"] })
  })

  it("shows each linked row by name, opening it in its table", () => {
    render(<RelationCell value={[{ id: "acme", label: "Acme Inc", type: "row", table_id: "vendors" }]} target="table" tableId="vendors" onCommit={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Acme Inc" }).getAttribute("href")).toBe("/app/tables/vendors?row=acme")
  })
})

// TAB-BUG-5: an item the reader can't open comes without its name. It shows
// as one chip that says so, never by its id, and a write keeps it linked.
describe("links to items the reader can't open", () => {
  const doc = (id: string, label?: string) => (label ? { id, label, type: "doc" } : { id, type: "doc", hidden: true })

  it("shows them as one chip that says so, never by their ids", () => {
    render(<RelationCell value={[doc("d1", "Launch plan"), doc("secret-1"), doc("secret-2")]} target="doc" onCommit={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Launch plan" })).toBeTruthy()
    const hidden = document.querySelector("[data-relation-hidden]") as HTMLElement
    expect(hidden.textContent).toBe("2 things you can't open")
    expect(document.body.textContent).not.toMatch(/secret/)
    // Nothing to open or unlink for what can't be seen.
    expect(screen.queryByRole("button", { name: /Unlink.*secret/ })).toBeNull()
  })

  it("says one alone as \"Something you can't open\"", () => {
    render(<RelationCell value={[doc("secret-1")]} target="doc" onCommit={vi.fn()} />)
    expect(document.querySelector("[data-relation-hidden]")?.textContent).toBe("Something you can't open")
  })

  it("keeps them when the reader unlinks another, and writes ids and types alone", () => {
    const committed = vi.fn()
    render(<RelationCell value={[doc("d1", "Launch plan"), doc("secret-1")]} target="doc" onCommit={committed} />)
    fireEvent.click(screen.getByRole("button", { name: "Unlink Launch plan" }))
    expect(committed).toHaveBeenCalledWith([{ id: "secret-1", type: "doc" }])
  })
})

// QA PTC-16 (14 Oct): a row's links wrapped onto a second line and stretched
// a 40 px grid row to 57. A grid row holds a line of two, then "+N", as a
// multi-select's cell does.
describe("a relation cell's chips", () => {
  const rows = ["Acme", "Globex", "Initech", "Umbrella"].map((label) => ({ id: label.toLowerCase(), label, type: "row", table_id: "vendors" }))

  it("show two on one line in a grid row, and count the rest", () => {
    render(<RelationCell value={rows} room={{ max: 2, wrap: false }} target="table" tableId="vendors" onCommit={vi.fn()} />)
    expect(document.querySelectorAll("[data-relation-chip]")).toHaveLength(2)
    const more = document.querySelector("[data-relation-more]") as HTMLElement
    expect(more.textContent).toBe("+2")
    expect(more.getAttribute("title")).toBe("Initech, Umbrella")
    const line = more.parentElement as HTMLElement
    expect(line.className).toMatch(/overflow-hidden/)
    expect(line.className).not.toMatch(/flex-wrap/)
  })

  it("show every one, wrapping, where there's room (the record panel)", () => {
    render(<RelationCell value={rows} target="table" tableId="vendors" onCommit={vi.fn()} />)
    expect(document.querySelectorAll("[data-relation-chip]")).toHaveLength(4)
    expect(document.querySelector("[data-relation-more]")).toBeNull()
  })
})
