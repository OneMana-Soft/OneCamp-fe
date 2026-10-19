import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const patchRow = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  patchRow: (...a: unknown[]) => patchRow(...a),
  createRow: vi.fn(),
}))
// dnd-kit as it is, with what the board hands its context kept for a look.
const dnd = vi.hoisted(() => ({ props: null as DndContextProps | null }))
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...real,
    DndContext: (props: DndContextProps) => {
      dnd.props = props
      return <real.DndContext {...props} />
    },
  }
})

import type { DndContextProps } from "@dnd-kit/core"
import { BOARD_AUTO_SCROLL } from "@/lib/board/drag"
import { BoardGroupBy, DataTableBoard } from "@/components/table/DataTableBoard"
import type { TableField, TableRow } from "@/services/tableService"

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  // One option saved with an id, one from before options had them.
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ id: "o_todo", label: "To do" }, { label: "Done" }] }), position: 1 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 2 },
  { id: "priority", table_id: "t", name: "Priority", type: "select", config: JSON.stringify({ options: [{ id: "o_high", label: "High" }, { id: "o_low", label: "Low" }] }), position: 3 },
]
const card = (i: number, stage: string, priority = "High"): TableRow => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Card ${i}`, stage, notes: "Theirs", priority }) })
const cardButton = (title: string) => screen.getByText(title).closest("button") as HTMLButtonElement
const lane = (key: string) => document.querySelector(`[data-lane="${key}"]`) as HTMLElement
const said = () => document.querySelector("[data-board-said]")?.textContent

afterEach(() => {
  cleanup()
  patchRow.mockReset()
})

// The rivals review (16 Oct 2026): Notion tints each column and heads it with
// its pill; our cards printed bare "Field value" lines (PTC-31).
describe("a table's board, drawn", () => {
  const hued: TableField[] = fields.map((f) =>
    f.id === "stage" ? { ...f, config: JSON.stringify({ options: [{ id: "o_todo", label: "To do", color: "sky" }, { id: "o_done", label: "Done", color: "emerald" }] }) } : f,
  )

  it("washes a lane in its option's hue, under the option's own tint, and no value stays neutral", () => {
    render(<DataTableBoard tableId="t" fields={hued} rows={[card(1, "Done")]} canManage onChange={() => {}} />)
    expect(lane("o_done").className).toContain("hue-moss")
    expect(lane("o_done").querySelector("[data-option-chip]")!.hasAttribute("data-tinted")).toBe(true)
    expect(lane("__none__").className).toMatch(/(^|\s)bg-sunken(\s|$)/)
  })

  it("is the layer's drop well under a held card", () => {
    render(<DataTableBoard tableId="t" fields={hued} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    const c = cardButton("Card 1")
    c.focus()
    fireEvent.keyDown(c, { key: " " })
    expect(lane("o_todo").getAttribute("data-drop")).toBe("valid")
    expect(lane("o_todo").className).not.toMatch(/ring-brand/)
    fireEvent.keyDown(c, { key: "Escape" })
  })

  it("shows a card's fields as chips with their names: a choice as the grid draws it, text as name and value", () => {
    render(<DataTableBoard tableId="t" fields={hued} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    const notes = document.querySelector<HTMLElement>('[data-card-field="notes"]')!
    expect(notes.textContent).toBe("NotesTheirs")
    expect(notes.className).toMatch(/(^|\s)chip(\s|$)/)
    const priority = document.querySelector<HTMLElement>('[data-card-field="priority"]')!
    expect(priority.querySelector("[data-option-chip]")!.textContent).toBe("High")
    expect(priority.getAttribute("title")).toBe("Priority")
  })
})

describe("a table's board", () => {
  it("draws a lane's first 50 cards, and the rest when asked", () => {
    const rows = Array.from({ length: 300 }, (_, i) => card(i, "To do"))
    render(<DataTableBoard tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    expect(screen.getAllByText(/^Card \d+$/)).toHaveLength(50)
    fireEvent.click(screen.getByRole("button", { name: "Show 250 more" }))
    expect(screen.getAllByText(/^Card \d+$/)).toHaveLength(300)
    expect(screen.queryByRole("button", { name: /^Show .* more$/ })).toBeNull()
  })
})

// Tables A1 (FD-14): a row has one name, its primary field, on a card as in
// its record and its links; the board had a rule of its own, the first text
// field.
describe("a board card's title", () => {
  const row = (values: Record<string, unknown>): TableRow => ({ id: "r1", table_id: "t", position: 1, created_at: "", updated_at: "", values: JSON.stringify(values) })

  it("is the row's primary field, wherever that field sits", () => {
    const named = fields.map((f) => (f.id === "notes" ? { ...f, primary: true } : f))
    render(<DataTableBoard tableId="t" fields={named} rows={[row({ item: "Card 1", stage: "To do", notes: "Invoice 7" })]} canManage onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Move Invoice 7" })).toBeTruthy()
  })

  it("is the first field on a table with none marked, whatever its kind", () => {
    const numbered: TableField[] = [{ id: "no", table_id: "t", name: "No.", type: "number", config: "{}", position: 0 }, ...fields.map((f) => ({ ...f, position: f.position + 1 }))]
    render(<DataTableBoard tableId="t" fields={numbered} rows={[row({ no: 42, item: "Card 1", stage: "To do" })]} canManage onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Move 42" })).toBeTruthy()
  })
})

// TAB-BUG-10: a card did nothing when clicked, and moved only by the
// browser's drag and drop: not by touch where a long press doesn't drag, and
// never from the keyboard.
describe("a board card", () => {
  it("opens its record on a click and on Enter", () => {
    const open = vi.fn()
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} onOpenRow={open} />)
    fireEvent.click(cardButton("Card 1"))
    expect(open).toHaveBeenCalledWith("r1")
    open.mockClear()
    fireEvent.keyDown(cardButton("Card 1"), { key: "Enter" })
    expect(open).toHaveBeenCalledWith("r1")
  })

  it("moves by its Move to menu, setting its lane's option alone (TAB-BUG-1)", async () => {
    patchRow.mockResolvedValue({})
    const changed = vi.fn()
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={changed} />)
    const menu = screen.getByRole("button", { name: "Move Card 1" })
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(menu, { key: "Enter" })
    const done = screen.getByRole("menuitem", { name: "Done" })
    await act(async () => {
      fireEvent.pointerDown(done)
      fireEvent.click(done)
    })
    expect(patchRow).toHaveBeenCalledWith("t", "r1", { stage: "Done" })
    expect(changed).toHaveBeenCalledWith("r1")
    // It shows in its new lane at once.
    expect(within(lane("label:Done")).getByText("Card 1")).toBeTruthy()
  })

  it("moves from the keyboard: Space picks it up, the arrows move it, Space drops it, each step said", async () => {
    patchRow.mockResolvedValue({})
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    const c = cardButton("Card 1")
    c.focus()
    fireEvent.keyDown(c, { key: " " })
    expect(said()).toBe("Picked up Card 1, in To do. Left and right arrow keys move it, Space drops it, Escape puts it back.")
    expect(lane("o_todo").hasAttribute("data-drop-target")).toBe(true)
    fireEvent.keyDown(c, { key: "ArrowRight" })
    expect(said()).toBe("Done")
    expect(lane("label:Done").hasAttribute("data-drop-target")).toBe(true)
    await act(async () => fireEvent.keyDown(c, { key: " " }))
    expect(patchRow).toHaveBeenCalledWith("t", "r1", { stage: "Done" })
    expect(said()).toBe("Moved to Done.")
    // The focus follows it into its lane, for the next move.
    expect(document.activeElement).toBe(within(lane("label:Done")).getByText("Card 1").closest("button"))
  })

  it("goes back where it was on Escape", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    const c = cardButton("Card 1")
    c.focus()
    fireEvent.keyDown(c, { key: " " })
    fireEvent.keyDown(c, { key: "ArrowRight" })
    fireEvent.keyDown(c, { key: "Escape" })
    expect(said()).toBe("Put back where it was.")
    expect(patchRow).not.toHaveBeenCalled()
    expect(within(lane("o_todo")).getByText("Card 1")).toBeTruthy()
  })

  // Firefox clicks a button on Space's keyup, whatever the keydown did.
  it("holds back Space's keyup on a card, so Firefox doesn't open the card Space picked up", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    expect(fireEvent.keyUp(cardButton("Card 1"), { key: " " })).toBe(false)
    expect(fireEvent.keyUp(cardButton("Card 1"), { key: "Enter" })).toBe(true)
    expect(fireEvent.keyUp(screen.getByRole("button", { name: "Move Card 1" }), { key: " " })).toBe(true)
  })

  // dnd-kit's own announcements read raw ids ("Picked up draggable item 6c0f…").
  it("says a pointer or touch drag in the board's words", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    const say = dnd.props!.accessibility!.announcements!
    const active = { id: "r1" } as never
    expect(say.onDragStart({ active })).toBe("Picked up Card 1, in To do.")
    expect(say.onDragOver({ active, over: { id: "label:Done" } as never })).toBe("Done")
    expect(say.onDragEnd({ active, over: { id: "label:Done" } as never })).toBe("Moved to Done.")
    expect(say.onDragEnd({ active, over: { id: "o_todo" } as never })).toBe("Put back in To do.")
  })

  it("scrolls only itself, at its very edge, while a card is held", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do")]} canManage onChange={() => {}} />)
    expect(dnd.props!.autoScroll).toBe(BOARD_AUTO_SCROLL)
    expect(document.querySelector("[data-table-board]")?.hasAttribute("data-board-scroll")).toBe(true)
  })

  it("steps through its lane on J and K", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do"), card(2, "To do")]} canManage onChange={() => {}} />)
    cardButton("Card 1").focus()
    fireEvent.keyDown(cardButton("Card 1"), { key: "j" })
    expect(document.activeElement).toBe(cardButton("Card 2"))
    fireEvent.keyDown(cardButton("Card 2"), { key: "k" })
    expect(document.activeElement).toBe(cardButton("Card 1"))
  })
})

describe("a board's lanes", () => {
  it("are the select field the reader groups by, chosen among the table's", () => {
    render(<DataTableBoard tableId="t" fields={fields} rows={[card(1, "To do", "Low")]} canManage groupFieldId="priority" onChange={() => {}} />)
    expect(within(lane("o_low")).getByText("Card 1")).toBeTruthy()
    expect(lane("o_todo")).toBeNull()
    cleanup()
    const pick = vi.fn()
    render(<BoardGroupBy fields={fields} groupFieldId="priority" onPick={pick} />)
    const button = screen.getByRole("button", { name: "Group by Priority" })
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: "mouse" })
    fireEvent.keyDown(button, { key: "Enter" })
    const stage = screen.getByRole("menuitem", { name: "Stage" })
    fireEvent.pointerDown(stage)
    fireEvent.click(stage)
    expect(pick).toHaveBeenCalledWith("stage")
  })
})
