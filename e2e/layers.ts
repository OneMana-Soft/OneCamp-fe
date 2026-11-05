import type { Locator } from "@playwright/test"

import { boxOf, overlap } from "./boxes"

/**
 * Whether `top` is drawn over `under` where they meet: the page's own hit
 * test at the middle of their shared ground, which follows the order things
 * are painted in. Both are made hittable for the look (a layer that takes no
 * pointer would be skipped), then put back. Null when they don't meet.
 */
export async function drawnOver(top: Locator, under: Locator): Promise<boolean | null> {
  const ground = overlap(await boxOf(top), await boxOf(under))
  if (!ground) return null
  const at = { x: ground.x + ground.width / 2, y: ground.y + ground.height / 2 }
  const topEl = await top.elementHandle()
  return under.evaluate(
    (low, { at, high }) => {
      const both = [low, high].filter((e): e is HTMLElement => e instanceof HTMLElement)
      const was = both.map((e) => e.style.pointerEvents)
      for (const e of both) e.style.pointerEvents = "auto"
      const hits = document.elementsFromPoint(at.x, at.y)
      both.forEach((e, i) => (e.style.pointerEvents = was[i]))
      const first = hits.find((h) => high?.contains(h) || low.contains(h))
      return !!first && !!high?.contains(first)
    },
    { at, high: topEl },
  )
}

/**
 * Whether `el` is what the page's own hit test finds at its middle: nothing
 * else (a panel, a menu, a bar) is drawn over it there. `el` must take the
 * pointer itself; one that takes none is never found.
 */
export async function topAtMiddle(el: Locator): Promise<boolean> {
  return el.evaluate((e) => {
    const r = e.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && e.contains(hit)
  })
}
