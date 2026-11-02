import { describe, expect, it } from "vitest"
import { combosOf } from "@/components/shortcuts/ShortcutsDialog"
import { keyPlace, TABLE_KEYS, tableCellCommand, tableKeyChord, tableKeyRow, tableShortcutRows, type TableCommand } from "@/lib/tables/tableKeys"

// A table's keys (airtable-04: AV-6 and AV-7) come from one table: the page and
// the grid bind its rows, and the app's keys list shows them as its Tables
// group. The undo and find cases are undoKeys' and findKey's, carried over
// whole when their keys moved into the table.

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {}, target: EventTarget | null = document.body) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target,
  ...mods,
})
type Press = ReturnType<typeof key>
const command = (e: Press, mac: boolean): TableCommand | null => tableKeyRow(e, mac, keyPlace(e.target))?.command ?? null
const undoKey = (e: Press, mac: boolean) => {
  const c = command(e, mac)
  return c === "undo" || c === "redo" ? c : null
}
const findKey = (e: Press, mac: boolean) => {
  const c = command(e, mac)
  return c === "find" || c === "replace" ? c : null
}
const inside = (attr: string, value = "") => {
  const box = document.createElement("div")
  box.setAttribute(attr, value)
  const button = document.createElement("button")
  box.append(button)
  return button
}

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
    const item = inside("data-radix-popper-content-wrapper")
    for (const t of [input, area, item]) expect(undoKey(key("z", { metaKey: true }, t), true)).toBeNull()
    // jsdom has no isContentEditable: what a browser says is read as it.
    Object.defineProperty(editor, "isContentEditable", { value: true })
    expect(undoKey(key("z", { metaKey: true }, editor), true)).toBeNull()
    // A cell's button, the grid, the record panel: the table's own undo.
    expect(undoKey(key("z", { metaKey: true }, document.createElement("button")), true)).toBe("undo")
    editor.remove()
  })
})

describe("a selected cell at rest (G1)", () => {
  it("is no typing: ⌘Z on its read-only box undoes the table's latest change, a paste included", () => {
    const rest = document.createElement("textarea")
    rest.readOnly = true
    expect(undoKey(key("z", { ctrlKey: true }, rest), false)).toBe("undo")
    const restInput = document.createElement("input")
    restInput.readOnly = true
    expect(undoKey(key("z", { metaKey: true, shiftKey: true }, restInput), true)).toBe("redo")
  })
  it("but a box open for typing keeps the browser's own undo of its text", () => {
    expect(undoKey(key("z", { ctrlKey: true }, document.createElement("textarea")), false)).toBeNull()
    expect(undoKey(key("z", { ctrlKey: true }, document.createElement("input")), false)).toBeNull()
  })
})

describe("a table's find and replace keys (G2b)", () => {
  it("opens find with Ctrl+F off a Mac and ⌘F on one, anywhere on the page, a cell's box included", () => {
    expect(findKey(key("f", { ctrlKey: true }), false)).toBe("find")
    expect(findKey(key("F", { metaKey: true }), true)).toBe("find")
    const box = document.createElement("textarea")
    expect(findKey(key("f", { ctrlKey: true }, box), false)).toBe("find")
  })

  it("opens replace with Ctrl+H off a Mac and ⌘⇧H on one, where ⌘H hides the app", () => {
    expect(findKey(key("h", { ctrlKey: true }), false)).toBe("replace")
    expect(findKey(key("H", { metaKey: true, shiftKey: true }), true)).toBe("replace")
    expect(findKey(key("h", { metaKey: true }), true)).toBeNull()
  })

  it("leaves every other key, and the other platform's modifier, to the browser", () => {
    expect(findKey(key("f"), false)).toBeNull()
    expect(findKey(key("f", { metaKey: true }), false)).toBeNull()
    expect(findKey(key("f", { ctrlKey: true }), true)).toBeNull()
    expect(findKey(key("f", { ctrlKey: true, altKey: true }), false)).toBeNull()
    expect(findKey(key("g", { ctrlKey: true }), false)).toBeNull()
  })

  it("stays out of a dialog over the table: the keys list's own live keys and a form keep theirs", () => {
    expect(findKey(key("f", { ctrlKey: true }, inside("role", "dialog")), false)).toBeNull()
  })
})

