import { describe, expect, it } from "vitest"
import { CALENDAR_KEYS, calendarKeyHint, calendarKeyRow, calendarShortcutRows } from "./keys"

const press = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe("the calendar's key table", () => {
  it("gives every key to one row only", () => {
    const chords = CALENDAR_KEYS.flatMap((r) => [r.keys, ...(r.alt ?? [])])
    expect(new Set(chords).size).toBe(chords.length)
  })

  it("finds the row a key press is, Google Calendar's keys included", () => {
    expect(calendarKeyRow(press("n"), false)?.command).toBe("next")
    expect(calendarKeyRow(press("p"), false)?.command).toBe("previous")
    // Caps Lock is still P; Shift+P is another key.
    expect(calendarKeyRow(press("P"), false)?.command).toBe("previous")
    expect(calendarKeyRow(press("P", { shiftKey: true }), false)).toBeNull()
    expect(calendarKeyRow(press("5"), false)?.command).toBe("agenda")
    expect(calendarKeyRow(press("Backspace"), false)?.command).toBe("delete")
    // Mod is ⌘ on a Mac and Ctrl elsewhere.
    expect(calendarKeyRow(press("z", { metaKey: true }), true)?.command).toBe("undo")
    expect(calendarKeyRow(press("z", { ctrlKey: true }), false)?.command).toBe("undo")
    expect(calendarKeyRow(press("z", { metaKey: true }), false)).toBeNull()
    expect(calendarKeyRow(press("j", { altKey: true }), false)).toBeNull()
    expect(calendarKeyRow(press("?", { shiftKey: true }), false)).toBeNull()
  })

  it("names a command's first key, for the toolbar's hints", () => {
    expect(calendarKeyHint("next")).toBe("J")
    expect(calendarKeyHint("newEvent")).toBe("C")
    expect(calendarKeyHint("search")).toBe("/")
  })

  it("writes its rows as the shortcut list writes keys", () => {
    const rows = calendarShortcutRows()
    expect(rows).toHaveLength(CALENDAR_KEYS.length)
    expect(rows).toContainEqual({ keys: "Delete or Backspace", does: "Delete the selected event" })
    expect(rows).toContainEqual({ keys: "Z or Ctrl/⌘ + Z", does: "Undo the last move" })
    expect(rows).toContainEqual({ keys: "Ctrl/⌘ + Enter", does: "Save the event you're editing" })
    expect(rows).toContainEqual({ keys: "Alt + ↑ or Alt + ↓", does: "Move the focused event 15 minutes" })
  })
})
