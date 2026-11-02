import { expect, type Locator } from "@playwright/test"

/**
 * Waits until nothing still moves a box: no running animation on the element or on any of its ancestors (a parent's
 * transform moves and scales the box too) and, with `subtree`, none on what it holds. A box read before then can land
 * in a transition's tail: V-318, where a share entering the call stage from stageMotion's scale(0.96) read 364.27 px
 * of its 366 because the layout check took it within 2 px. With several elements it waits for all of them.
 *
 * sheetLayout's settled waits for a box to hold still for six frames; this waits for what moves it to end, on a
 * bounded clock, and says what is still running when it gives up.
 *
 * Only the document timeline's finite animations count: an endless one (a spinner, a pulse) never ends, and a
 * scroll-driven one moves with the scroll, not the clock. Fails after `timeout`, naming each animation still running
 * and the element it runs on.
 */
export async function animationsSettled(target: Locator, { subtree = false, timeout = 5_000, message }: { subtree?: boolean; timeout?: number; message?: string } = {}) {
  await target.first().waitFor({ state: "attached", timeout })
  await expect
    .poll(
      () =>
        target.evaluateAll((els, subtree) => {
          const name = (e: Element) => {
            const data = Array.from(e.attributes).find((x) => x.name.startsWith("data-"))
            return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}${data ? `[${data.name}${data.value ? `="${data.value.slice(0, 48)}"` : ""}]` : ""}`
          }
          const running = document.getAnimations().flatMap((a) => {
            const effect = a.effect instanceof KeyframeEffect ? a.effect : null
            const on = effect?.target
            if (!effect || !on || a.playState !== "running" || a.timeline !== document.timeline) return []
            if (effect.getComputedTiming().endTime === Infinity) return []
            if (!els.some((el) => on.contains(el) || (subtree && el.contains(on)))) return []
            const what = a instanceof CSSTransition ? `the transition of ${a.transitionProperty}` : a instanceof CSSAnimation ? `the animation ${a.animationName}` : `an animation${a.id ? ` (${a.id})` : ""}`
            return [`${what} on ${name(on)}`]
          })
          return running.length ? `still running: ${running.join("; ")}` : "settled"
        }, subtree),
      { timeout, intervals: [50, 100, 200], message: message ?? "no running animation still moves the box, on it or an ancestor" },
    )
    .toBe("settled")
}
