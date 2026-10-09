// What an import's progress event makes stale. The server sends one to every
// admin's app on the admin broadcast topic while an import runs and when it
// ends; the screens reading these keys then show it without asking on a timer.
// Pure.

import { IMPORT_OUTCOMES_KEY } from "@/services/importService"

const ENDED = new Set(["completed", "failed", "cancelled", "rolled_back"])

/** The SWR keys an import progress event with this status makes stale. */
export function importProgressStale(status?: string): (key: unknown) => boolean {
  const ended = !!status && ENDED.has(status)
  return (key: unknown) => {
    if (typeof key !== "string") return false
    if (key.includes("/admin/import/slack/jobs")) return true
    // How the caller's imports ended: news only when one has.
    return ended && key === IMPORT_OUTCOMES_KEY
  }
}