describe("Airtable's keys on a table (AV-7)", () => {
  it("switch table with ⌘J and view with ⌘⇧K (Ctrl off a Mac), from a cell's box or the search too", () => {
    expect(command(key("j", { metaKey: true }), true)).toBe("switchTable")
    expect(command(key("j", { ctrlKey: true }), false)).toBe("switchTable")
    expect(command(key("K", { metaKey: true, shiftKey: true }), true)).toBe("switchView")
    expect(command(key("k", { ctrlKey: true, shiftKey: true }), false)).toBe("switchView")
    expect(command(key("j", { ctrlKey: true }, document.createElement("input")), false)).toBe("switchTable")
    // The other platform's modifier, or no Shift, is someone else's: ⌘K is search, Ctrl+J on a Mac nothing.
    expect(command(key("j", { ctrlKey: true }), true)).toBeNull()
    expect(command(key("k", { metaKey: true }), true)).toBeNull()
  })

  it("open the filter with ⌘⇧F and the sort with ⌘⇧S, and add a row with ⌘⇧⏎ from a cell too", () => {
    expect(command(key("F", { metaKey: true, shiftKey: true }), true)).toBe("filter")
    expect(command(key("s", { ctrlKey: true, shiftKey: true }), false)).toBe("sort")
    expect(command(key("Enter", { ctrlKey: true, shiftKey: true }, document.createElement("textarea")), false)).toBe("addRow")
  })

  it("never from a menu or a dialog, where the keys are theirs", () => {
    for (const t of [inside("data-radix-popper-content-wrapper"), inside("role", "dialog")]) {
      expect(command(key("j", { metaKey: true }, t), true)).toBeNull()
      expect(command(key("k", { metaKey: true, shiftKey: true }, t), true)).toBeNull()
      expect(command(key("Enter", { metaKey: true, shiftKey: true }, t), true)).toBeNull()
    }
  })

  it("keep R and / to the page, off every field: a cell at rest types its R into the cell", () => {
    expect(command(key("r"), false)).toBe("addRow")
    expect(command(key("R"), true)).toBe("addRow")
    expect(command(key("/"), false)).toBe("search")
    const rest = document.createElement("textarea")
    rest.readOnly = true
    for (const t of [rest, document.createElement("input"), inside("role", "dialog"), inside("data-radix-popper-content-wrapper")]) {
      expect(command(key("r", {}, t), false)).toBeNull()
      expect(command(key("/", {}, t), false)).toBeNull()
    }
    expect(command(key("r", { ctrlKey: true }), false)).toBeNull()
  })
})

describe("the keys a selected cell takes (AV-6)", () => {
  it("Space expands the row's record, ⌘; sets a date to today; Shift+Space stays the row's selection", () => {
    expect(tableCellCommand(key(" "), false)).toBe("expandRecord")
    expect(tableCellCommand(key(";", { metaKey: true }), true)).toBe("today")
    expect(tableCellCommand(key(";", { ctrlKey: true }), false)).toBe("today")
    expect(tableCellCommand(key(" ", { shiftKey: true }), false)).toBeNull()
    expect(tableCellCommand(key(" ", { ctrlKey: true }), false)).toBeNull()
    expect(tableCellCommand(key("j", { metaKey: true }), true)).toBeNull()
  })

  it("reads a browser's key event, whose keys are getters: the space bar as Space, its modifiers kept", () => {
    expect(tableCellCommand(new KeyboardEvent("keydown", { key: " " }), false)).toBe("expandRecord")
    expect(tableCellCommand(new KeyboardEvent("keydown", { key: " ", shiftKey: true }), false)).toBeNull()
    expect(tableCellCommand(new KeyboardEvent("keydown", { key: " ", metaKey: true }), true)).toBeNull()
    expect(tableCellCommand(new KeyboardEvent("keydown", { key: ";", ctrlKey: true }), false)).toBe("today")
  })

  it("are the grid's alone: the page never takes them", () => {
    expect(command(key(" "), false)).toBeNull()
    expect(command(key(";", { ctrlKey: true }), false)).toBeNull()
  })
})

