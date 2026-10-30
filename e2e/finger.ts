import { expect, type Locator, type Page } from "@playwright/test"

/**
 * A finger, as a touch screen sends it: down, held, moved, then up, or let go
 * by the system (a swipe home, a sheet over the page: touchcancel). Chromium's
 * own touch events, through CDP.
 */
export async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const at = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  return {
    down: (x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x, y) }),
    move: (x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x, y) }),
    up: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    cancel: () => cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }),
  }
}

/**
 * A swipe's fling has run out: the scroller holds still (scrollTop and
 * scrollLeft unchanged) across two frames. A scroller sent somewhere
 * (scrollTo) while a fling still runs is carried on past where it was sent,
 * and what was there moves on, so a spec that swipes and then jumps waits for
 * this first.
 */
export async function flingEnded(scroller: Locator, timeout = 10_000) {
  await expect
    .poll(
      () =>
        scroller.evaluate(
          (el) =>
            new Promise<boolean>((done) => {
              const at = () => `${el.scrollTop},${el.scrollLeft}`
              const first = at()
              requestAnimationFrame(() => {
                const second = at()
                requestAnimationFrame(() => done(first === second && second === at()))
              })
            }),
        ),
      { timeout, intervals: [50] },
    )
    .toBe(true)
}

/**
 * Two fingers pinching about (x, y), level with each other: down `from` px
 * apart, drawn to `to` px apart (nearer: smaller; farther: bigger), resting
 * there before they lift, as a person's do. Lifted mid-move, Chrome reads a
 * fling, and the next touch only stops it.
 */
export async function pinch(page: Page, x: number, y: number, from: number, to: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page)
  const apart = (gap: number) => [
    { x: x - gap / 2, y, id: 1, radiusX: 4, radiusY: 4, force: 1 },
    { x: x + gap / 2, y, id: 2, radiusX: 4, radiusY: 4, force: 1 },
  ]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: apart(from) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: apart(from + ((to - from) * i) / steps) })
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(150)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: apart(to) })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await cdp.detach()
}
