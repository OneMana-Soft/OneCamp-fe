import { describe, expect, it } from "vitest"
import { MAIN, claims, hrefOfPane, isPaneList, paneFromHref, splitShortcut, stepView, withPane } from "./split"

const id = "3ea2ea90-0322-43b9-9efd-cee17ec92b01"

describe("split view", () => {
  it("names the pane an app link opens", () => {
    expect(paneFromHref(`/app/channel/${id}`)).toEqual({ kind: "channel", id })
    expect(paneFromHref(`/app/chat/group/${id}?x=1`)).toEqual({ kind: "group", id })
    expect(paneFromHref(`/app/chat/${id}`)).toEqual({ kind: "chat", id })
    expect(paneFromHref(`/app/project/${id}?tab=kanban`)).toEqual({ kind: "project", id })
    expect(paneFromHref("/app/home")).toBeNull()
    expect(paneFromHref(`https://elsewhere.example/app/doc/${id}`)).toBeNull()
  })
  it("round-trips a pane to its page", () => {
    for (const kind of ["channel", "group", "chat", "doc", "project", "task"] as const) expect(paneFromHref(hrefOfPane({ kind, id }))).toEqual({ kind, id })
  })
  it("keeps an open pane, adds on the right, and drops the oldest past the limit", () => {
    const a = { kind: "doc" as const, id: "aaaaaa" }, b = { kind: "chat" as const, id: "bbbbbb" }, c = { kind: "task" as const, id: "cccccc" }
    expect(withPane([a], a)).toEqual([a])
    expect(withPane([a, b], c)).toEqual([b, c])
  })
  it("accepts only what it wrote", () => {
    expect(isPaneList([{ kind: "doc", id: "x" }])).toBe(true)
    expect(isPaneList([{ kind: "nope", id: "x" }])).toBe(false)
    expect(isPaneList("junk")).toBe(false)
  })
})

describe("split shortcuts", () => {
  const k = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ code, ctrlKey: true, altKey: true, metaKey: false, shiftKey: false, ...mods })
  it("are Ctrl+Alt and nothing else", () => {
    expect(splitShortcut(k("Digit2"))).toEqual({ type: "goTo", view: 0 })
    expect(splitShortcut(k("Enter"))).toEqual({ type: "focus" })
    expect(splitShortcut(k("Digit2", { altKey: false }))).toBeNull()
    expect(splitShortcut(k("Digit2", { metaKey: true }))).toBeNull()
    expect(splitShortcut(k("KeyQ"))).toBeNull()
    // AltGr+S types "ś" on a Polish keyboard: it is not a shortcut.
    expect(splitShortcut({ ...k("KeyS"), altGraph: true })).toBeNull()
  })
  it("leave the editor's heading keys alone when nothing is side by side", () => {
    expect(claims({ type: "goTo", view: 0 }, 0)).toBe(false)
    expect(claims({ type: "goTo", view: 0 }, 1)).toBe(true)
    expect(claims({ type: "openHere" }, 0)).toBe(true)
    expect(splitShortcut(k("BracketRight"))).toEqual({ type: "step", by: 1 })
    expect(splitShortcut(k("ArrowRight"))).toBeNull()
  })
  it("step through the views and wrap", () => {
    expect(stepView(MAIN, 1, 2)).toBe(0)
    expect(stepView(1, 1, 2)).toBe(MAIN)
    expect(stepView(MAIN, -1, 1)).toBe(0)
    expect(stepView(MAIN, 1, 0)).toBe(MAIN)
  })
})
