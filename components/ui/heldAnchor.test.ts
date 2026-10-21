import { afterEach, describe, expect, it } from "vitest"

import { heldBeside } from "@/components/ui/heldAnchor"

const box = (r: DOMRect) => [r.x, r.y, r.width, r.height]

/** An element on the page whose box is `at`, which a test moves. */
function placed(at: { x: number; y: number; width: number; height: number }) {
  const el = document.createElement("div")
  el.getBoundingClientRect = () => new DOMRect(at.x, at.y, at.width, at.height)
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("heldBeside", () => {
  it("moves a held place as its element has moved since", () => {
    const at = { x: 60, y: 100, width: 600, height: 24 }
    const block = placed(at)
    const a = heldBeside(new DOMRect(40, 100, 1, 24), block)
    expect(box(a.getBoundingClientRect())).toEqual([40, 100, 1, 24])
    at.y = -20
    at.x = 80
    expect(box(a.getBoundingClientRect())).toEqual([60, -20, 1, 24])
    expect(a.contextElement).toBe(block)
  })

  it("is the place as it was with no element to keep it beside", () => {
    expect(box(heldBeside(new DOMRect(40, 100, 1, 24), null).getBoundingClientRect())).toEqual([40, 100, 1, 24])
  })

  it("keeps the last place its element was seen once the element has gone or hides", () => {
    const at = { x: 60, y: 100, width: 600, height: 24 }
    const block = placed(at)
    const a = heldBeside(new DOMRect(40, 100, 1, 24), block)
    at.y = 140
    expect(box(a.getBoundingClientRect())).toEqual([40, 140, 1, 24])
    // display: none measures nothing at all.
    Object.assign(at, { x: 0, y: 0, width: 0, height: 0 })
    expect(box(a.getBoundingClientRect())).toEqual([40, 140, 1, 24])
    block.remove()
    expect(box(a.getBoundingClientRect())).toEqual([40, 140, 1, 24])
  })
})
