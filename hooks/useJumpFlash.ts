"use client"

import { useEffect } from "react"

/**
 * A jump to a card (a settings search hit, a deep link with a #fragment):
 * the card scrolls to 24px from the top, smoothly unless the person asked for
 * less motion, and then flashes (design v3, admin §1.6): its ring takes the
 * accent and a 3px halo that fades over 1.2s. The card may arrive after the
 * page does (its code and data load on their own), so it is looked for a few
 * times before giving up.
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

export function useJumpFlash(key: string) {
  useEffect(() => {
    let tries = 0
    let timer: number | undefined
    const seek = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      if (flashCard(id) || ++tries > 12) return
      timer = window.setTimeout(seek, 250)
    }
    seek()
    const onHash = () => {
      tries = 0
      seek()
    }
    window.addEventListener("hashchange", onHash)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("hashchange", onHash)
    }
  }, [key])
}
