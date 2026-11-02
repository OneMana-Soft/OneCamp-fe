import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { TableEditing, TableEditor } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

// Who edits a table's rows (V-170): the Share dialog's choice as it reads the
// server's answer, the one change each pick sends, and a private table's card.

pinTestClock()

const setTableEditing = vi.fn()
vi.mock("@/services/tableEditingService", () => ({ setTableEditing: (...a: unknown[]) => setTableEditing(...a) }))
vi.mock("@/services/docChromeService", () => ({ searchPeople: vi.fn(async () => []) }))

const { WhoCanEdit, editingChange, editingMode } = await import("@/components/table/WhoCanEdit")

const person = (user_id: string): TableEditor => ({ user_id, name: user_id, email: `${user_id}@x.test`, granted_at: "2026-11-01T00:00:00Z" })
const editing = (general: TableEditing["general"], ...ids: string[]): TableEditing => ({ general, people: ids.map(person) })

afterEach(() => {
  cleanup()
  setTableEditing.mockReset()
})

describe("editingMode", () => {
  it("reads the edit level as everyone, whoever was chosen before", () => {
    expect(editingMode(editing("edit"))).toBe("everyone")
    expect(editingMode(editing("edit", "ana"))).toBe("everyone")
  })

  it("reads comment with people as the people chosen, and with none as managers only", () => {
    expect(editingMode(editing("comment", "ana"))).toBe("people")
    expect(editingMode(editing("comment"))).toBe("managers")
  })

  it("keeps the people choice this dialog has just made while none are picked yet", () => {
    expect(editingMode(editing("comment"), "people")).toBe("people")
    expect(editingMode(editing("comment"), "managers")).toBe("managers")
  })
})

describe("editingChange", () => {
  it("sends nothing when who edits already reads as the pick", () => {
    expect(editingChange(editing("edit"), "everyone")).toBeNull()
    expect(editingChange(editing("comment", "ana"), "people")).toBeNull()
    expect(editingChange(editing("comment"), "people")).toBeNull()
    expect(editingChange(editing("comment"), "managers")).toBeNull()
  })

  it("moves the level alone for everyone and for the people chosen", () => {
    expect(editingChange(editing("comment", "ana"), "everyone")).toEqual({ general: "edit" })
    expect(editingChange(editing("edit"), "people")).toEqual({ general: "comment" })
  })

  it("ends every chosen person's grant for managers only", () => {
    expect(editingChange(editing("comment", "ana", "ben"), "managers")).toEqual({ general: "comment", remove: ["ana", "ben"] })
    expect(editingChange(editing("edit", "ana"), "managers")).toEqual({ general: "comment", remove: ["ana"] })
  })

  it("sends no empty remove when no one was chosen", () => {
    const change = editingChange(editing("edit"), "managers")
    expect(change).toEqual({ general: "comment" })
    expect(change).not.toHaveProperty("remove")
  })
})

describe("WhoCanEdit on a private table", () => {
  it("says only its owner and admins edit, offers no choice and sends nothing", () => {
    const { container } = render(<WhoCanEdit tableId="t1" editing={editing("comment", "ana")} isPrivate />)
    expect(container.querySelector('[data-who-can-edit="private"]')).not.toBeNull()
    expect(screen.getByText("Only its owner and admins")).toBeTruthy()
    expect(screen.queryByText("Everyone who can open it")).toBeNull()
    expect(screen.queryByText("Only managers")).toBeNull()
    expect(container.querySelector("[data-editing-people]")).toBeNull()
    expect(setTableEditing).not.toHaveBeenCalled()
  })
})
