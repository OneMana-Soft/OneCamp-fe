import { expect, type Locator, type Page } from "@playwright/test"

import { animationsSettled } from "./settled"

/**
 * A toast's words, read where the toast is drawn: the app's one toast list
 * (components/ui/toast.tsx, labelled "Notifications (Alt+T)"). While a toast
 * opens, Radix's announcer repeats its words for screen readers for about a
 * second, outside the list ("Notification <words>"), so a page-wide getByText
 * matches twice and a strict read fails whenever it lands in that second.
 * Exact words, so a title and its description are read apart.
 */
export function toast(page: Page, words: string): Locator {
  return page.getByRole("region", { name: "Notifications (Alt+T)", exact: true }).getByText(words, { exact: true })
}

/** The toast list itself, for counting what is on it. */
export const toastRegion = (page: Page): Locator => page.getByRole("region", { name: "Notifications (Alt+T)", exact: true })

/**
 * That no toast says `words`, in part (no toast at all, without them), counted once after `settle` ms. A toast stays 6 s, so a
 * retrying toHaveCount(0) passes once it has gone and can't fail (V-410). A failed write's shared toast comes a task
 * after the failure (lib/http/writeFailure), a failed read's a beat after (lib/http/loadFailure).
 */
export async function expectNoToast(page: Page, words?: string, settle = 1_500): Promise<void> {
  await page.waitForTimeout(settle)
  const on = words === undefined ? toastRegion(page).getByRole("listitem") : toastRegion(page).getByText(words)
  expect(await on.count(), `a toast says ${words ?? "something"}`).toBe(0)
}

/**
 * That the toast holding `words` is drawn on top: at its centre, read at rest, the page's topmost box is the toast's
 * own (V-491). toBeVisible passes on a toast an overlay covers, as Excalidraw's dialog layer covered a refused
 * export's, so a toast said over a dialog or a sheet is checked here.
 */
export async function expectToastOnTop(words: Locator): Promise<void> {
  const top = await words.evaluate(async (el) => {
    const item = el.closest("li") ?? el
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    let last = ""
    for (let i = 0; i < 30; i++) {
      const r = item.getBoundingClientRect()
      const box = `${r.x} ${r.y} ${r.width} ${r.height}`
      if (box === last) break
      last = box
      await frame()
    }
    const r = item.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { onTop: !!hit && item.contains(hit), hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}` : "nothing" }
  })
  expect(top.onTop, `the toast is under ${top.hit}`).toBe(true)
}

type Edges = { top: number; bottom: number; left: number; right: number; height: number; width: number }
export type ActionReach = { look: Edges; reach: Edges; card: Edges; onClose: number; grows: boolean }

/**
 * Where a toast's action (Undo, Retry, View) takes a tap, probed with elementFromPoint pixel by pixel along the lines
 * through its centre (V-889): the look's box, the reach's, and the card's. `onClose` counts the points the toast's × takes
 * with the reach off that the action takes with it on (it must take none: the × is a circle, so its box's corners
 * were never its own); `grows` says whether the card is a different height with the reach off.
 */
export async function actionReach(action: Locator): Promise<ActionReach> {
  return action.evaluate((el) => {
    // Named, not spread: a DOMRect's sides are getters, which a spread leaves behind.
    const edges = ({ top, bottom, left, right }: { top: number; bottom: number; left: number; right: number }) => ({ top, bottom, left, right, height: bottom - top, width: right - left })
    const takes = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && el.contains(hit)
    }
    const look = el.getBoundingClientRect()
    const cardEl = el.closest(".toast-card") as HTMLElement
    const cx = Math.round(look.left + look.width / 2)
    const cy = Math.round(look.top + look.height / 2)
    // Whole pixels from the centre while the action still takes the point. A box [a, b) takes the points a to b - 1, so
    // its top and left edges are the last points taken, and its bottom and right edges one past them.
    const run = (dx: number, dy: number) => {
      let n = 0
      while (n < 80 && takes(cx + dx * (n + 1), cy + dy * (n + 1))) n++
      return n
    }
    const reach = { top: cy - run(0, -1), bottom: cy + run(0, 1) + 1, left: cx - run(-1, 0), right: cx + run(1, 0) + 1 }
    const close = el.closest(".toast-root")?.querySelector(".toast-close")
    const x = close?.getBoundingClientRect()
    const points: [number, number][] = []
    if (x) for (let px = x.left + 1; px < x.right; px += 2) for (let py = x.top + 1; py < x.bottom; py += 2) points.push([px, py])
    const h = cardEl.offsetHeight
    const off = document.createElement("style")
    off.textContent = ".toast-action::before { display: none !important; }"
    document.head.append(off)
    const grows = cardEl.offsetHeight !== h
    const closes = points.filter(([px, py]) => {
      const hit = document.elementFromPoint(px, py)
      return !!hit && !!close?.contains(hit)
    })
    off.remove()
    const onClose = closes.filter(([px, py]) => takes(px, py)).length
    return { look: edges(look), reach: edges(reach), card: edges(cardEl.getBoundingClientRect()), onClose, grows }
  })
}

/** For a review frame only: outlines where each toast action takes a tap. Returns the remover. */
export async function outlineActionReach(page: Page): Promise<() => Promise<void>> {
  const tag = await page.addStyleTag({ content: ".toast-action::before { outline: 1.5px dashed #e5484d; outline-offset: -1px; } .toast-action { outline: 1px solid #e5484d; }" })
  return () => tag.evaluate((s) => (s as Element).remove())
}

/**
 * That a finger takes a toast's action from 9px past its 26px look (V-889): 44px each way, inside its card, taking
 * nothing from the ×, the card's height unchanged. Returns the look, for a tap at the reach's edge.
 *
 * Read once the toast has arrived. A phone's pill comes in from scale(0.96) at opacity 0 (app/phone.css
 * phone-toast-in, 260ms), and a read in that entrance takes all of it at 0.96: wZ38e's run read the look 24.96 px and
 * the card 42.24 px in its first frame. A run with SHOTS_DIR waited by chance, in reviewShot's untilStill.
 */
export async function expectFingerReach(action: Locator): Promise<ActionReach["look"]> {
  await animationsSettled(action, { message: "the toast has arrived: nothing still moves or scales its action" })
  const { look, reach, card, onClose, grows } = await actionReach(action)
  const said = JSON.stringify({ look, reach, card })
  expect(look.height, said).toBeCloseTo(26, 0)
  expect(reach.height, said).toBeGreaterThanOrEqual(44)
  expect(reach.width, said).toBeGreaterThanOrEqual(44)
  expect(reach.top, said).toBeGreaterThanOrEqual(card.top)
  expect(reach.bottom, said).toBeLessThanOrEqual(card.bottom)
  expect(onClose, "points of the × that the action's reach takes from it").toBe(0)
  expect(grows, "the card is another height with the reach off").toBe(false)
  return look
}
