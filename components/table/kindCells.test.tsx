import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as React from "react"

// The workspace's members, as /user/allUsers answers (a people picker's rows).
const members = [
  { user_uuid: "u-maya", user_name: "Maya Iyer", user_full_name: "Maya Iyer", user_email_id: "maya@example.com" },
  { user_uuid: "u-bo", user_name: "Bo Chen", user_full_name: "Bo Chen", user_email_id: "bo@example.com" },
  { user_uuid: "u-bot", user_name: "Helper", is_bot: true },
]
vi.mock("@/hooks/useFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useFetch")>()),
  useFetch: () => ({ data: { users: members }, isLoading: false }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))
// A phone's overlays are sheets (useSheetMode); a test sets mode.sheet for one.
const mode = vi.hoisted(() => ({ sheet: false }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => mode.sheet }))

import { Cell } from "@/components/table/gridCells"
import { waitFace, type CellContext } from "@/components/table/cellFaces"
import { cellPickers, kindCells } from "@/components/table/cellPickerPart"
import type { FieldType, TableField } from "@/services/tableService"

// The B1 cells and the pickers are chunks of their own (lazyView): loaded
// once, before these tests, they draw at once.
beforeAll(() => Promise.all([kindCells.warm(), cellPickers.warm()]))
afterEach(() => {
  cleanup()
  mode.sheet = false
})

const ctx: CellContext = { options: new Map(), rowHeight: "medium" }
const field = (type: FieldType, config: Record<string, unknown> = {}, name = "Field"): TableField => ({ id: "f", table_id: "t", name, type, config: JSON.stringify(config), position: 0 })

function cell(f: TableField, value: unknown, opts: { readOnly?: boolean; onCommit?: (v: unknown) => Promise<boolean> } = {}) {
  const onCommit = opts.onCommit ?? vi.fn(async () => true)
  render(<Cell field={f} value={value} cellId="0:0" readOnly={opts.readOnly} ctx={ctx} onCommit={onCommit} onLink={() => {}} />)
  return onCommit
}

