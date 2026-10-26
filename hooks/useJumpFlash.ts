"use client"

import { useEffect } from "react"

/**
 * A jump to a card (a settings search hit, a deep link with a #fragment):
 * the card scrolls to 24px from the top, smoothly unless the person asked for
 * less motion, and then flashes (design v3, admin §1.6): its ring takes the
 * accent and a 3px halo that fades over 1.2s. A card that arrives after the
 * page does is watched for (./jumpSeek).
 */
export function flashCard(id: string): boolean {
  const target = document.getElementById(id)
  if (!target) return false
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  const card = target.matches("[data-settings-card]") ? target : target.querySelector<HTMLElement>("[data-settings-card]") ?? target
  card.classList.remove("set-flash")
  // A reflow, so a second jump to the same card replays the flash.
  void card.offsetWidth
  card.classList.add("set-flash")
  window.setTimeout(() => card.classList.remove("set-flash"), 1300)
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
