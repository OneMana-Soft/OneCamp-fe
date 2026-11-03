import { describe, expect, it } from "vitest"

import { focusHandOff } from "./focusHandOff"
import { watchInputModality } from "./inputModality"

// A menu's onCloseAutoFocus event, as Radix sends it: cancelable, to keep the focus where it is.
const closing = () => new Event("focusScope.autoFocusOnUnmount", { cancelable: true })
const key = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
const pointer = () => window.dispatchEvent(new Event("pointerdown"))

describe("a menu's hand-off of the focus as it closes", () => {
  watchInputModality()

  it("leaves it to the dialog or panel a pick opens, that once", () => {
    const handOff = focusHandOff()
    let opened = 0
    key()
    handOff.to(() => opened++)()
    const first = closing()
    handOff.onCloseAutoFocus(first)
    expect(opened).toBe(1)
    expect(first.defaultPrevented).toBe(true)
    const next = closing()
    handOff.onCloseAutoFocus(next)
    expect(next.defaultPrevented).toBe(false)
  })

  it("gives it back to the trigger after a key, and keeps it put after a pointer", () => {
    const handOff = focusHandOff()
    key()
    const byKey = closing()
    handOff.onCloseAutoFocus(byKey)
    expect(byKey.defaultPrevented).toBe(false)
    pointer()
    const byPointer = closing()
    handOff.onCloseAutoFocus(byPointer)
    expect(byPointer.defaultPrevented).toBe(true)
  })

  // A tree row's "⋯" shows only while its row has the menu, so the close hid
  // the trigger Radix gave the focus back to, and it fell to <body> (F8).
  it("gives a key's close to its target when the close hides the trigger, unless the focus went somewhere", () => {
    const row = document.body.appendChild(Object.assign(document.createElement("div"), { tabIndex: -1 }))
    const field = document.body.appendChild(document.createElement("input"))
    const handOff = focusHandOff(() => row)
    key()
    const byKey = closing()
    handOff.onCloseAutoFocus(byKey)
    expect(byKey.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(row)
    // A pick that put the focus somewhere, as a dialog's field, keeps it.
    field.focus()
    key()
    handOff.onCloseAutoFocus(closing())
    expect(document.activeElement).toBe(field)
    // After a pointer it stays put.
    field.blur()
    pointer()
    const byPointer = closing()
    handOff.onCloseAutoFocus(byPointer)
    expect(byPointer.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(document.body)
    row.remove()
    field.remove()
  })

  // A sheet over the sheet that holds the row: the trap of the one behind can
  // put the focus on its own box as this one goes, a task before its close
  // (V-426; focusHandOffNested.test.tsx has it with Radix's own dialogs).
  it("gives a key's close to its target when the focus is only on the dialog that holds it", () => {
    const dialog = (): HTMLElement => {
      const box = Object.assign(document.createElement("div"), { tabIndex: -1 })
      box.setAttribute("role", "dialog")
      return document.body.appendChild(box)
    }
    const behind = dialog()
    const row = behind.appendChild(Object.assign(document.createElement("div"), { tabIndex: -1 }))
    const field = behind.appendChild(document.createElement("input"))
    const other = dialog()
    const handOff = focusHandOff(() => row)
    behind.focus()
    key()
    const byKey = closing()
    handOff.onCloseAutoFocus(byKey)
    expect(byKey.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(row)
    // A field in that dialog keeps it, as one anywhere does.
    field.focus()
    key()
    handOff.onCloseAutoFocus(closing())
    expect(document.activeElement).toBe(field)
    // So does a dialog that doesn't hold the row: one a pick opened.
    other.focus()
    key()
    handOff.onCloseAutoFocus(closing())
    expect(document.activeElement).toBe(other)
    behind.remove()
    other.remove()
  })
})
