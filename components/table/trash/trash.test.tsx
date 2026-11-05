import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// The trash (tables A2): what's in it, who deleted it and when, and Restore,
// which brings it back and takes it off the list. A table in it can also be
// deleted for good (V-121), after the confirmation docs' trash asks, and says
// when it goes for good on its own only from the server's date.

const ledger = vi.hoisted(() => ({ readTableTrash: vi.fn(), restoreFromTrash: vi.fn(), readTablesTrash: vi.fn(), restoreTable: vi.fn(), purgeTable: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), ...ledger }))
const confirm = vi.fn()
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))

import { TableTrash, trashRowName } from "@/components/table/trash/TableTrash"
import { TablesTrash } from "@/components/table/trash/TablesTrash"
import { fullDateTime, shortDate } from "@/lib/utils/date/shortDate"
import { refusalReason } from "@/lib/utils/apiError"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"
import type { TableField } from "@/services/tableService"

// The clock stands still, so "just now" and a date the server sends read the same every day.
pinTestClock()

/** A trash row's "Deleted … by …", read whole: "by" and the name sit in a box of their own inside it. */
const saysWho = (text: string) => (_: string, el: Element | null) => el?.matches("span[title]") === true && el.textContent === text

const fields: TableField[] = [
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 1 },
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 2, primary: true },
]
const now = TEST_TODAY.toISOString()
// The page's write (the table's undo order), as a stand-in that sends at once and keeps what entered it (V-369).
const made: string[] = []
const write = <T,>(what: string, send: () => Promise<T>) => (made.push(what), send())

afterEach(() => {
  cleanup()
  for (const f of Object.values(ledger)) f.mockReset()
  made.length = 0
  confirm.mockReset()
  toast.mockReset()
  push.mockReset()
})

describe("a deleted row's name in the trash", () => {
  it("is its primary field's value, else its number", () => {
    expect(trashRowName({ id: "r", values: { item: "Booth", notes: "Hall 2" }, deleted_at: now }, fields)).toBe("Booth")
    expect(trashRowName({ id: "r", values: { notes: "Hall 2" }, row_no: 42, deleted_at: now }, fields)).toBe("Row 42")
    expect(trashRowName({ id: "r", values: {}, deleted_at: now }, fields)).toBe("Untitled")
  })
})

