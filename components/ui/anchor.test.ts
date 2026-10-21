import { afterEach, describe, expect, it } from "vitest"

import { anchorTo } from "@/components/ui/anchor"

/** An element on the page that measures `rect` (jsdom lays nothing out). */
function placed(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const el = document.createElement("div")
  el.getBoundingClientRect = () => new DOMRect(rect.x, rect.y, rect.width, rect.height)
  document.body.appendChild(el)
  return el
}

const box = (r: DOMRect) => [r.x, r.y, r.width, r.height]

afterEach(() => {
  document.body.innerHTML = ""
})

describe("anchorTo", () => {
  it("measures an element on the page, each time it's asked", () => {
    let y = 200
    const el = document.createElement("div")
    el.getBoundingClientRect = () => new DOMRect(300, y, 120, 48)
    document.body.appendChild(el)
    const a = anchorTo(el)
    expect(box(a.getBoundingClientRect())).toEqual([300, 200, 120, 48])
    y = 260 // the grid scrolled
    expect(box(a.getBoundingClientRect())).toEqual([300, 260, 120, 48])
    expect(a.contextElement).toBe(el)
  })

  it("never answers the corner: null, before anything measured, stands near the top centre", () => {
    const r = anchorTo(null).getBoundingClientRect()
    expect(r.x).toBe(window.innerWidth / 2)
    expect(r.y).toBe(window.innerHeight / 4)
    expect(r.x || r.y).toBeTruthy()
  })

  // The calendar's bug: a drag's ghost unmounted as the drag ended, the card
  // anchored to what was left (nothing), and stood at (0, 0).
  it("finds the element drawn in place of one that left the page", () => {
    const gone = placed({ x: 10, y: 10, width: 10, height: 10 })
    gone.remove()
    gone.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
    const ghost = placed({ x: 412, y: 380, width: 140, height: 60 })
    ghost.setAttribute("data-ghost", "")
    const a = anchorTo(gone, () => document.querySelector("[data-ghost]"))
    expect(box(a.getBoundingClientRect())).toEqual([412, 380, 140, 60])
    expect(a.contextElement).toBe(ghost)
  })

  it("asks a function again on every measure, so a re-mounted target is found", () => {
    let current: Element | null = null
    const a = anchorTo(() => current)
    current = placed({ x: 50, y: 60, width: 70, height: 80 })
    expect(box(a.getBoundingClientRect())).toEqual([50, 60, 70, 80])
    current = placed({ x: 500, y: 600, width: 70, height: 80 })
    expect(box(a.getBoundingClientRect())).toEqual([500, 600, 70, 80])
  })

  it("keeps the last rect that measured once its element has gone and nothing took its place", () => {
    const el = placed({ x: 640, y: 320, width: 200, height: 24 })
    const a = anchorTo(el)
    expect(box(a.getBoundingClientRect())).toEqual([640, 320, 200, 24])
    el.remove() // a virtualised row scrolled away
    expect(box(a.getBoundingClientRect())).toEqual([640, 320, 200, 24])
    expect(a.contextElement).toBeUndefined()
  })

  it("skips an element on the page that measures nothing (display: none)", () => {
    const hidden = placed({ x: 0, y: 0, width: 0, height: 0 })
    const cell = placed({ x: 90, y: 90, width: 30, height: 30 })
    expect(box(anchorTo(hidden, () => cell).getBoundingClientRect())).toEqual([90, 90, 30, 30])
  })

  it("stands at a point, and at a rect", () => {
    expect(box(anchorTo({ x: 33, y: 44 }).getBoundingClientRect())).toEqual([33, 44, 0, 0])
    expect(box(anchorTo(new DOMRect(1, 2, 3, 4)).getBoundingClientRect())).toEqual([1, 2, 3, 4])
  })
})
