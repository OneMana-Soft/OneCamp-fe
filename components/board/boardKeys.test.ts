import { describe, expect, it } from "vitest"
import { ariaKeys, noteKeyOf, notForTheBoard, withKey, NOTE_KEYS } from "./boardKeys"
import { isToastHotkey } from "@/components/ui/toast"
import { callKeyAction } from "@/components/livekit/callKeys"

const key = (o: Partial<KeyboardEvent> & { code?: string }) => ({ key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o })

describe("the notes bar's keys", () => {
  it("take no key the app already holds: Alt+T stays the notifications', and no note key is a call's", () => {
    // An Alt chord as the browser sends it: every field these readers take, and nothing typed into.
    const pressed = (k: string) => ({
      key: k,
      code: /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`,
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      repeat: false,
      target: null,
      defaultPrevented: false,
    })
    expect(isToastHotkey(pressed("t"))).toBe(true)
    for (const mac of [false, true]) expect(noteKeyOf(pressed("t"), mac)).toBeNull()
    for (const chord of [...Object.values(NOTE_KEYS), "Alt-1", "Alt-2", "Alt-3", "Alt-4", "Alt-5", "Alt-6"]) {
      const e = pressed(chord.slice(chord.lastIndexOf("-") + 1))
      expect(isToastHotkey(e), chord).toBe(false)
      for (const mac of [false, true]) expect(callKeyAction(e as never, undefined, mac), chord).toBeNull()
    }
  })

  it("take no Alt letter Excalidraw or a browser's menus hold", () => {
    // Excalidraw: Alt with H, R, S, V, Z and / (its help lists them); a browser: Alt+D (the address bar), Alt+E and
    // Alt+F (Chrome's menu), Alt+B (Firefox's Bookmarks menu; F, E, V, S, T and H are its other menus).
    const held = new Set(["h", "r", "s", "v", "z", "/", "d", "e", "f", "b", "t"])
    for (const chord of Object.values(NOTE_KEYS)) expect(held.has(chord.slice(chord.lastIndexOf("-") + 1)), chord).toBe(false)
  })

  it("reads Alt chords for the bar's actions and Alt+1 to Alt+6 for the six camp colours", () => {
    expect(noteKeyOf(key({ key: "g", altKey: true }), false)).toBe("tidy")
    expect(noteKeyOf(key({ key: "l", altKey: true }), false)).toBe("tags")
    expect(noteKeyOf(key({ key: "c", altKey: true }), false)).toBe("colour")
    expect(noteKeyOf(key({ key: "k", altKey: true }), false)).toBe("tasks")
    expect(noteKeyOf(key({ key: "u", altKey: true }), false)).toBe("vote")
    // The size key (miro-07c): Alt+N, the next note size. Alt+S is Excalidraw's (snapping) and the calls' (share).
    expect(noteKeyOf(key({ key: "n", altKey: true }), false)).toBe("size")
    expect(noteKeyOf(key({ key: "n", code: "KeyN", altKey: true }), true)).toBe("size")
    expect(withKey("Size", NOTE_KEYS.size)).toBe("Size (Alt + N)")
    expect(noteKeyOf(key({ key: "1", altKey: true }), false)).toBe("yellow")
    expect(noteKeyOf(key({ key: "6", altKey: true }), false)).not.toBeNull()
    expect(noteKeyOf(key({ key: "7", altKey: true }), false)).toBeNull()
  })

  it("reads a Mac's ⌥ chord by the key's place, and nothing without Alt or with Ctrl", () => {
    expect(noteKeyOf(key({ key: "©", code: "KeyG", altKey: true }), true)).toBe("tidy")
    expect(noteKeyOf(key({ key: "¡", code: "Digit1", altKey: true }), true)).toBe("yellow")
    expect(noteKeyOf(key({ key: "g" }), false)).toBeNull()
    expect(noteKeyOf(key({ key: "g", altKey: true, ctrlKey: true }), false)).toBeNull()
  })

  it("leaves keys typed in a field, a dialog, a menu or a list to them", () => {
    const field = document.createElement("input")
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    const inside = document.createElement("button")
    dialog.appendChild(inside)
    document.body.append(field, dialog)
    const at = (target: Element) => ({ target }) as unknown as Event
    expect(notForTheBoard(at(field))).toBe(true)
    expect(notForTheBoard(at(inside))).toBe(true)
    expect(notForTheBoard(at(document.body))).toBe(false)
    field.remove()
    dialog.remove()
  })

  it("writes a key for a tooltip and for assistive tech", () => {
    expect(withKey("Tidy up into a grid", NOTE_KEYS.tidy)).toBe("Tidy up into a grid (Alt + G)")
    expect(ariaKeys(NOTE_KEYS.tasks)).toBe("Alt+K")
    expect(ariaKeys("Alt-1")).toBe("Alt+1")
  })
})