describe("a rating's cell (STEP5 spec E)", () => {
  it("rates by a click on a star, and clears on the star already rated", () => {
    const onCommit = cell(field("rating", {}, "Stars"), 3)
    expect(screen.getByRole("group", { name: "Stars: 3 of 5" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Rate 5 of 5" }))
    expect(onCommit).toHaveBeenLastCalledWith(5)
    fireEvent.click(screen.getByRole("button", { name: "Clear the rating of 5" }))
    expect(onCommit).toHaveBeenLastCalledWith(null)
  })

  it("takes 1 to 9 up to the field's most from the keyboard, 0 clears, and keys past the most do nothing", () => {
    const onCommit = cell(field("rating", {}, "Stars"), 2)
    const stars = screen.getByRole("group", { name: "Stars: 2 of 5" })
    fireEvent.keyDown(stars, { key: "4" })
    expect(onCommit).toHaveBeenLastCalledWith(4)
    fireEvent.keyDown(stars, { key: "7" })
    expect(onCommit).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(stars, { key: "0" })
    expect(onCommit).toHaveBeenLastCalledWith(null)
  })

  it("draws ten stars for a field that rates up to ten, and none to press when it can't be changed", () => {
    cell(field("rating", { max: 10 }, "Stars"), 9, { readOnly: true })
    expect(screen.getByRole("img", { name: "Stars: 9 of 10" })).toBeTruthy()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("draws nothing at rest when unrated, its stars on hover or focus (always on touch), and none when locked", () => {
    // Five empty stars in every blank row read as a zero rating (DESIGN-BUILD-2 on the T3 shots).
    cell(field("rating", {}, "Stars"), null)
    const stars = screen.getAllByRole("button", { name: /^Rate \d of 5$/ })
    expect(stars).toHaveLength(5)
    for (const b of stars) expect(b.className).toMatch(/(^| )\[@media\(hover:hover\)\]:opacity-0( |$).*group-hover\/rating:opacity-100.*group-focus\/rating:opacity-100/)
    cleanup()
    cell(field("rating", {}, "Stars"), 2)
    for (const b of screen.getAllByRole("button")) expect(b.className).not.toMatch(/opacity-0/)
    cleanup()
    cell(field("rating", {}, "Stars"), null, { readOnly: true })
    expect(screen.getByRole("img", { name: "Stars: not rated" }).querySelectorAll("svg")).toHaveLength(0)
  })
})

describe("a people cell (STEP5 spec E)", () => {
  it("shows one person's face and first name, three faces then +N for more", () => {
    cell(field("people", {}, "Owners"), [{ id: "u-maya", type: "user", label: "Maya Iyer" }])
    expect(screen.getByText("Maya")).toBeTruthy()
    cleanup()
    cell(field("people", {}, "Owners"), ["Asha Rao", "Ben Ode", "Cy Lam", "Dee Fox", "Eli Moss"].map((label, i) => ({ id: `u${i}`, type: "user", label })))
    expect(screen.getByText("+2")).toBeTruthy()
    // Many people are faces alone: no one's first name beside them.
    expect(screen.queryByText("Asha")).toBeNull()
  })

  it("picks members from the workspace's people, faces and all, adding each and keeping the menu open", async () => {
    const onCommit = cell(field("people", {}, "Owners"), [{ id: "u-maya", type: "user", label: "Maya Iyer" }])
    fireEvent.click(screen.getByRole("button", { name: "Owners: Maya Iyer" }))
    await waitFor(() => expect(screen.getByText("Bo Chen")).toBeTruthy())
    // A bot isn't someone a people field holds.
    expect(screen.queryByText("Helper")).toBeNull()
    await act(async () => fireEvent.click(screen.getByText("Bo Chen")))
    // Written as ids alone: the server names people for each reader.
    expect(onCommit).toHaveBeenLastCalledWith([
      { id: "u-maya", type: "user" },
      { id: "u-bo", type: "user" },
    ])
    expect(screen.getByText("Maya Iyer")).toBeTruthy()
  })

  it("replaces the one person a field takes, and closes", async () => {
    const onCommit = cell(field("people", { one: true }, "Lead"), [{ id: "u-maya", type: "user", label: "Maya Iyer" }])
    fireEvent.click(screen.getByRole("button", { name: "Lead: Maya Iyer" }))
    await waitFor(() => expect(screen.getByText("Bo Chen")).toBeTruthy())
    await act(async () => fireEvent.click(screen.getByText("Bo Chen")))
    expect(onCommit).toHaveBeenLastCalledWith([{ id: "u-bo", type: "user" }])
    await waitFor(() => expect(screen.queryByText("bo@example.com")).toBeNull())
  })
})

describe("a status cell (STEP5 spec E)", () => {
  const stage = field(
    "status",
    {
      options: [
        { id: "o1", label: "Not started", group: "todo" },
        { id: "o2", label: "Building", group: "doing", color: "lake" },
        { id: "o3", label: "Shipped", group: "done" },
      ],
    },
    "Stage",
  )

  it("is the task status lozenge: its group's glyph and name on its hue's tint", () => {
    cell(stage, "Building")
    const chip = document.querySelector("[data-option-chip]") as HTMLElement
    expect(chip.dataset.statusGroup).toBe("doing")
    expect(chip.dataset.tinted).toBe("true")
    expect(chip.querySelector('[data-status-glyph="progress"]')).toBeTruthy()
  })

  it("picks from the combobox, a list of one in its three groups, and clears at its foot", async () => {
    const onCommit = cell(stage, "Not started")
    fireEvent.click(screen.getByRole("button", { name: "Stage: Not started" }))
    await waitFor(() => expect(screen.getByText("In progress")).toBeTruthy())
    expect(screen.getByText("To do")).toBeTruthy()
    expect(screen.getByText("Done")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByText("Shipped")))
    expect(onCommit).toHaveBeenLastCalledWith("Shipped")
    fireEvent.click(screen.getByRole("button", { name: "Stage: Shipped" }))
    await waitFor(() => expect(screen.getByText("Clear status")).toBeTruthy())
    await act(async () => fireEvent.click(screen.getByText("Clear status")))
    expect(onCommit).toHaveBeenLastCalledWith("")
  })
})

describe("a long text's cell (STEP5 spec E)", () => {
  it("shows its first line, with … for the lines after it, and edits in a box where Enter makes a line and Cmd+Enter saves", async () => {
    const onCommit = cell(field("long_text", {}, "Notes"), "Call back\nSend the deck")
    expect(screen.getByText("Call back…")).toBeTruthy()
    expect(screen.queryByText(/Send the deck/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Notes: Call back" }))
    const box = (await screen.findByRole("textbox", { name: "Notes" })) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "Call back\nSend the deck\nBook the room" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter", metaKey: true })
    expect(onCommit).toHaveBeenLastCalledWith("Call back\nSend the deck\nBook the room")
  })

  it("puts the text back on Esc", async () => {
    const onCommit = cell(field("long_text", {}, "Notes"), "Call back")
    fireEvent.click(screen.getByRole("button", { name: "Notes: Call back" }))
    const box = (await screen.findByRole("textbox", { name: "Notes" })) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "Something else" } })
    fireEvent.keyDown(box, { key: "Escape" })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("is named by the line it shows: the first that isn't blank", () => {
    cell(field("long_text", {}, "Notes"), "\nCall back\nSend the deck")
    expect(screen.getByText("Call back…")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Notes: Call back" })).toBeTruthy()
  })

  it("shows that line while the cells' chunk is on its way", () => {
    render(waitFace({ field: field("long_text", {}, "Notes"), value: "\nCall back\nSend the deck", cellId: "0:0" }))
    expect(screen.getByText("Call back")).toBeTruthy()
  })

  // The cell follows each value saved, so by the time its editor
  // closes, the text it opened with can be older than the cell's.
  function opened(value: string) {
    const onCommit = vi.fn(async () => true)
    const f = field("long_text", {}, "Notes")
    const at = (v: string) => <Cell field={f} value={v} cellId="0:0" ctx={ctx} onCommit={onCommit} onLink={() => {}} />
    const view = render(at(value))
    fireEvent.click(screen.getByRole("button", { name: `Notes: ${value}` }))
    return { onCommit, box: () => screen.findByRole("textbox", { name: "Notes" }), newer: (v: string) => view.rerender(at(v)) }
  }

  it("writes nothing over a newer value when its box is clicked away from untouched", async () => {
    const { onCommit, box, newer } = opened("old words")
    await box()
    newer("newer words")
    await act(async () => void fireEvent.pointerDown(document.body))
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Notes" })).toBeNull())
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("on a phone, edits in a sheet whose Save writes the edit", async () => {
    mode.sheet = true
    const { onCommit, box } = opened("Call back")
    fireEvent.change(await box(), { target: { value: "Call back today" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onCommit).toHaveBeenLastCalledWith("Call back today")
  })

  it("on a phone, writes nothing over a newer value when its sheet is saved untouched", async () => {
    mode.sheet = true
    const { onCommit, box, newer } = opened("old words")
    await box()
    newer("newer words")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe("what a row says of itself (STEP5 spec E)", () => {
  it("reads its id as a task's key, when it was made as how long ago, and who as a face and a name", () => {
    cell(field("autonumber", { prefix: "DEAL" }, "ID"), 12)
    expect(screen.getByText("DEAL-12")).toBeTruthy()
    cleanup()
    const yesterday = new Date(Date.now() - 30 * 3600 * 1000).toISOString()
    cell(field("created_time", {}, "Made"), yesterday)
    const made = screen.getByText("yesterday").closest("[data-cell]") as HTMLElement
    expect(made.getAttribute("title")).toMatch(/ 20\d\d, /)
    cleanup()
    cell(field("created_by", {}, "Made by"), [{ id: "u-maya", type: "user", label: "Maya Iyer" }])
    expect(screen.getByText("Maya Iyer")).toBeTruthy()
    // Nothing to press: nobody writes these.
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})
