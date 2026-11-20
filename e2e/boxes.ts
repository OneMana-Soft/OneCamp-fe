import { expect, type Locator, type Page } from "@playwright/test"

import { settled } from "./sheetLayout"

/** A box as the page draws it, in CSS px: Playwright's boundingBox. */
export type Box = { x: number; y: number; width: number; height: number }

/** The ground `a` and `b` both cover, or null when they cover none (boxes that only touch share none). */
export function overlap(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const width = Math.min(a.x + a.width, b.x + b.width) - x
  const height = Math.min(a.y + a.height, b.y + b.height) - y
  return width > 0.5 && height > 0.5 ? { x, y, width, height } : null
}

/** `el`'s box once it's shown and has stopped moving. */
export async function boxOf(el: Locator): Promise<Box> {
  await expect(el).toBeVisible()
  await settled(el)
  const box = await el.boundingBox()
  if (!box) throw new Error(`${el} has no box`)
  return box
}

/** How far `el` keeps from each edge of the window once it's shown and still, in whole CSS px (negative: past it). */
export async function edgesOf(el: Locator): Promise<{ left: number; right: number; top: number; bottom: number }> {
  const box = await boxOf(el)
  const view = el.page().viewportSize()
  if (!view) throw new Error("the page has no viewport")
  return {
    left: Math.round(box.x),
    right: Math.round(view.width - box.x - box.width),
    top: Math.round(box.y),
    bottom: Math.round(view.height - box.y - box.height),
  }
}

/**
 * The status surfaces (role="status") drawn on `el`'s ground, apart from what's
 * inside it and the toasts, which stack by design: each as its text. A notice
 * that says the connection's state stands in for the app's connection pill, so
 * nothing may show under it (DESIGN-BUILD-29 M1). Hidden and visually hidden
 * (sr-only) surfaces don't count.
 */
export async function statusesUnder(el: Locator): Promise<string[]> {
  await boxOf(el)
  return el.evaluate((own) => {
    const box = own.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>('[role="status"]')]
      .filter((s) => !own.contains(s) && !s.contains(own) && !s.closest(".toast-viewport"))
      .filter((s) => s.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .filter((s) => {
        const r = s.getBoundingClientRect()
        return r.width > 2 && r.height > 2 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
      })
      .map((s) => (s.textContent ?? "").trim().slice(0, 60))
  })
}

/**
 * The clear room of a board's screen, top to foot, on the page, where a match, a frame or a slide must sit whole. Each
 * bar drawn over the canvas is taken off the edge it stands nearer, by where it stands, not by any mark the app reads:
 * the board's top bars ([data-board-top]) and every toolbar of the board's own ([role=toolbar][data-board-chrome]: a
 * phone's cluster, the facilitation bar), Excalidraw's tool row (on a phone it is in the footer since design-22 4) and
 * its footer; then `over` (an open sheet) closes the foot. With nothing over its top it starts at the canvas's (V-1110).
 */
export async function boardRoom(page: Page, ...over: Locator[]): Promise<{ top: number; bottom: number }> {
  const room = await page.evaluate(() => {
    const canvas = document.querySelector(".excalidraw")!.getBoundingClientRect()
    let [top, bottom] = [canvas.top, canvas.bottom]
    const bars = "[data-board-top], [role=toolbar][data-board-chrome], [data-facilitation], .App-toolbar, .App-bottom-bar > .Island"
    for (const el of document.querySelectorAll(bars)) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom <= canvas.top || r.top >= canvas.bottom) continue
      if (r.top + r.height / 2 < canvas.top + canvas.height / 2) top = Math.max(top, r.bottom)
      else bottom = Math.min(bottom, r.top)
    }
    return { top, bottom }
  })
  for (const el of over) room.bottom = Math.min(room.bottom, (await boxOf(el)).y)
  return room
}
