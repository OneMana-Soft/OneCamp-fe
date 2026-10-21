import { describe, expect, it } from "vitest"
import { listKeyAction, PAGE_OVERLAP } from "./listKeys"

// The message list's viewport keys (INTERACTION_SPEC §7.3): Page Up and Down
// a screenful less a line or two, Home and End to the ends, and never a key
// that belongs to a field, a menu or a message's own control.

const viewport = document.createElement("div")
const inside = (html: string): Element => {
  const holder = document.createElement("div")
  holder.innerHTML = html
  viewport.appendChild(holder)
  return holder.querySelector("[data-target]") ?? holder.firstElementChild!
}
const press = (key: string, target: EventTarget = viewport, mods: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) =>
  listKeyAction({ key, target, currentTarget: viewport, ...mods }, 600)

describe("the message list's keys", () => {
  it("pages down and up by a screen, keeping a little of the last in view", () => {
    expect(press("PageDown")).toEqual({ scrollBy: 600 - PAGE_OVERLAP })
    expect(press("PageUp")).toEqual({ scrollBy: -(600 - PAGE_OVERLAP) })
    // From a message's own button too: the history pages from anywhere in it.
    expect(press("PageDown", inside('<button data-target="">React</button>'))).toEqual({ scrollBy: 600 - PAGE_OVERLAP })
  })

  it("goes to the oldest loaded message and the latest from the list itself", () => {
    expect(press("Home")).toEqual({ to: "start" })
    expect(press("End")).toEqual({ to: "end" })
    // A link in a message keeps Home and End.
    expect(press("End", inside('<a data-target="" href="/x">a link</a>'))).toBeNull()
  })

  it("leaves typing, menus and dialogs their own keys", () => {
    for (const html of [
      '<input data-target="" />',
      '<textarea data-target=""></textarea>',
      '<div contenteditable="true"><p data-target="">draft</p></div>',
      '<div role="menu"><div role="menuitem" data-target="">Edit</div></div>',
      '<div role="dialog"><button data-target="">Close</button></div>',
    ]) {
      expect(press("PageDown", inside(html))).toBeNull()
    }
  })

  it("leaves a key with Alt, Ctrl or Cmd held, and every other key, alone", () => {
    expect(press("PageDown", viewport, { altKey: true })).toBeNull()
    expect(press("End", viewport, { ctrlKey: true })).toBeNull()
    expect(press("Home", viewport, { metaKey: true })).toBeNull()
    expect(press("ArrowDown")).toBeNull()
    expect(press(" ")).toBeNull()
  })

  it("still moves a little in a viewport too short for a page", () => {
    expect(listKeyAction({ key: "PageDown", target: viewport, currentTarget: viewport }, 30)).toEqual({ scrollBy: PAGE_OVERLAP })
  })
})
