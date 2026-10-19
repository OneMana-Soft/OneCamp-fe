import { describe, expect, it } from "vitest"
import { undoKey } from "@/lib/tables/undoKeys"

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {}, target: EventTarget | null = document.body) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target,
  ...mods,
})

describe("a table page's undo and redo keys", () => {
  it("undo with ⌘Z on a Mac and Ctrl+Z elsewhere; redo with the shift held, or Ctrl+Y", () => {
    expect(undoKey(key("z", { metaKey: true }), true)).toBe("undo")
    expect(undoKey(key("Z", { metaKey: true, shiftKey: true }), true)).toBe("redo")
    expect(undoKey(key("z", { ctrlKey: true }), false)).toBe("undo")
    expect(undoKey(key("z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo")
    expect(undoKey(key("y", { ctrlKey: true }), false)).toBe("redo")
  })

  it("are no one else's keys", () => {
    expect(undoKey(key("z"), true)).toBeNull()
    expect(undoKey(key("z", { ctrlKey: true }), true)).toBeNull()
    expect(undoKey(key("z", { metaKey: true }), false)).toBeNull()
    expect(undoKey(key("z", { metaKey: true, altKey: true }), true)).toBeNull()
    expect(undoKey(key("y", { metaKey: true }), true)).toBeNull()
    expect(undoKey(key("x", { metaKey: true }), true)).toBeNull()
  })

  it("leave a field's own text to the browser's undo, and a menu's keys to it", () => {
    const input = document.createElement("input")
    const area = document.createElement("textarea")
    const editor = document.createElement("div")
    editor.contentEditable = "true"
    document.body.append(editor)
    const menu = document.createElement("div")
    menu.setAttribute("data-radix-popper-content-wrapper", "")
    const item = document.createElement("button")
    menu.append(item)
    for (const t of [input, area, item]) expect(undoKey(key("z", { metaKey: true }, t), true)).toBeNull()
    // jsdom has no isContentEditable: what a browser says is read as it.
    Object.defineProperty(editor, "isContentEditable", { value: true })
    expect(undoKey(key("z", { metaKey: true }, editor), true)).toBeNull()
    // A cell's button, the grid, the record panel: the table's own undo.
    expect(undoKey(key("z", { metaKey: true }, document.createElement("button")), true)).toBe("undo")
    editor.remove()
  })
})
