import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => true }))

import { ShortcutsDialog, combosOf, openShortcuts, pieces, pressedMatches, pressedOf } from "./ShortcutsDialog"

// Design v3 (shell §K, mock M7): a 720px dialog with a filter that takes the
// focus, two columns of groups titled as the palette titles its groups, v3 kbd
// chips, and rows that light up when their keys are pressed.

afterEach(cleanup)

const openList = () => {
  render(<ShortcutsDialog />)
  act(() => openShortcuts())
}

describe("the keyboard shortcuts list", () => {
  it("titles its groups as the palette titles its groups, in v3's order", () => {
    openList()
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(["Everywhere", "Go to", "Lists and boards", "Split view", "Composer"])
    const command = readFileSync(resolve(__dirname, "../ui/command.tsx"), "utf8")
    expect(command).toMatch(/\[&_\[cmdk-group-heading\]\]:font-medium/)
    for (const h of headings) {
      const cls = h.className.split(/\s+/)
      expect(cls).toEqual(expect.arrayContaining(["text-2xs", "font-medium", "text-ink-3"]))
      expect(cls).not.toContain("uppercase")
    }
  })

  it("is 720px at r16 on e4, in two columns", () => {
    openList()
    const dialog = document.querySelector("[data-shortcuts-dialog]")!
    expect(dialog.className).toMatch(/max-w-\[720px\]/)
    // Design v3 (admin §8 H2): the dialog primitive writes its 16px as rounded-[16px].
    expect(dialog.className).toMatch(/rounded-\[16px\]/)
    expect(dialog.className).toMatch(/shadow-e4/)
    expect(document.querySelector("[data-shortcut-columns]")!.className).toMatch(/md:grid-cols-2/)
  })

  it("opens with the focus in the filter, not on the close button", () => {
    openList()
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Filter shortcuts" }))
  })

  it("narrows by what a shortcut does, and by its key", () => {
    openList()
    const filter = screen.getByRole("textbox", { name: "Filter shortcuts" })
    fireEvent.change(filter, { target: { value: "inbox" } })
    expect(screen.getByText("Inbox")).toBeTruthy()
    expect(screen.queryByText("My tasks")).toBeNull()
    fireEvent.change(filter, { target: { value: "x" } })
    expect(screen.getByText(/Select it/)).toBeTruthy()
    fireEvent.change(filter, { target: { value: "zzzz" } })
    expect(screen.getByText(/No shortcut matches/)).toBeTruthy()
  })

  it("names My tasks in sentence case, and shows G then I for Inbox with G A as another way", () => {
    openList()
    expect(screen.getByText("My tasks")).toBeTruthy()
    const inbox = screen.getByText("Inbox").closest("li")!
    expect(inbox.textContent).toBe("InboxGthenIorGthenA")
    expect(inbox.querySelectorAll("kbd")).toHaveLength(4)
    expect(screen.getByText("Mail").closest("li")!.textContent).toMatch(/GthenE/)
  })

  it("lights the row of a pressed combination, without doing it", () => {
    openList()
    const palette = vi.fn()
    document.addEventListener("keydown", palette)
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    const row = screen.getByText("Search or ask").closest("li")!
    expect(row.getAttribute("data-hit")).toBe("true")
    expect(row.querySelector("kbd")!.className).toMatch(/kbd-hit/)
    expect(palette).not.toHaveBeenCalled()
    document.removeEventListener("keydown", palette)
  })
})

describe("reading a written shortcut", () => {
  it("splits keys from words", () => {
    expect(pieces("J / K (or ↓ / ↑)", false)).toEqual([{ key: "J" }, { word: "/" }, { key: "K" }, { word: "or" }, { key: "↓" }, { word: "/" }, { key: "↑" }])
    expect(pieces("Ctrl/⌘ + K", true)).toEqual([{ key: "⌘" }, { key: "K" }])
    expect(pieces("Alt + click a link", false)).toEqual([{ key: "Alt" }, { word: "click" }, { word: "a" }, { word: "link" }])
  })

  it("knows the combinations a row lists, and when one is pressed", () => {
    expect(combosOf("Ctrl + Alt + 1 / 2 / 3")).toEqual([["ctrl", "alt", "1"], ["ctrl", "alt", "2"], ["ctrl", "alt", "3"]])
    expect(combosOf("G then H")).toEqual([])
    const mod = combosOf("Ctrl/⌘ + K")[0]
    expect(pressedMatches(mod, pressedOf({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }))).toBe(true)
    expect(pressedMatches(mod, pressedOf({ key: "k", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }))).toBe(false)
  })
})
