import { expect, type Locator } from "@playwright/test"

/**
 * A finger's target. Every control a phone check holds to a finger is at least 44 CSS px on the side that binds
 * (app/phone.css F3; WCAG 2.5.5's 44 px). A computer's row keeps its own, smaller bar, passed as `bar`.
 */
export const TOUCH_PX = 44

/**
 * Layout reports sizes in fractions of a pixel: an h-11 box can read 43.99994 px when a font lands late or the
 * machine is busy (V-319: projectPlan's Clear, once in three runs under load; csvImport's select every time). So
 * every bar is compared to a hundredth of a pixel: a float a hair under the bar passes, and a box drawn short fails.
 */
export const PX_TOLERANCE = 0.01

/** Whether `px` reaches `bar` (a finger's 44 px unless named), read to PX_TOLERANCE. No size (no box) never does. */
export function reachesTouch(px: number | null | undefined, bar: number = TOUCH_PX): boolean {
  return typeof px === "number" && px >= bar - PX_TOLERANCE
}

/**
 * Expects `px` to reach `bar` (a finger's 44 px unless named), read to PX_TOLERANCE, so no spec's bar trips on a
 * float. `what` names the control in the failure message. No size (no box) fails.
 */
export function expectTouchSize(px: number | null | undefined, what = "a touch target", bar: number = TOUCH_PX): void {
  expect(px ?? Number.NaN, `${what}: ${px} px against ${bar}`).toBeGreaterThanOrEqual(bar - PX_TOLERANCE)
}

/** Half a finger: a 44 px target answers 21 px out from its centre on every side. */
export const REACH = TOUCH_PX / 2 - 1

/**
 * One control a finger is held to: its name, its box (rounded CSS px), how many of the five probes met it, and for
 * each probe that missed, its side and what it met instead ("up: div.sticky").
 */
export type TouchProbe = { name: string; width: number; height: number; hits: number; met: string[] }

/**
 * Every control under `scope` matching `selector` that is in view (inside the screen and every clipping parent),
 * probed at its centre and `reach` px out on all four sides: a probe counts when what's met there is the control or
 * what it holds. A control a finger fully meets scores 5. With `scroll`, each control is first scrolled into view
 * (as a finger would scroll a sheet to it), so a long sheet's controls below its fold are held to a finger too.
 */
export type ProbeOptions = { reach?: number; scroll?: boolean }
export function probeTouch(scope: Locator, selector: string, { reach = REACH, scroll = false }: ProbeOptions = {}): Promise<TouchProbe[]> {
  return scope.evaluate(
    (root, [sel, r, scroll]) => {
      const inView = (el: Element) => {
        const b = el.getBoundingClientRect()
        if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") return false
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p)
          if (s.overflowX === "visible" && s.overflowY === "visible") continue
          const c = p.getBoundingClientRect()
          if (b.left < c.left - 1 || b.right > c.right + 1 || b.top < c.top - 1 || b.bottom > c.bottom + 1) return false
        }
        return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight
      }
      // Each control is scrolled to (with `scroll`) and read in turn, so the next one's scroll can't move it first.
      return [...root.querySelectorAll(sel)].flatMap((el) => {
        if (scroll) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" })
        if (!inView(el)) return []
        const b = el.getBoundingClientRect()
        const [x, y] = [b.left + b.width / 2, b.top + b.height / 2]
        const sides = [["middle", 0, 0], ["right", r, 0], ["left", -r, 0], ["down", 0, r], ["up", 0, -r]] as const
        const met = sides.flatMap(([side, dx, dy]) => {
          const hit = document.elementFromPoint(x + dx, y + dy)
          return hit && (hit === el || el.contains(hit)) ? [] : [`${side}: ${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]}` : "nothing"}`]
        })
        const name = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim().slice(0, 40) || String(el.className).slice(0, 40)
        return [{ name, width: Math.round(b.width), height: Math.round(b.height), hits: sides.length - met.length, met }]
      })
    },
    [selector, reach, scroll] as const,
  )
}

/** The controls under `scope` matching `selector` that a finger doesn't fully meet (probeTouch), as "name WxH (side: met)". */
export async function missed(scope: Locator, selector: string, options: ProbeOptions = {}): Promise<string[]> {
  return (await probeTouch(scope, selector, options)).filter((p) => p.met.length).map((p) => `${p.name} ${p.width}x${p.height} (${p.met.join(", ")})`)
}

/** Waits (up to 5 s) until no finite animation under `scope` runs (a sheet's slide), so its box is read where it rests. */
export const settle = (scope: Locator) =>
  scope.evaluate(
    (n) =>
      new Promise<void>((done) => {
        const until = performance.now() + 5_000
        const moving = () => n.getAnimations({ subtree: true }).some((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
        const tick = () => (moving() && performance.now() < until ? requestAnimationFrame(tick) : done())
        tick()
      }),
  )
