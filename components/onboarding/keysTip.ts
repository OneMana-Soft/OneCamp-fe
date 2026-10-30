// The keys tip's memory and its keys, without its drawing: what decides
// whether it shows (KeysTipLoader) and what marks it seen first (Home's demo
// guide, the first run's last step) don't bring the tip with them.

import { PHONE_QUERY } from "@/context/MediaQueryContext"

const KEY = "oc_keys_tip_seen"

/** Long enough for the page to settle and the person to have looked around. */
export const SHOW_AFTER_MS = 6_000

/** Whether this browser has had the tip, or has no storage to remember it in: better never than every visit. */
export function keysTipSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return true
  }
}

/** For what teaches the keys first (the demo's guide, the first run's last step): two prompts at once is one too many. */
export const markSeen = () => {
  try {
    localStorage.setItem(KEY, "1")
  } catch {
    /* nothing to remember it in */
  }
}

/** Never on a phone (the app's own line): the keys aren't there. */
export const onComputer = () => {
  try {
    return !window.matchMedia || !window.matchMedia(PHONE_QUERY).matches
  } catch {
    return true
  }
}

export type Row = "search" | "side" | "help"

/** Which row a key press is, if any. */
export function rowOf(e: KeyboardEvent): Row | null {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") return "search"
  if (e.key === "?") return "help"
  if (e.key === "Alt") return "side"
  return null
}

/** Pressing ⌘K or ? before the tip shows means the person knows: it never does. */
export const knowsTheKeys = (e: KeyboardEvent) => {
  const row = rowOf(e)
  return row !== null && row !== "side"
}
