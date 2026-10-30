/**
 * A virtualized window in a test (the tables grid, the phone's row list).
 * jsdom lays nothing out, so a virtualizer sees a box of no size and shows no
 * window: sizeBoxes gives every element carrying an attribute a size, which
 * the virtualizer reads its window from (offsetWidth, offsetHeight);
 * scrollBox scrolls one as a scroll the browser made would; countReads
 * counts the items a window reads, for a budget on what a scroll costs.
 */

import { act } from "react"

/** Elements with `attribute` measure `size`; returns the undo. */
export function sizeBoxes(attribute: string, size: { width: number; height: number }): () => void {
  const undo = (["offsetWidth", "offsetHeight"] as const).map((name) => {
    const px = name === "offsetWidth" ? size.width : size.height
    const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute(attribute) ? px : (was?.get?.call(this) ?? 0)
      },
    })
    return () => was && Object.defineProperty(HTMLElement.prototype, name, was)
  })
  return () => undo.forEach((u) => u())
}

/** Scrolls `box` to `top`, and lets React finish what the scroll set off. */
export function scrollBox(box: HTMLElement, top: number) {
  Object.defineProperty(box, "scrollTop", { configurable: true, get: () => top })
  act(() => {
    box.dispatchEvent(new Event("scroll"))
  })
}

/** `items`, counting each it gives out by its index. */
export function countReads<T>(items: T[]): { items: T[]; reads: { n: number } } {
  const reads = { n: 0 }
  const proxy = new Proxy(items, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads.n++
      return Reflect.get(target, key, receiver)
    },
  })
  return { items: proxy, reads }
}