describe("a table's trash", () => {
  it("lists rows and columns with who deleted them, and brings one back", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [
        { id: "r1", values: { item: "Booth" }, deleted_at: now, deleted_by_name: "Bo" },
        { id: "r2", values: { item: "Banner" }, deleted_at: now },
      ],
      more: false,
      fields: [{ field: { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 3, deleted_at: now }, deleted_by_name: "Maya" }],
    })
    ledger.restoreFromTrash.mockResolvedValue({ change_set: "cs" })
    const restored = vi.fn()
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={restored} />)
    expect(await screen.findByText("Booth")).toBeTruthy()
    expect(screen.getByText("Deleted just now by Bo")).toBeTruthy()
    expect(screen.getByText("Cost")).toBeTruthy()
    expect(screen.getByText("Deleted just now by Maya")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Booth" })))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { rows: ["r1"] })
    expect(screen.queryByText("Booth")).toBeNull()
    expect(restored).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({ title: "Restored “Booth”" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Cost" })))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { fields: ["cost"] })
  })

  // H2b: a deleted view waits in the trash as the API's does, with its layout and whether it's the reader's own.
  it("lists deleted views, the reader's own marked, and brings one back alone", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [],
      more: false,
      fields: [],
      views: [
        { id: "v1", table_id: "t", name: "By stage", type: "board", config: "{}", position: 1, deleted_at: now },
        { id: "v2", table_id: "t", name: "My week", type: "calendar", config: "{}", position: 2, owner_id: "me", deleted_at: now },
      ],
    })
    ledger.restoreFromTrash.mockResolvedValue({})
    const restored = vi.fn()
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={restored} />)
    const views = await screen.findByRole("region", { name: "Deleted views" })
    expect(within(views).getByText("By stage")).toBeTruthy()
    expect(within(views).getByText("My week")).toBeTruthy()
    expect(within(views).getAllByText("Deleted just now")).toHaveLength(1)
    expect(within(views).getByText("Deleted just now · only you see it")).toBeTruthy()
    expect(screen.queryByText("The trash is empty")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore By stage" })))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { views: ["v1"] })
    // In the table's undo order, as the page's other writes are (V-369).
    expect(made).toEqual(["restore"])
    expect(screen.queryByText("By stage")).toBeNull()
    expect(screen.getByText("My week")).toBeTruthy()
    expect(toast).toHaveBeenCalledWith({ title: "Restored the view “By stage”" })
    expect(restored).toHaveBeenCalled()
  })

  // A server from before views' trash sends no views (or null): the trash reads as before.
  it("reads an answer without views as no deleted views", async () => {
    ledger.readTableTrash.mockResolvedValue({ rows: [], more: false, fields: [], views: null })
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    expect(await screen.findByText("The trash is empty")).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Deleted views" })).toBeNull()
  })

  // A reader who doesn't write the rows brings back only their own views: rows and columns they can't restore aren't offered.
  it("offers a reader who doesn't edit the table only their own views", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [{ id: "r1", values: { item: "Booth" }, deleted_at: now }],
      more: true,
      fields: [{ field: { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 3, deleted_at: now } }],
      views: [{ id: "v2", table_id: "t", name: "My week", type: "calendar", config: "{}", position: 2, owner_id: "me", deleted_at: now }],
    })
    render(<TableTrash tableId="t" fields={fields} write={write} canEdit={false} onClose={vi.fn()} onRestored={vi.fn()} />)
    expect(await screen.findByRole("button", { name: "Restore My week" })).toBeTruthy()
    expect(screen.getByText("Your views deleted from this table, newest first.")).toBeTruthy()
    expect(screen.queryByText("Booth")).toBeNull()
    expect(screen.queryByText("Cost")).toBeNull()
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  // Busy is a line's own restore only: the rest wait, without a spinner of their own.
  it("shows the one being restored as busy, and the rest waiting", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [
        { id: "r1", values: { item: "Booth" }, deleted_at: now },
        { id: "r2", values: { item: "Banner" }, deleted_at: now },
      ],
      more: false,
      fields: [{ field: { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 3, deleted_at: now } }],
    })
    ledger.restoreFromTrash.mockReturnValue(new Promise(() => {}))
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    const booth = await screen.findByRole<HTMLButtonElement>("button", { name: "Restore Booth" })
    await act(async () => fireEvent.click(booth))
    expect(booth.getAttribute("aria-busy")).toBe("true")
    expect(booth.disabled).toBe(false)
    for (const name of ["Restore Banner", "Restore Cost"]) {
      const other = screen.getByRole<HTMLButtonElement>("button", { name })
      expect(other.disabled).toBe(true)
      expect(other.getAttribute("aria-busy")).toBeNull()
    }
  })

  // V-416: a view's line is busy while its restore is on its way, and the other lines wait.
  it("shows a view being restored as busy, and the other views waiting", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [],
      more: false,
      fields: [],
      views: [
        { id: "v1", table_id: "t", name: "By stage", type: "board", config: "{}", position: 1, deleted_at: now },
        { id: "v2", table_id: "t", name: "By owner", type: "grid", config: "{}", position: 2, deleted_at: now },
      ],
    })
    ledger.restoreFromTrash.mockReturnValue(new Promise(() => {}))
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    const stage = await screen.findByRole<HTMLButtonElement>("button", { name: "Restore By stage" })
    await act(async () => fireEvent.click(stage))
    expect(stage.getAttribute("aria-busy")).toBe("true")
    const owner = screen.getByRole<HTMLButtonElement>("button", { name: "Restore By owner" })
    expect(owner.disabled).toBe(true)
    expect(owner.getAttribute("aria-busy")).toBeNull()
    await act(async () => fireEvent.click(stage))
    expect(ledger.restoreFromTrash).toHaveBeenCalledTimes(1)
  })

  it("is busy restoring them all, while every line waits", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [
        { id: "r1", values: { item: "Booth" }, deleted_at: now },
        { id: "r2", values: { item: "Banner" }, deleted_at: now },
      ],
      more: false,
      fields: [],
    })
    ledger.restoreFromTrash.mockReturnValue(new Promise(() => {}))
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    const all = await screen.findByRole<HTMLButtonElement>("button", { name: "Restore all 2" })
    await act(async () => fireEvent.click(all))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { rows: ["r1", "r2"] })
    expect(all.getAttribute("aria-busy")).toBe("true")
    expect(all.disabled).toBe(false)
    for (const name of ["Restore Booth", "Restore Banner"]) expect(screen.getByRole<HTMLButtonElement>("button", { name }).disabled).toBe(true)
  })

  it("says it's empty", async () => {
    ledger.readTableTrash.mockResolvedValue({ rows: [], more: false, fields: [] })
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    expect(await screen.findByText("The trash is empty")).toBeTruthy()
  })

  it("reads more, from the last row shown", async () => {
    ledger.readTableTrash.mockResolvedValueOnce({ rows: [{ id: "r1", values: { item: "Booth" }, deleted_at: now }], more: true, fields: [] })
    ledger.readTableTrash.mockResolvedValueOnce({ rows: [{ id: "r0", values: { item: "Older" }, deleted_at: now }], more: false, fields: [] })
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    const more = await screen.findByRole("button", { name: "Show more" })
    await act(async () => fireEvent.click(more))
    expect(ledger.readTableTrash).toHaveBeenLastCalledWith("t", "r1")
    await waitFor(() => expect(screen.getByText("Older")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})

describe("the tables' trash", () => {
  it("brings a table back, with a way to open it", async () => {
    ledger.readTablesTrash.mockResolvedValue([{ table: { id: "t1", name: "Budget", visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now }, deleted_by_name: "Maya" }])
    ledger.restoreTable.mockResolvedValue({ id: "t1" })
    const restored = vi.fn()
    render(<TablesTrash onClose={vi.fn()} renderFailed={() => null} onRestored={restored} />)
    expect(await screen.findByText("Budget")).toBeTruthy()
    expect(screen.getByText(saysWho("Deleted just now by Maya"))).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Budget" })))
    expect(ledger.restoreTable).toHaveBeenCalledWith("t1")
    expect(restored).toHaveBeenCalled()
    const said = toast.mock.lastCall?.[0] as { title: string; action: { props: { onClick: () => void } } }
    expect(said.title).toBe("Restored “Budget”")
    said.action.props.onClick()
    expect(push).toHaveBeenCalledWith("/app/tables/t1")
  })

  it("deletes a table for good only once its confirmation says what goes, and takes it off the list", async () => {
    ledger.readTablesTrash.mockResolvedValue([{ table: { id: "t1", name: "Budget", visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now }, deleted_by_name: "Maya" }])
    ledger.purgeTable.mockResolvedValue(undefined)
    render(<TablesTrash onClose={vi.fn()} renderFailed={() => null} onRestored={vi.fn()} />)
    expect(await screen.findByText("Budget")).toBeTruthy()
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)
    // Delete for good comes before Restore, as in docs' trash, so Restore lines up at the end.
    expect(labels.filter((l) => /Budget/.test(l ?? ""))).toEqual(["Delete “Budget” for good", "Restore Budget"])
    fireEvent.click(screen.getByRole("button", { name: "Delete “Budget” for good" }))
    expect(ledger.purgeTable).not.toHaveBeenCalled()
    const asked = confirm.mock.calls[0][0]
    expect(asked).toMatchObject({
      title: "Delete “Budget” for good?",
      description: "“Budget” goes for good, with its rows and their pages, comments and files. Nobody can bring it back.",
      confirmText: "Delete for good",
      destructive: true,
    })
    await act(async () => asked.onConfirm())
    expect(ledger.purgeTable).toHaveBeenCalledWith("t1")
    expect(toast).toHaveBeenLastCalledWith({ title: "Deleted “Budget” for good" })
    expect(screen.queryByText("Budget")).toBeNull()
    expect(screen.getByText("The trash is empty")).toBeTruthy()
  })

  it("keeps a table it couldn't delete for good on the list", async () => {
    ledger.readTablesTrash.mockResolvedValue([{ table: { id: "t1", name: "Budget", visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now } }])
    ledger.purgeTable.mockRejectedValue(new Error("refused"))
    render(<TablesTrash onClose={vi.fn()} renderFailed={() => null} onRestored={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Delete “Budget” for good" }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    // The app's error toast says why; the table stays, and both its buttons work again.
    expect(screen.getByText("Budget")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Restore Budget" }) as HTMLButtonElement).disabled).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })

  it("says when a table goes for good on its own only from the server's date, and nothing without one", async () => {
    const goes = "2026-11-29T10:30:00.000Z"
    const table = (id: string, name: string) => ({ id, name, visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now })
    ledger.readTablesTrash.mockResolvedValue([
      { table: table("t1", "Budget"), deleted_by_name: "Maya", purge_at: goes },
      // Today's server: the trash keeps tables (retention 0), so it sends no date.
      { table: table("t2", "Forecast"), deleted_by_name: "Bo" },
    ])
    render(<TablesTrash onClose={vi.fn()} renderFailed={() => null} onRestored={vi.fn()} />)
    const dated = (await screen.findByText("Budget")).closest("li") as HTMLElement
    expect(within(dated).getByText(saysWho("Deleted just now by Maya"))).toBeTruthy()
    // Docs' words, after who deleted it; its title is the full time.
    const line = within(dated).getByText(/goes for good on/)
    expect(line.textContent).toBe(` · goes for good on ${shortDate(new Date(goes))}`)
    expect(line.getAttribute("title")).toBe(fullDateTime(new Date(goes)))
    const undated = screen.getByText("Forecast").closest("li") as HTMLElement
    expect(within(undated).getByText(saysWho("Deleted just now by Bo"))).toBeTruthy()
    expect(within(undated).queryByText(/for good on/)).toBeNull()
  })

  it("says, when it's empty, both ways a table leaves it", async () => {
    ledger.readTablesTrash.mockResolvedValue([])
    render(<TablesTrash onClose={vi.fn()} renderFailed={() => null} onRestored={vi.fn()} />)
    expect(await screen.findByText("The trash is empty")).toBeTruthy()
    expect(screen.getByText("A table you delete waits here until you bring it back or delete it for good.")).toBeTruthy()
  })

  // V-130: a trash it couldn't read is drawn by the tables' shell, which
  // already draws the shared error state, so the trash's own chunk imports
  // none of it (LEAD-RULES, 30 Oct 20:5x).
  it("hands a read it couldn't make to its shell, with why it was refused and a retry that reads it again", async () => {
    const refused = Object.assign(new Error("Request failed with status code 403"), {
      isAxiosError: true,
      response: { status: 403, data: { msg: "Only the workspace's admins see every deleted table." } },
    })
    ledger.readTablesTrash
      .mockRejectedValueOnce(refused)
      .mockResolvedValueOnce([{ table: { id: "t1", name: "Budget", visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now }, deleted_by_name: "Maya" }])
    const reads = ledger.readTablesTrash.mock.calls.length
    const shell = vi.fn(({ retry }: { detail?: string; retry: () => void }) => <button onClick={retry}>Read the trash again</button>)
    render(<TablesTrash onClose={vi.fn()} onRestored={vi.fn()} renderFailed={shell} />)
    const again = await screen.findByRole("button", { name: "Read the trash again" })
    expect(shell.mock.lastCall?.[0].detail, "the server's reason for refusing").toBe(refusalReason(refused))
    expect(screen.queryByRole("alert"), "the trash draws no message of its own").toBeNull()
    await act(async () => fireEvent.click(again))
    expect(await screen.findByText("Budget")).toBeTruthy()
    expect(ledger.readTablesTrash.mock.calls.length - reads, "Try again reads the trash once more").toBe(2)
  })
})

// A deleted view in the trash draws its layout's glyph, and the grid's for a layout the app doesn't know.
describe("a view's layout glyph in the trash", () => {
  it("is its layout's, and the grid's for a layout it doesn't know", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [],
      more: false,
      fields: [],
      views: [
        { id: "v1", table_id: "t", name: "By stage", type: "board", config: "{}", position: 1, deleted_at: now },
        { id: "v2", table_id: "t", name: "Intake", type: "form", config: "{}", position: 2, deleted_at: now },
      ],
    })
    render(<TableTrash tableId="t" fields={fields} write={write} onClose={vi.fn()} onRestored={vi.fn()} />)
    const views = await screen.findByRole("region", { name: "Deleted views" })
    const glyphs = [...views.querySelectorAll("[data-trash-item] svg")].map((s) => s.getAttribute("class") ?? "")
    expect(glyphs).toHaveLength(2)
    expect(glyphs[0]).toMatch(/lucide-(kanban|square-kanban)/)
    expect(glyphs[1]).toMatch(/lucide-(layout-grid|grid)/)
  })
})
