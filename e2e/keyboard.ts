import type { Page } from "@playwright/test"

/**
 * A phone's on-screen keyboard, as its browser shows it to the page, for the
 * checks a sheet with a field needs. There are two kinds:
 *
 *   visual  iOS Safari (and Chrome on Android left to its default): only the
 *           visual viewport shrinks. The layout viewport, 100dvh and
 *           window.innerHeight stay put, and a fixed sheet stays behind the
 *           keyboard unless something lifts it.
 *   resize  Chrome on Android with interactive-widget=resizes-content, which
 *           app/layout.tsx asks for: the page itself shrinks.
 *
 * Each opens and closes over a few steps, as the keyboard slides: iOS sends
 * visualViewport a resize for each, and vaul's input repositioning counted
 * the steps to decide whether the keyboard was up. Open the keyboard after
 * the field takes focus, and close it after it lets go: a tap away from the
 * field blurs it first, then the keyboard goes (vaul #650). Returns the close.
 */
export type KeyboardKind = "visual" | "resize"

const STEPS = [0.35, 0.7, 1]

export async function openKeyboard(page: Page, kind: KeyboardKind, height = 336): Promise<() => Promise<void>> {
  if (kind === "resize") {
    const size = page.viewportSize()!
    for (const s of STEPS) {
      await page.setViewportSize({ width: size.width, height: Math.round(size.height - height * s) })
      await page.waitForTimeout(40)
    }
    return async () => {
      for (const s of [...STEPS].reverse().slice(1).concat(0)) {
        await page.setViewportSize({ width: size.width, height: Math.round(size.height - height * s) })
        await page.waitForTimeout(40)
      }
    }
  }
  const step = (kb: number) =>
    page.evaluate((kb) => {
      const vv = window.visualViewport
      if (!vv) return
      if (kb > 0) Object.defineProperty(vv, "height", { configurable: true, get: () => window.innerHeight - kb })
      else delete (vv as unknown as Record<string, unknown>).height
      vv.dispatchEvent(new Event("resize"))
      vv.dispatchEvent(new Event("scroll"))
    }, kb)
  for (const s of STEPS) {
    await step(Math.round(height * s))
    await page.waitForTimeout(40)
  }
  return async () => {
    for (const s of [...STEPS].reverse().slice(1).concat(0)) {
      await step(Math.round(height * s))
      await page.waitForTimeout(40)
    }
  }
}
