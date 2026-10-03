import { describe, expect, it } from "vitest"
import {
  getInboxKeyboardAction,
  getNextInboxSelectionIndex,
  shouldHandleInboxShortcutTarget,
} from "./inboxKeyboardNavigation"

describe("getInboxKeyboardAction", () => {
  it.each([
    ["j", "next"],
    ["k", "previous"],
    ["Enter", "open"],
    ["o", "open"],
  ] as const)("maps %s to %s", (key, action) => {
    expect(getInboxKeyboardAction(key)).toBe(action)
  })

  it("ignores unrelated keys", () => {
    expect(getInboxKeyboardAction("x")).toBeNull()
  })
})

describe("getNextInboxSelectionIndex", () => {
  it("moves to the next and previous conversation", () => {
    expect(getNextInboxSelectionIndex(0, "next", 3)).toBe(1)
    expect(getNextInboxSelectionIndex(2, "previous", 3)).toBe(1)
  })

  it("keeps the selection within the list boundaries", () => {
    expect(getNextInboxSelectionIndex(0, "previous", 3)).toBe(0)
    expect(getNextInboxSelectionIndex(2, "next", 3)).toBe(2)
  })

  it("returns no selection for an empty inbox", () => {
    expect(getNextInboxSelectionIndex(0, "next", 0)).toBe(-1)
  })
})

describe("shouldHandleInboxShortcutTarget", () => {
  it("does not handle shortcuts while typing in the search or reply fields", () => {
    expect(shouldHandleInboxShortcutTarget(document.createElement("input"))).toBe(false)
    expect(shouldHandleInboxShortcutTarget(document.createElement("textarea"))).toBe(false)
  })

  it("does not handle shortcuts in other editable content", () => {
    const editor = document.createElement("div")
    editor.setAttribute("contenteditable", "true")

    expect(shouldHandleInboxShortcutTarget(editor)).toBe(false)
  })

  it("preserves other controls while allowing inbox rows and the page", () => {
    const button = document.createElement("button")
    const row = document.createElement("button")
    row.setAttribute("data-inbox-thread", "")

    expect(shouldHandleInboxShortcutTarget(button)).toBe(false)
    expect(shouldHandleInboxShortcutTarget(row)).toBe(true)
    expect(shouldHandleInboxShortcutTarget(document.body)).toBe(true)
  })
})
