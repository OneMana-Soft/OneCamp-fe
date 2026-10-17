"use client"

/**
 * Whether a toggle is open: each viewer's own, kept on this device and never
 * written into the doc (I5). Collapsing a toggle in one tab, or for one
 * person, changes nothing for anyone else.
 *
 * Kept by the toggle's block id (block ids are unique, A1) in one bounded map
 * in localStorage: what someone opened or closed, newest last. A toggle with
 * no entry is closed, as in Notion, except one made in this tab, which opens
 * so its writer can type into it (`fresh`).
 */

const KEY = "onecamp-doc-toggles"
/** The most toggles remembered; the oldest choices go first. */
const MAX_REMEMBERED = 1000

let states: Map<string, boolean> | null = null
const fresh = new Set<string>()
const listeners = new Set<() => void>()

function load(): Map<string, boolean> {
  if (states) return states
  states = new Map()
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(parsed)) {
      for (const e of parsed) if (Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "boolean") states.set(e[0], e[1])
    }
  } catch {
    /* unreadable or private: this visit only */
  }
  return states
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...load()]))
  } catch {
    /* full or private: this visit only */
  }
}

/** Whether this viewer has the toggle open. A toggle with no id yet is open: it is new. */
export function isToggleOpen(blockId: string | null | undefined): boolean {
  if (!blockId) return true
  const s = load().get(blockId)
  return s ?? fresh.has(blockId)
}

/** Opens or closes toggles for this viewer, remembered on this device. */
export function setTogglesOpen(blockIds: Iterable<string>, open: boolean) {
  const s = load()
  let changed = false
  for (const id of blockIds) {
    if (!id) continue
    if (s.get(id) === open) continue
    // Newest last, so the oldest are the first to go.
    s.delete(id)
    s.set(id, open)
    changed = true
  }
  if (!changed) return
  while (s.size > MAX_REMEMBERED) s.delete(s.keys().next().value as string)
  save()
  for (const l of [...listeners]) l()
}

/** A toggle made in this tab opens, for this visit, until someone chooses. */
export function markFresh(blockId: string) {
  if (fresh.has(blockId) || load().has(blockId)) return
  fresh.add(blockId)
  for (const l of [...listeners]) l()
}

/** Called whenever any toggle opens or closes; the returned function stops it. */
export function onToggleStates(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For tests: forget everything, here and on the device. */
export function resetToggleStates() {
  states = new Map()
  fresh.clear()
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing kept */
  }
}