describe("the Tables group in the app's keys list", () => {
  const listed = (mac: boolean) => tableShortcutRows(mac)

  it("lists every key once, by what it does, in the list's words; the two of a platform only", () => {
    const rows = listed(false)
    const does = rows.map((r) => r.does)
    expect(new Set(does).size).toBe(does.length)
    const of = (label: string) => rows.find((r) => r.does === label)?.keys
    expect(of("Switch to another table")).toBe("Ctrl/⌘ + J")
    expect(of("Switch to another view")).toBe("Ctrl/⌘ + Shift + K")
    expect(of("Find and replace")).toBe("Ctrl/⌘ + H")
    expect(listed(true).find((r) => r.does === "Find and replace")?.keys).toBe("Ctrl/⌘ + Shift + H")
    expect(of("Add a row")).toBe("R or Ctrl/⌘ + Shift + Enter")
    expect(of("Redo it")).toBe("Ctrl/⌘ + Shift + Z or Ctrl/⌘ + Y")
    expect(listed(true).find((r) => r.does === "Redo it")?.keys).toBe("Ctrl/⌘ + Shift + Z")
    expect(of("Expand the row's record")).toBe("Space")
    expect(of("Set a date to today")).toBe("Ctrl/⌘ + ;")
    expect(of("Select the row")).toBe("Shift + Space")
    expect(of("Move between cells")).toBe("↑ or ↓ or ← or →")
  })

  it("writes a row's chords that share their modifiers as one, as the list writes Ctrl + Alt + 1 / 2 / 3, and the list reads each back", () => {
    const of = (label: string) => listed(false).find((r) => r.does === label)?.keys ?? ""
    expect(of("Select cells")).toBe("Shift + ↓ / ↑ / ← / →")
    expect(of("Copy or paste cells")).toBe("Ctrl/⌘ + C / V")
    // Keys with no modifier keep "or".
    expect(of("Move between cells")).toBe("↑ or ↓ or ← or →")
    // Enter edits a selected cell, as a click leaves one, and saves one being edited (V-295); Shift + Enter, which goes up
    // from both, has its own row.
    expect(of("Edit the selected cell, or save the one being edited and go down")).toBe("Enter")
    expect(of("Save the cell and go up a row")).toBe("Shift + Enter")
    // The keys list lights a row by each of its chords (ShortcutsDialog's combosOf), grouped or not.
    expect(combosOf(of("Select cells"))).toEqual([["shift", "↓"], ["shift", "↑"], ["shift", "←"], ["shift", "→"]])
    expect(combosOf(of("Copy or paste cells"))).toEqual([["mod", "c"], ["mod", "v"]])
  })

  it("names no key that does nothing: each key a command runs is that command's, on the page or in a cell", () => {
    for (const mac of [true, false]) {
      for (const row of TABLE_KEYS) {
        if (!row.command || (row.on && row.on !== (mac ? "mac" : "pc"))) continue
        for (const chord of [row.keys, ...(row.alt ?? [])]) {
          const parts = chord.split(/-(?!$)/)
          const name = parts.pop()!
          const mod = parts.includes("Mod")
          const press = key(name === "Space" ? " " : name, { shiftKey: parts.includes("Shift"), metaKey: mod && mac, ctrlKey: mod && !mac })
          const got = row.cell ? tableCellCommand(press, mac) : command(press, mac)
          expect(got, `${chord} on ${mac ? "a Mac" : "a PC"}`).toBe(row.command)
        }
      }
    }
  })

  it("gives each command's key as this computer writes it, for a menu's or the palette's hint", () => {
    expect(tableKeyChord("switchTable", true)).toBe("Mod-j")
    expect(tableKeyChord("replace", true)).toBe("Mod-Shift-h")
    expect(tableKeyChord("replace", false)).toBe("Mod-h")
    expect(tableKeyChord("switchView", false)).toBe("Mod-Shift-k")
  })
})
