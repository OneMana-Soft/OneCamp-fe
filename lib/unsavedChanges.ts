/**
 * What is unsaved on screen right now, so a way off the screen can ask first.
 *
 * SaveBar records its changes here while it shows them ("email changes") and
 * forgets them when they are saved, put back or the bar goes. The guard on
 * in-app links (components/ui/UnsavedChangesGuard) and the admin page's
 * section menu read it. Module state, not React state: nothing renders from
 * it, it is only asked at the moment someone tries to leave. A reload the
 * page makes by itself for a new build waits while any are here
 * (lib/chunkRecovery holdReload).
 */

import { holdReload } from "@/lib/newBuild"

const unsaved = new Map<string, string>()
holdReload(() => unsaved.size > 0)

/** A bar with changes waiting, by the bar's id and what it calls them. */
export function markUnsaved(id: string, what: string): void {
  unsaved.set(id, what)
}

export function clearUnsaved(id: string): void {
  unsaved.delete(id)
}

/** What would be lost by leaving now ("email changes"), or null. */
export function unsavedWhat(): string | null {
  const first = unsaved.values().next()
  return first.done ? null : first.value
}

/**
 * The event a way off the page sends first, so a SaveBar's dock nudges before
 * the confirm (components/ui/settingsSection). Here rather than beside the dock
 * so the guard on every page (UnsavedChangesGuard) needn't bring the settings UI.
 */
export const SAVE_NUDGE_EVENT = "onecamp:save-nudge"
