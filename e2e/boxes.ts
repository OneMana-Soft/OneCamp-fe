import { expect, type Locator } from "@playwright/test"

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
