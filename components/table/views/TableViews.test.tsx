import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

const api = vi.hoisted(() => ({
  createView: vi.fn(),
  updateView: vi.fn(async () => {}),
  deleteView: vi.fn(async () => {}),
  lockView: vi.fn(async () => {}),
}))
vi.mock("@/services/tableViews", () => api)
// Asked to confirm, the reader says yes.
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (o: { onConfirm: () => unknown }) => void o.onConfirm() }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ copyToClipboard: vi.fn(async () => true) }))
// A phone: the menu is a sheet (overlayMode's SHEET_QUERY).
const phone = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/components/ui/overlayMode")>()), useSheetMode: () => phone.on }))

import { TableViews } from "@/components/table/views/TableViews"
import { DEFAULT_DISPLAY, type TableDisplay } from "@/lib/tables/display"
import { NO_RULES, saveViewRules, type ViewRules } from "@/lib/tables/viewRules"
import type { ViewChoice } from "@/lib/tables/tableView"
import type { TableField, TableView } from "@/services/tableService"

beforeAll(installPointerEvent)
beforeEach(() => {
  phone.on = false
  window.localStorage.clear()
  window.history.replaceState(null, "", "/app/tables/t")
})
afterEach(() => {
  cleanup()
  // Reset, not clear: a refusal one test sets (mockRejectedValue) must not refuse the next test's writes.
  vi.resetAllMocks()
})

const fields: TableField[] = [{ id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 0 }]
const byNotes: ViewRules = { sort: [{ field: "notes", dir: "desc" }], filters: [], match: "all" }
const view = (id: string, name: string, over: Partial<TableView> = {}): TableView => ({ id, table_id: "t", name, type: "grid", config: "{}", position: 0, ...over })
const shared = view("v1", "Everything")
const closing = view("v2", "Closing", { type: "board", position: 1, config: JSON.stringify({ rules: byNotes }) })
const mine = view("v3", "My calls", { position: 2, owner_id: "me" })

function draw(over: { views?: TableView[]; canManage?: boolean; layout?: ViewChoice; rules?: ViewRules; display?: TableDisplay } = {}) {
  const onApply = vi.fn()
  const props = { tableId: "t", views: over.views ?? [shared, closing, mine], fields, canManage: over.canManage ?? false, layout: over.layout ?? ("grid" as ViewChoice), rules: over.rules ?? NO_RULES, display: over.display ?? DEFAULT_DISPLAY, onApply }
  // The page's bar: the views menu, the layout tabs, then the place for a change's Save and Reset.
  const bar = (rules: ViewRules) => (
    <div>
      <TableViews {...props} rules={rules} />
      <div role="group" aria-label="View" />
      <span data-view-actions="" />
    </div>
  )
  const view = render(bar(props.rules))
  return { onApply, redraw: (rules: ViewRules) => view.rerender(bar(rules)) }
}
// The server keeps a new view as it was sent.
const made = (id: string, owner?: string) => async (_table: string, input: { name: string; type: TableView["type"]; config: object; position: number }) =>
  view(id, input.name, { type: input.type, config: JSON.stringify(input.config), position: input.position, owner_id: owner })
const openMenu = () => fireEvent.pointerDown(screen.getByRole("button", { name: /^View: / }), { button: 0, pointerType: "mouse" })

