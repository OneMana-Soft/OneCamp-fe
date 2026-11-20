import { expect, type Locator, type Page } from "@playwright/test"

/** A box as the page draws it, rounded to whole pixels. */
export type Box = { l: number; r: number; t: number; b: number }

const overlaps = (a: Box, b: Box) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b)

/**
 * A FloatingBar under a finger (app/phone.css F3c, design-22): the bar inside
 * the screen and 44 px tall, every item 44 px and taking its own tap at its
 * centre (elementFromPoint: nothing over it, no rail, no edge), no two items
 * overlapping, no item past the bar's edges, the page not scrolling sideways,
 * and nothing named in `beside` under the bar. Returns the boxes it read.
 */
export async function barFits(page: Page, bar: Locator, name: string, beside: Locator[] = []) {
  await expect(bar).toBeVisible({ timeout: 20_000 })
  // The float's entry (content.css float-in) ends before anything is read.
  await expect.poll(() => bar.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length), { timeout: 5_000 }).toBe(0)
  const r = await bar.evaluate((el) => {
    const box = (q: DOMRect) => ({ l: Math.round(q.left), r: Math.round(q.right), t: Math.round(q.top), b: Math.round(q.bottom) })
    const b = el.getBoundingClientRect()
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-bar-item]")).filter((i) => i.getClientRects().length > 0)
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      bar: { ...box(b), h: Math.round(b.height) },
      sideways: document.documentElement.scrollWidth > window.innerWidth,
      out: Array.from(el.children).filter((c) => {
        const k = c.getBoundingClientRect()
        return k.width > 0 && (k.right > b.right + 0.5 || k.left < b.left - 0.5)
      }).length,
      items: items.map((i) => {
        const q = i.getBoundingClientRect()
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)
        const own = !!hit && (hit === i || i.contains(hit))
        return { label: i.getAttribute("aria-label") ?? i.textContent ?? "", ...box(q), w: Math.round(q.width), h: Math.round(q.height), own, by: own || !hit ? "" : `${hit.tagName}.${String(hit.getAttribute("class") ?? "").slice(0, 40)}` }
      }),
    }
  })
  console.log(`[floatingBars] ${name} ${JSON.stringify(r)}`)
  expect.soft(r.bar.l, `${name}: the bar's left edge is inside the screen`).toBeGreaterThanOrEqual(0)
  expect.soft(r.bar.r, `${name}: the bar's right edge is inside the screen`).toBeLessThanOrEqual(r.vw)
  expect.soft(r.bar.t, `${name}: the bar's top is inside the screen`).toBeGreaterThanOrEqual(0)
  expect.soft(r.bar.b, `${name}: the bar's bottom is inside the screen`).toBeLessThanOrEqual(r.vh)
  expect.soft(r.bar.h, `${name}: the bar is 44 px tall`).toBe(44)
  expect.soft(r.out, `${name}: no item past the bar's edges`).toBe(0)
  expect.soft(r.sideways, `${name}: the page doesn't scroll sideways`).toBe(false)
  expect.soft(r.items.length, `${name}: the bar has items`).toBeGreaterThan(0)
  for (const i of r.items) {
    expect.soft(i.w, `${name}: ${i.label} is 44 px wide or more`).toBeGreaterThanOrEqual(44)
    expect.soft(i.h, `${name}: ${i.label} is 44 px tall`).toBe(44)
    expect.soft(i.l >= 0 && i.r <= r.vw, `${name}: ${i.label} is inside the screen`).toBe(true)
    expect.soft(i.own, `${name}: ${i.label} takes its own tap (under ${i.by || "nothing"})`).toBe(true)
  }
  const byLeft = [...r.items].sort((a, b) => a.l - b.l)
  for (let k = 1; k < byLeft.length; k++) expect.soft(byLeft[k].l, `${name}: ${byLeft[k].label} is clear of ${byLeft[k - 1].label}`).toBeGreaterThanOrEqual(byLeft[k - 1].r)
  for (const [n, l] of beside.entries()) {
    const q = await l.boundingBox()
    if (!q) continue
    const box = { l: q.x, r: q.x + q.width, t: q.y, b: q.y + q.height }
    expect.soft(overlaps(box, r.bar), `${name}: the bar is clear of what it acts on (${n})`).toBe(false)
  }
  return r
}

/** Whether the bar covers the page's selection. */
export async function coversSelection(page: Page, bar: Box): Promise<boolean> {
  const s = await page.evaluate(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const q = sel.getRangeAt(0).getBoundingClientRect()
    return { l: q.left, r: q.right, t: q.top, b: q.bottom }
  })
  return !!s && overlaps(s, bar)
}
