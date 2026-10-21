import { describe, expect, it } from "vitest"
import { callConversationOf, canSwapBeside } from "./callConversation"
import { claims, isCallPane, restorablePanes, hrefOfPane, isPaneList, paneFromHref, splitShortcut } from "./split"
import { withPane } from "./splitLayout"

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
    for (const kind of ["channel", "group", "chat", "doc", "project", "task", "call-channel", "call-chat", "call-group"] as const)
      expect(paneFromHref(hrefOfPane({ kind, id }))).toEqual({ kind, id })
  })
  it("opens a call beside the page, one call at a time, and never restores one", () => {
    expect(paneFromHref(`/app/meet/ch/${id}`)).toEqual({ kind: "call-channel", id })
    const doc = { kind: "doc" as const, id: "dddddd" }, a = { kind: "call-chat" as const, id: "aaaaaa" }, b = { kind: "call-channel" as const, id: "bbbbbb" }
    expect(withPane([doc, a], b)).toEqual([doc, b])
    // Past the room, a thing opened beside makes room by closing the doc, not the call.
    const task = { kind: "task" as const, id: "tttttt" }
    expect(withPane([a, doc], task, 2)).toEqual([a, task])
    expect(withPane([doc, a], task, 2)).toEqual([a, task])
    expect(isCallPane(a)).toBe(true)
    expect(restorablePanes([doc, b])).toEqual([doc])
  })
  it("keeps an open pane, adds on the right, and drops the oldest never used past the limit", () => {
    const a = { kind: "doc" as const, id: "aaaaaa" }, b = { kind: "chat" as const, id: "bbbbbb" }, c = { kind: "task" as const, id: "cccccc" }
    expect(withPane([a], a)).toEqual([a])
    expect(withPane([a, b], c, 2)).toEqual([b, c])
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
    expect(splitShortcut(k("Digit2"))).toEqual({ type: "nth", at: 1 })
    expect(splitShortcut(k("Enter"))).toEqual({ type: "focus" })
    expect(splitShortcut(k("Digit2", { altKey: false }))).toBeNull()
    expect(splitShortcut(k("Digit2", { metaKey: true }))).toBeNull()
    expect(splitShortcut(k("KeyQ"))).toBeNull()
    // AltGr+S types "ś" on a Polish keyboard: it is not a shortcut.
    expect(splitShortcut({ ...k("KeyS"), altGraph: true })).toBeNull()
  })
  it("leave the editor's heading keys alone when nothing is side by side", () => {
    expect(claims({ type: "nth", at: 1 }, 0)).toBe(false)
    expect(claims({ type: "nth", at: 1 }, 1)).toBe(true)
    expect(claims({ type: "openHere" }, 0)).toBe(true)
    expect(splitShortcut(k("BracketRight"))).toEqual({ type: "step", by: 1 })
    expect(splitShortcut(k("ArrowRight"))).toBeNull()
  })
  // Case 22 (20 Oct 2026): with one pane, Ctrl+Alt+3 was taken for a third
  // view that wasn't there, so it did nothing and a doc lost its Heading 3.
  it("take a view's number only while that view is there: Ctrl+Alt+3 stays Heading 3 with one pane", () => {
    expect(claims(splitShortcut(k("Digit3"))!, 1)).toBe(false)
    expect(claims(splitShortcut(k("Digit3"))!, 2)).toBe(true)
    expect(claims(splitShortcut(k("Digit4"))!, 2)).toBe(false)
    expect(claims(splitShortcut(k("Digit4"))!, 3)).toBe(true)
    expect(splitShortcut(k("Digit5"))).toBeNull()
  })
  it("move the view with Shift, even the widths with =, and leave Shift with anything else alone", () => {
    expect(splitShortcut(k("BracketRight", { shiftKey: true }))).toEqual({ type: "move", by: 1 })
    expect(splitShortcut(k("BracketLeft", { shiftKey: true }))).toEqual({ type: "move", by: -1 })
    expect(splitShortcut(k("Equal"))).toEqual({ type: "even" })
    expect(splitShortcut(k("Digit2", { shiftKey: true }))).toBeNull()
    expect(claims({ type: "move", by: 1 }, 0)).toBe(false)
    expect(claims({ type: "even" }, 1)).toBe(true)
  })
})

describe("a call's own page", () => {
  it("names the conversation the call belongs to, which its dock's Chat opens beside it", () => {
    expect(callConversationOf(`/app/meet/ch/${id}`)).toEqual({ kind: "channel", id })
    expect(callConversationOf(`/app/meet/chat/${id}`)).toEqual({ kind: "chat", id })
    expect(callConversationOf(`/app/meet/grp/${id}`)).toEqual({ kind: "group", id })
    // A meeting and an instant call belong to no conversation; other pages aren't calls.
    expect(callConversationOf(`/app/meet/m/${id}`)).toBeNull()
    expect(callConversationOf("/app/meet/instant")).toBeNull()
    expect(callConversationOf(`/app/channel/${id}`)).toBeNull()
    expect(callConversationOf("")).toBeNull()
  })
  it("never offers to swap a view with a call, beside the page or as the page", () => {
    const channel = { kind: "channel" as const, id }
    expect(canSwapBeside(channel, `/app/doc/${id}`)).toBe(true)
    // Swapping would move the call, and moving it hangs it up.
    expect(canSwapBeside(channel, `/app/meet/ch/${id}`)).toBe(false)
    expect(canSwapBeside({ kind: "call-channel", id }, `/app/doc/${id}`)).toBe(false)
  })
})