describe("a table's saved views", () => {
  it("lists the shared ones for everyone and the reader's own, and a pick shows the table as the view keeps it", async () => {
    const { onApply } = draw()
    openMenu()
    const menu = await screen.findByRole("menu")
    expect(within(menu).getByText("Everyone")).toBeTruthy()
    expect(within(menu).getByText("Only me")).toBeTruthy()
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Closing" }))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "board", rules: byNotes }))
    expect(new URL(window.location.href).searchParams.get("v")).toBe("v2")
    expect(screen.getByRole("button", { name: /^View: Closing/ })).toBeTruthy()
  })

  it("opens as a link names a view, shown as it's saved", () => {
    window.history.replaceState(null, "", "/app/tables/t?v=v2")
    const { onApply } = draw()
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ layout: "board", rules: byNotes }))
    expect(screen.getByRole("button", { name: /^View: Closing/ })).toBeTruthy()
  })

  it("lets a member save a shared view they changed only as their own", async () => {
    api.createView.mockImplementation(made("v9", "me"))
    draw({ rules: byNotes })
    expect(screen.getByRole("button", { name: "View: Everything, changed" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save as mine" }))
    const dialog = await screen.findByRole("dialog", { name: "Save as my view" })
    expect((within(dialog).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Everything (mine)")
    expect(within(dialog).queryByText("Who sees it")).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.createView).toHaveBeenCalledWith("t", expect.objectContaining({ name: "Everything (mine)", personal: true, config: expect.objectContaining({ rules: byNotes }) })))
    await waitFor(() => expect(screen.getByRole("button", { name: /^View: Everything \(mine\)$/ })).toBeTruthy())
  })

  it("lets a manager save a shared view they changed, until it's locked", async () => {
    const { redraw } = draw({ canManage: true, rules: byNotes })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.updateView).toHaveBeenCalledWith("t", "v1", expect.objectContaining({ name: "Everything", type: "grid", config: expect.objectContaining({ rules: byNotes }) })))
    // Saved, the view holds what's shown: nothing to save.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull())
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "Lock view" }))
    await waitFor(() => expect(api.lockView).toHaveBeenCalledWith("t", "v1", true))
    redraw(NO_RULES)
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(screen.getByRole("button", { name: "Save as mine" })).toBeTruthy()
    openMenu()
    expect(await screen.findByRole("menuitem", { name: "Unlock view" })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "Delete view" })).toBeNull()
  })

  it("puts a change's Save and Reset after the layout tabs, so the tabs stay where they were", () => {
    draw({ rules: byNotes })
    const after = document.querySelector("[data-view-actions]") as HTMLElement
    const menuBox = document.querySelector("[data-table-views]") as HTMLElement
    for (const name of ["Save as mine", "Reset"]) {
      const button = screen.getByRole("button", { name })
      expect(after.contains(button), `${name} sits after the tabs`).toBe(true)
      expect(menuBox.contains(button), `${name} sits in the views menu's box`).toBe(false)
    }
  })

  it("on a phone, keeps the bar to the menu and the tabs: a change's Save and Reset head the views sheet", async () => {
    phone.on = true
    const { onApply } = draw({ canManage: true, rules: byNotes })
    expect(screen.getByRole("button", { name: "View: Everything, changed" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
    openMenu()
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem")
    expect(items.slice(0, 2).map((item) => item.textContent?.trim())).toEqual(["Save", "Reset"])
    fireEvent.click(items[1])
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "grid", rules: NO_RULES }))
    openMenu()
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Save" }))
    await waitFor(() => expect(api.updateView).toHaveBeenCalledWith("t", "v1", expect.objectContaining({ config: expect.objectContaining({ rules: byNotes }) })))
    cleanup()
    // A member's change saves only as their own.
    draw({ rules: byNotes })
    openMenu()
    const theirs = within(await screen.findByRole("menu")).getAllByRole("menuitem")
    expect(theirs.slice(0, 2).map((item) => item.textContent?.trim())).toEqual(["Save as mine", "Reset"])
  })

  it("asks a manager who sees a new view; a member's is their own", async () => {
    api.createView.mockImplementation(made("v9"))
    draw({ canManage: true })
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "New view" }))
    const dialog = await screen.findByRole("dialog", { name: "New view" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Board" } })
    fireEvent.click(within(dialog).getByRole("radio", { name: "Everyone" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.createView).toHaveBeenCalledWith("t", expect.objectContaining({ name: "Board", personal: false })))
    cleanup()
    draw()
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "New view" }))
    expect(within(await screen.findByRole("dialog", { name: "New view" })).queryByText("Who sees it")).toBeNull()
  })

  it("changes nothing on screen when the server refuses a write: the views, the one chosen and its trigger stay as they were", async () => {
    const refused = Object.assign(new Error("Request failed with status code 403"), { response: { status: 403, data: { msg: "you don't have access to this table" } } })
    api.updateView.mockRejectedValue(refused)
    api.lockView.mockRejectedValue(refused)
    api.deleteView.mockRejectedValue(refused)
    const { onApply } = draw({ canManage: true, rules: byNotes })
    const applied = onApply.mock.calls.length
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.updateView).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).not.toBe("true"))
    expect(screen.getByRole("button", { name: "View: Everything, changed" })).toBeTruthy()
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "Lock view" }))
    await waitFor(() => expect(api.lockView).toHaveBeenCalledWith("t", "v1", true))
    openMenu()
    await act(async () => void fireEvent.click(await screen.findByRole("menuitem", { name: "Delete view" })))
    await waitFor(() => expect(api.deleteView).toHaveBeenCalledWith("t", "v1"))
    openMenu()
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitemradio").map((item) => [item.textContent, item.getAttribute("aria-checked")])).toEqual([
      ["Everything", "true"],
      ["Closing", "false"],
      ["My calls", "false"],
    ])
    expect(within(menu).getByRole("menuitem", { name: "Lock view" })).toBeTruthy()
    // An open menu hides the page from assistive tech, the trigger with it: close it as a person would, then read the trigger.
    fireEvent.keyDown(menu, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    expect(screen.getByRole("button", { name: "View: Everything, changed" })).toBeTruthy()
    expect(onApply).toHaveBeenCalledTimes(applied)
  })

  it("deletes a view of the reader's own once they say so, and shows the table as the first view keeps it", async () => {
    window.localStorage.setItem("onecamp:tableSavedView:t", "v3")
    const { onApply } = draw()
    openMenu()
    await act(async () => void fireEvent.click(await screen.findByRole("menuitem", { name: "Delete view" })))
    await waitFor(() => expect(api.deleteView).toHaveBeenCalledWith("t", "v3"))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ layout: "grid", rules: NO_RULES }))
    expect(screen.getByRole("button", { name: /^View: Everything/ })).toBeTruthy()
  })
})

