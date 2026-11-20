"use client"

import { useEffect } from "react"

function flash(el: HTMLElement, into: ScrollIntoViewOptions) {
  el.classList.remove("set-flash")
  void el.offsetWidth // a second jump replays it
  el.classList.add("set-flash")
  // The page may still fill in above it: its place is held from here, the
  // jump, even if a card fills in before the hold's code has arrived.
  // Without the hold (its code failed to load) the jump has still landed.
  const at = placeOf(el)
  void import("./jumpHold").then((m) => m.hold(el, into, at)).catch(() => undefined)
  window.setTimeout(() => el.classList.remove("set-flash"), 1300)
}

/**
 * Where `el` sits down its page (the [data-page-frame] it is in), or null
 * outside one. It changes when something above it grows or shrinks, not when
 * the page scrolls, nor when the page grows below it.
 */
export function placeOf(el: HTMLElement): number | null {
  const frame = el.closest("[data-page-frame]")
  return frame ? el.getBoundingClientRect().top - frame.getBoundingClientRect().top : null
}

/**
 * A jump to a card (a settings search hit, a deep link with a #fragment):
 * the card scrolls to 24px from the top, smoothly unless the person asked for
 * less motion, and then flashes (design v3, admin §1.6): its ring takes the
 * accent and a 3px halo that fades over 1.2s. To a row's control (a field,
 * lib/settingsFields): the row comes to the middle, the control takes the
 * focus, and the row flashes. The card may arrive after the page does (its
 * code and data load on their own): it is then watched for (./jumpSeek).
 */
export function flashCard(id: string): boolean {
  const target = document.getElementById(id)
  if (!target) return false
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const row = target.closest<HTMLElement>("[data-setting-row]")
  if (row) {
    const into: ScrollIntoViewOptions = { behavior: reduce ? "auto" : "smooth", block: "center" }
    row.scrollIntoView(into)
    target.focus({ preventScroll: true })
    flash(row, into)
    return true
  }
  const into: ScrollIntoViewOptions = { behavior: reduce ? "auto" : "smooth", block: "start" }
  target.scrollIntoView(into)
  flash(target.matches("[data-settings-card]") ? target : target.querySelector<HTMLElement>("[data-settings-card]") ?? target, into)
  return true
}

/** The card the link's #fragment names, or none if it can't be read. */
export const linked = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1))
  } catch {
    return ""
  }
}

export function useJumpFlash(key: string) {
  useEffect(() => {
    let live = true
    let stop = () => {}
    const seek = () => {
      const id = linked()
      if (id && !flashCard(id)) void import("./jumpSeek").then((m) => live && (stop = m.watch(id))).catch(() => undefined)
    }
    seek()
    window.addEventListener("hashchange", seek)
    return () => {
      live = false
      stop()
      window.removeEventListener("hashchange", seek)
    }
  }, [key])
}
