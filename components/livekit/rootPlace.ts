import * as React from "react"
import { onFrameFit } from "@/lib/ui/visualViewport"

/**
 * Keeps a CSS variable on the page's root at an element's place while it is
 * drawn, through resizes and any scroll (a call's own page scrolls in a
 * phone's app scroller); removed while it isn't drawn (a call hidden beside
 * its focused conversation runs on) and when it goes. The app's toasts read
 * the call's three (components/ui/toast.tsx, app/phone.css C9). key names the
 * element the ref holds when that changes.
 */
export function useRootPlace(name: string, el: React.RefObject<HTMLElement | null>, place: (box: DOMRect) => number, key?: unknown): void {
  React.useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    return keepRootPlace(name, [node], place)
  }, [name, el, place, key])
}

/**
 * As useRootPlace, over several elements: the largest place among those drawn,
 * as the top of a stack of bars at a phone's foot (a board's footer and its
 * own bars, components/board/phoneDock). The list changes as they come and go.
 */
export function useRootPlaceOf(name: string, els: readonly HTMLElement[], place: (box: DOMRect) => number): void {
  React.useLayoutEffect(() => (els.length ? keepRootPlace(name, els, place) : undefined), [name, els, place])
}

/**
 * The variable at the largest place of `nodes` that are drawn, kept through resizes, scrolls, every frame of a motion
 * (an animation or a transition) that carries one and its arrival, and the keyboard's fits; a cleanup.
 */
function keepRootPlace(name: string, nodes: readonly HTMLElement[], place: (box: DOMRect) => number): () => void {
  const root = document.documentElement
  const set = () => {
    const drawn = nodes.filter((n) => n.getClientRects().length)
    if (!drawn.length) return root.style.removeProperty(name)
    root.style.setProperty(name, `${Math.max(0, Math.round(Math.max(...drawn.map((n) => place(n.getBoundingClientRect())))))}px`)
  }
  set()
  const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null
  for (const n of nodes) watch?.observe(n)
  window.addEventListener("resize", set)
  // A scroll doesn't bubble: caught on its way down to whatever scrolled.
  window.addEventListener("scroll", set, { capture: true, passive: true })
  // A sheet that rises from the screen's foot (asana-12 (a)'s task sheet) carries its nodes with a transform: no
  // resize, no scroll. While a motion carries one, they're measured on every frame, so what stands on the place moves
  // with them (V-93: the offline pill stood over the sheet's comment box for ~240 ms of the rise, then hopped 82 px),
  // and once more when it has arrived. A looping motion (a skeleton's breath) carries nothing anywhere. jsdom has no
  // Web Animations.
  const carries = (by: EventTarget | null | undefined) => by instanceof Node && nodes.some((n) => by.contains(n))
  const carried = () =>
    typeof document.getAnimations === "function" &&
    document
      .getAnimations()
      .some((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().endTime) && carries((a.effect as KeyframeEffect | null)?.target))
  let frame = 0
  const follow = () => {
    set()
    frame = carried() ? requestAnimationFrame(follow) : 0
  }
  const moving = (e: Event) => {
    if (!frame && carries(e.target)) frame = requestAnimationFrame(follow)
  }
  const arrived = (e: Event) => {
    if (carries(e.target)) set()
  }
  if (carried()) frame = requestAnimationFrame(follow)
  window.addEventListener("animationstart", moving, { capture: true, passive: true })
  window.addEventListener("transitionstart", moving, { capture: true, passive: true })
  window.addEventListener("animationend", arrived, { capture: true, passive: true })
  window.addEventListener("transitionend", arrived, { capture: true, passive: true })
  // The keyboard fitting the app's frame, or letting it go (lib/ui/visualViewport), moves what stands on it with no
  // resize or scroll of its own: a sheet stands on the keyboard (app/phone.css C5c, C5d), and the task sheet's
  // comment box with it. Measured again after each fit is written.
  const unfit = onFrameFit(set)
  return () => {
    unfit()
    cancelAnimationFrame(frame)
    watch?.disconnect()
    window.removeEventListener("resize", set)
    window.removeEventListener("scroll", set, { capture: true })
    window.removeEventListener("animationstart", moving, { capture: true })
    window.removeEventListener("transitionstart", moving, { capture: true })
    window.removeEventListener("animationend", arrived, { capture: true })
    window.removeEventListener("transitionend", arrived, { capture: true })
    root.style.removeProperty(name)
  }
}

/** An element's place from the screen's foot: how far its top sits above the bottom edge (what owns the foot). */
export const fromFoot = (box: DOMRect): number => window.innerHeight - box.top