// V-53: a device opened a saved view as it had last left it there, and one that
// had kept nothing showed the table as nothing: a view grouped and saved at
// 1280 showed no groups on a phone. A saved view looks the same on every
// device; a change of the reader's own, unsaved, stays where they made it.
describe("a saved view, opened on a device", () => {
  const pick = async (name: string) => {
    openMenu()
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name }))
  }
  // The table opened again on this device, from the sidebar: no link names a view.
  const reopen = () => {
    cleanup()
    window.history.replaceState(null, "", "/app/tables/t")
  }

  it("opens as it's saved where nothing of the reader's own is kept", () => {
    const { onApply } = draw({ views: [closing, shared] })
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ layout: "board", rules: byNotes }))
  })

  it("opens as it's saved now when it was saved elsewhere since this device opened it", async () => {
    // Opened here sorted by nothing; saved sorted by Notes elsewhere since.
    draw({ views: [shared, { ...closing, config: "{}" }] })
    await pick("Closing")
    reopen()
    const { onApply } = draw()
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ layout: "board", rules: byNotes }))
    expect(screen.getByRole("button", { name: /^View: Closing/ })).toBeTruthy()
  })

  it("keeps a change of the reader's own, unsaved, as they left it on this device", async () => {
    draw()
    await pick("Closing")
    reopen()
    // The page keeps the reader's change: Notes the other way.
    saveViewRules("t", { ...byNotes, sort: [{ field: "notes", dir: "asc" }] })
    const { onApply } = draw()
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "View: Closing, changed" })).toBeTruthy()
  })

  it("keeps the rules this device holds, under a key kept before that names the view alone", () => {
    window.localStorage.setItem("onecamp:tableSavedView:t", "v2")
    saveViewRules("t", byNotes)
    const { onApply } = draw()
    expect(onApply).not.toHaveBeenCalled()
  })
})
