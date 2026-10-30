import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => true }))
// The page the list is opened on: the calendar shows its own group first.
let pathname: string | null = null
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))

import { ShortcutsDialog, combosOf, openShortcuts, pieces, pressedMatches, pressedOf } from "./ShortcutsDialog"
import { CALENDAR_KEYS } from "@/lib/calendar/keys"

// Design v3 (shell §K, mock M7): a 720px dialog with a filter that takes the
// focus, two columns of groups titled as the palette titles its groups, v3 kbd
// chips, and rows that light up when their keys are pressed.

afterEach(() => {
  cleanup()
  pathname = null
})

const openList = () => {
  render(<ShortcutsDialog />)
  act(() => openShortcuts())
}

describe("the keyboard shortcuts list", () => {
  it("titles its groups as the palette titles its groups, in v3's order", () => {
    openList()
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(["Everywhere", "Go to", "Calendar", "Lists and boards", "Split view", "Composer"])
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

  it("scrolls its list alone, under a header and filter that stay, faded at its ends with room after the last row", () => {
    openList()
    const dialog = document.querySelector("[data-shortcuts-dialog]")!
    const list = document.querySelector("[data-shortcut-columns]")!
    expect(dialog.className).toMatch(/\boverflow-hidden\b/)
    expect(dialog.className).not.toMatch(/\boverflow-y-auto\b/)
    expect(list.className).toMatch(/\boverflow-y-auto\b/)
    expect(list.className).toMatch(/\bmin-h-0\b/)
    expect(list.getAttribute("data-edge-fade")).toBe("block")
    expect(list.className).toMatch(/\bpb-8\b/)
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

// VD-34, FE-F-3: the calendar's keys were only in its tooltips. "?" on the
// calendar opens the list on a Calendar group made from the table it binds.
describe("the calendar's group", () => {
  it("comes first on the calendar, and after Go to elsewhere", () => {
    pathname = "/app/calendar"
    openList()
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent).slice(0, 3)).toEqual(["Calendar", "Everywhere", "Go to"])
  })

  it("lists every key the calendar binds, with its other keys", () => {
    openList()
    const rows = Array.from(document.querySelectorAll('[data-shortcut-group="Calendar"] li'))
    expect(rows.map((r) => r.querySelector("span")?.textContent)).toEqual(CALENDAR_KEYS.map((r) => r.label))
    expect(screen.getByText("Next day, week or month").closest("li")!.textContent).toBe("Next day, week or monthJorN")
    expect(screen.getByText("Undo the last move").closest("li")!.textContent).toBe("Undo the last moveZorCtrlZ")
    expect(screen.getByText("Search events").closest("li")!.querySelector("kbd")?.textContent).toBe("/")
  })
})

// SD-64: a Slack person's ⌘/ (Ctrl+/) did nothing, and F1 opened the
// browser's help. Both open the list; ⌘/ from a message box too, as Slack's.
// A page's own keys (a call's, calls meet-18) come first while the page is
// up, from the page's own chunk, and go with it.
describe("a page's own group", () => {
  it("comes first while the page shows it, and goes with the page", async () => {
    const { showPageKeys } = await import("@/lib/shortcuts/pageGroups")
    const hide = showPageKeys({ title: "This call", rows: [{ keys: "M or Ctrl/⌘ + D", does: "Turn your microphone on or off" }] })
    openList()
    expect(screen.getAllByRole("heading", { level: 3 })[0].textContent).toBe("This call")
    expect(screen.getByText("Turn your microphone on or off")).toBeTruthy()
    cleanup()
    hide()
    openList()
    expect(screen.queryByRole("heading", { level: 3, name: "This call" })).toBeNull()
  })
})

describe("opening the list", () => {
  const isOpen = () => document.querySelectorAll("[data-shortcuts-dialog]").length

  it("opens on Ctrl or ⌘ with /, from a message box too", () => {
    render(<ShortcutsDialog />)
    const box = document.createElement("div")
    box.contentEditable = "true"
    document.body.appendChild(box)
    box.focus()
    const e = new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true, cancelable: true })
    act(() => void box.dispatchEvent(e))
    expect(isOpen()).toBe(1)
    expect(e.defaultPrevented).toBe(true)
    box.remove()
  })

  it("opens once on F1 where nothing is typed, in place of the browser's help, and not from a field", () => {
    render(<ShortcutsDialog />)
    const field = document.createElement("input")
    document.body.appendChild(field)
    fireEvent.keyDown(field, { key: "F1" })
    expect(isOpen()).toBe(0)
    field.remove()
    const e = new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true })
    act(() => void document.body.dispatchEvent(e))
    act(() => void document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true })))
    expect(e.defaultPrevented).toBe(true)
    expect(isOpen()).toBe(1)
  })

  it("leaves a key something else took to it: a doc's ⌘/ is its block menu", () => {
    render(<ShortcutsDialog />)
    const doc = document.createElement("div")
    doc.addEventListener("keydown", (e) => e.preventDefault())
    document.body.appendChild(doc)
    act(() => void doc.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true, cancelable: true })))
    expect(isOpen()).toBe(0)
    doc.remove()
  })

  it("lists the ways it opens, and lights them when pressed", () => {
    openList()
    const row = screen.getByText("This list").closest("li")!
    expect(row.textContent).toBe("This list?orCtrl/orF1")
    fireEvent.keyDown(window, { key: "/", ctrlKey: true })
    expect(row.getAttribute("data-hit")).toBe("true")
  })
})

describe("reading a written shortcut", () => {
  it("splits keys from words", () => {
    expect(pieces("J / K (or ↓ / ↑)", false)).toEqual([{ key: "J" }, { word: "/" }, { key: "K" }, { word: "or" }, { key: "↓" }, { word: "/" }, { key: "↑" }])
    expect(pieces("Ctrl/⌘ + K", true)).toEqual([{ key: "⌘" }, { key: "K" }])
    expect(pieces("Alt + click a link", false)).toEqual([{ key: "Alt" }, { word: "click" }, { word: "a" }, { word: "link" }])
    expect(pieces("/", false)).toEqual([{ key: "/" }])
    // A "/" after "+" is the slash key.
    expect(pieces("? or Ctrl/⌘ + / or F1", true)).toEqual([{ key: "?" }, { word: "or" }, { key: "⌘" }, { key: "/" }, { word: "or" }, { key: "F1" }])
  })

  it("knows the combinations a row lists, and when one is pressed", () => {
    expect(combosOf("Ctrl + Alt + 1 / 2 / 3")).toEqual([["ctrl", "alt", "1"], ["ctrl", "alt", "2"], ["ctrl", "alt", "3"]])
    expect(combosOf("G then H")).toEqual([])
    expect(combosOf("? or Ctrl/⌘ + / or F1")).toEqual([["mod", "/"]])
    const mod = combosOf("Ctrl/⌘ + K")[0]
    expect(pressedMatches(mod, pressedOf({ key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }))).toBe(true)
    expect(pressedMatches(mod, pressedOf({ key: "k", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }))).toBe(false)
  })
})
