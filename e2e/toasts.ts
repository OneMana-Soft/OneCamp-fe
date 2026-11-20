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
export type ActionReach = { look: Edges; reach: Edges; card: Edges; onClose: number; grows: boolean; edge: string[]; corner: string }

/**
 * Where a toast's action (Undo, Retry, View) takes a tap, probed with elementFromPoint pixel by pixel along the lines
 * through its centre (V-889): the look's box, the reach's, and the card's. `onClose` counts the points the toast's × takes
 * with the reach off that the action takes with it on (it must take none: the × is a circle, so its box's corners
 * were never its own); `grows` says whether the card is a different height with the reach off. `edge` lists what else
 * takes a point just inside the action's top-right edge, along its look's top and right sides and at its reach's top
 * right, the ×'s side, past the circle of a × that shows, the toast's own face aside (V-917 (a)); `corner` what takes the toast's top-right corner,
 * where the × sits, and whether the × shows (V-917 (b)).
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
    // "face": the toast's own card or root, which no tap acts on: the action's rounded corner and the ×'s column above
    // it (V-889) are the face's once a hidden × takes no tap. "other" is anything else, named.
    const root = el.closest(".toast-root")
    const name = (px: number, py: number) => {
      const hit = document.elementFromPoint(px, py)
      if (!hit) return "nothing"
      if (el.contains(hit)) return "action"
      if (close?.contains(hit)) return "close"
      if (root?.contains(hit) && !hit.closest("a, button, [role=button], input")) return "face"
      return `other ${hit.tagName.toLowerCase()}${hit.classList[0] ? "." + hit.classList[0] : ""}`
    }
    // The × drawn over the action's corner takes the taps it covers, as it looks; nothing past its circle may.
    const shown = !!close && getComputedStyle(close).opacity !== "0"
    const under = (px: number, py: number) => shown && !!x && Math.hypot(px - (x.left + x.width / 2), py - (x.top + x.height / 2)) <= x.width / 2 + 1
    const probes: [number, number][] = [[reach.right - 1, reach.top]]
    for (let d = 1; d <= 24; d++) probes.push([look.right - d, look.top + 1])
    for (let d = 2; d <= 13; d++) probes.push([look.right - 1, look.top + d])
    const edge = probes
      .filter(([px, py]) => !under(px, py) && !["action", "face"].includes(name(px, py)))
      .map(([px, py]) => `${name(px, py)} at ${Math.round(px - look.right)},${Math.round(py - look.top)}`)
    const corner = x ? `${name(x.left + x.width / 2, x.top + x.height / 2)}, the × ${shown ? "shown" : "hidden"}` : "no ×"
    return { look: edges(look), reach: edges(reach), card: edges(cardEl.getBoundingClientRect()), onClose, grows, edge, corner }
  })
}

type SlotWatch = { seen: string[]; stop: boolean }

/**
 * Each slot the front toast is drawn in, read every frame from now until the returned reader is called (V-940): "top"
 * while its card's middle is in the screen's top half, "foot" in the bottom half, in the order seen, a repeat dropped.
 * A toast said while a held menu still left came in under the top bar and jumped to the foot about 220 ms later.
 */
export async function watchToastSlots(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w: SlotWatch = { seen: [], stop: false }
    ;(window as unknown as { __toastSlots: SlotWatch }).__toastSlots = w
    const frame = () => {
      if (w.stop) return
      const card = document.querySelector('.toast-root[data-state="open"]:not([data-behind]) .toast-card')
      if (card) {
        const r = card.getBoundingClientRect()
        const slot = r.top + r.height / 2 < window.innerHeight / 2 ? "top" : "foot"
        if (w.seen[w.seen.length - 1] !== slot) w.seen.push(slot)
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  return () =>
    page.evaluate(() => {
      const w = (window as unknown as { __toastSlots: SlotWatch }).__toastSlots
      w.stop = true
      return w.seen
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
  // The ×, a sibling, too: its 140 ms fade starts at opacity "0" while it already takes taps (CR-344). Not the whole
  // toast: its timer line is a finite animation as long as the toast's time.
  const close = action.locator("xpath=ancestor::li[contains(concat(' ', @class, ' '), ' toast-root ')]").locator(".toast-close")
  if (await close.count()) await animationsSettled(close, { message: "the toast's × has finished fading" })
  const { look, reach, card, onClose, grows, edge, corner } = await actionReach(action)
  const said = JSON.stringify({ look, reach, card })
  expect(look.height, said).toBeCloseTo(26, 0)
  expect(reach.height, said).toBeGreaterThanOrEqual(44)
  expect(reach.width, said).toBeGreaterThanOrEqual(44)
  expect(reach.top, said).toBeGreaterThanOrEqual(card.top)
  expect(reach.bottom, said).toBeLessThanOrEqual(card.bottom)
  expect(onClose, "points of the × that the action's reach takes from it").toBe(0)
  expect(grows, "the card is another height with the reach off").toBe(false)
  // V-917: the ×'s reach never takes the action's top-right edge, nor a hidden × the corner where it sits.
  expect(edge, `what else takes the action's top-right edge, its look's and its reach's, ${said}`).toEqual([])
  expect(corner, "the toast's top-right corner").toMatch(/^(face|other[^,]*|nothing), the × hidden$|^close, the × shown$/)
  return look
}
