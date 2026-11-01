import { describe, expect, it } from "vitest"
import { findKey } from "@/lib/tables/undoKeys"

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {}, target: EventTarget | null = document.body) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  target,
  ...mods,
})

describe("findKey: a table's find and replace keys (G2b)", () => {
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
})
