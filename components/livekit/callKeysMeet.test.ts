import { describe, expect, it } from "vitest"
import { CALL_KEYS, callKeyAction } from "./callKeys"
import { callShortcutRows } from "./callKeyRows"
import { RELEASED, isTalkKey, onTalkDown, onTalkUp } from "@/lib/calls/pushToTalk"

// meet-18: Meet's and Zoom's keys work in our calls too, as each has them on a
// Mac and elsewhere (D-CL-11), Space held talks while muted, and the app's
// keys list (?) shows the call's keys from the one table.

const base = { key: "", code: "", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, repeat: false }
const press = (key: string, mods: Partial<typeof base> = {}) => ({ ...base, key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : "", ...mods })

describe("Meet's and Zoom's keys", () => {
  it("answers Meet's ⌘D, ⌘E and ⌃⌘H on a Mac, and Ctrl+D, Ctrl+E and Ctrl+Alt+H elsewhere", () => {
    expect(callKeyAction(press("d", { metaKey: true }), undefined, true)).toBe("mic")
    expect(callKeyAction(press("e", { metaKey: true }), undefined, true)).toBe("camera")
    expect(callKeyAction(press("h", { metaKey: true, ctrlKey: true }), undefined, true)).toBe("hand")
    expect(callKeyAction(press("d", { ctrlKey: true }), undefined, false)).toBe("mic")
    expect(callKeyAction(press("e", { ctrlKey: true }), undefined, false)).toBe("camera")
    expect(callKeyAction(press("h", { ctrlKey: true, altKey: true }), undefined, false)).toBe("hand")
    // Only this computer's own: Ctrl+D on a Mac deletes forward in a field.
    expect(callKeyAction(press("d", { ctrlKey: true }), undefined, true)).toBeNull()
    expect(callKeyAction(press("d", { metaKey: true }), undefined, false)).toBeNull()
  })

  it("answers Zoom's ⌘⇧A, ⌘⇧V, ⌘⇧S and ⌥Y on a Mac, whatever ⌥ types, and Alt+A, Alt+V, Alt+S and Alt+Y elsewhere", () => {
    expect(callKeyAction(press("A", { code: "KeyA", metaKey: true, shiftKey: true }), undefined, true)).toBe("mic")
    expect(callKeyAction(press("V", { code: "KeyV", metaKey: true, shiftKey: true }), undefined, true)).toBe("camera")
    expect(callKeyAction(press("S", { code: "KeyS", metaKey: true, shiftKey: true }), undefined, true)).toBe("share")
    expect(callKeyAction(press("¥", { code: "KeyY", altKey: true }), undefined, true)).toBe("hand")
    for (const [key, action] of [["a", "mic"], ["v", "camera"], ["s", "share"], ["y", "hand"]] as const) {
      expect(callKeyAction(press(key, { altKey: true }), undefined, false)).toBe(action)
    }
    // A Mac's ⌥A is nobody's key.
    expect(callKeyAction(press("å", { code: "KeyA", altKey: true }), undefined, true)).toBeNull()
  })

  it("never with another modifier, on a repeat, while typing, or for something not offered", () => {
    expect(callKeyAction(press("d", { metaKey: true, shiftKey: true }), undefined, true)).toBeNull()
    expect(callKeyAction(press("d", { metaKey: true, altKey: true }), undefined, true)).toBeNull()
    expect(callKeyAction(press("a", { altKey: true, ctrlKey: true }), undefined, false)).toBeNull()
    expect(callKeyAction(press("d", { ctrlKey: true, repeat: true }), undefined, false)).toBeNull()
    expect(callKeyAction({ ...press("d", { ctrlKey: true }), target: document.createElement("input") }, undefined, false)).toBeNull()
    expect(callKeyAction(press("y", { altKey: true }), ["mic", "camera"], false)).toBeNull()
    // Our own letters still take no modifier.
    expect(callKeyAction(press("m", { ctrlKey: true }), undefined, false)).toBeNull()
    expect(callKeyAction(press("m"), undefined, true)).toBe("mic")
  })

  it("knows a Mac by itself, so the green room's ⌘D is the microphone there, not a bookmark", () => {
    const was = Object.getOwnPropertyDescriptor(Navigator.prototype, "platform")
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true })
    try {
      expect(callKeyAction(press("d", { metaKey: true }), ["mic", "camera"])).toBe("mic")
      expect(callKeyAction(press("d", { ctrlKey: true }), ["mic", "camera"])).toBeNull()
    } finally {
      delete (navigator as { platform?: string }).platform
      if (was) Object.defineProperty(Navigator.prototype, "platform", was)
    }
  })
})

describe("the call's rows in the app's keys list", () => {
  it("lists every row of the table with Meet's and Zoom's keys as this computer has them, and holding Space to talk", () => {
    const pc = callShortcutRows(false)
    expect(pc).toHaveLength(CALL_KEYS.length + 1)
    expect(pc[0]).toEqual({ keys: "M or Ctrl/⌘ + D or Alt + A", does: "Turn your microphone on or off" })
    expect(pc[1]).toEqual({ keys: "Space", does: "Hold to talk while you're muted" })
    const of = (rows: { keys: string; does: string }[], does: string) => rows.find((r) => r.does === does)?.keys
    expect(of(pc, "Turn your camera on or off")).toBe("V or Ctrl/⌘ + E or Alt + V")
    expect(of(pc, "Share your screen")).toBe("Shift + S or Alt + S")
    expect(of(pc, "Raise or lower your hand")).toBe("H or Ctrl + Alt + H or Alt + Y")
    const mac = callShortcutRows(true)
    expect(mac[0].keys).toBe("M or Ctrl/⌘ + D or Ctrl/⌘ + Shift + A")
    expect(of(mac, "Share your screen")).toBe("Shift + S or Ctrl/⌘ + Shift + S")
    expect(of(mac, "Raise or lower your hand")).toBe("H or Ctrl + Ctrl/⌘ + H or Alt + Y")
  })
})

describe("push to talk", () => {
  const space = { ...base, key: " ", code: "Space" }

  it("unmutes while Space is held when muted, and mutes again on release", () => {
    const down = onTalkDown(RELEASED, space, false)
    expect(down).toMatchObject({ unmute: true, prevent: true })
    // The held key's repeats change nothing, and don't scroll the page.
    const repeat = onTalkDown(down.hold, { ...space, repeat: true }, true)
    expect(repeat).toMatchObject({ unmute: false, prevent: true })
    const up = onTalkUp(repeat.hold)
    expect(up.mute).toBe(true)
    expect(up.hold).toEqual(RELEASED)
  })

  it("leaves an open microphone alone, and never mutes what it didn't unmute", () => {
    const down = onTalkDown(RELEASED, space, true)
    expect(down.unmute).toBe(false)
    expect(onTalkUp(down.hold).mute).toBe(false)
    expect(onTalkUp(RELEASED).mute).toBe(false)
  })

  it("is never Space for typing, for a control Space presses, or with a modifier", () => {
    const button = document.createElement("button")
    const field = document.createElement("textarea")
    const item = document.createElement("div")
    item.setAttribute("role", "menuitem")
    const link = document.createElement("a")
    link.href = "https://example.com"
    for (const target of [button, field, item, link]) expect(isTalkKey({ ...space, target })).toBe(false)
    for (const mod of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) expect(isTalkKey({ ...space, [mod]: true })).toBe(false)
    expect(isTalkKey({ ...space, key: "a", code: "KeyA" })).toBe(false)
    expect(isTalkKey(space)).toBe(true)
    expect(isTalkKey({ ...space, target: document.body })).toBe(true)
  })
})
