"use client"

/**
 * Whether the collaboration server has told this tab its editor is older than
 * the server's (it opened a doc read-only: oneCamp collaboration-service
 * schemaGate.js). The shell's pill then says "A newer version of OneCamp is
 * ready. Reload to keep editing" (components/error/OfflineNotice.tsx).
 *
 * A module store, so the doc that hears it and the shell that shows it need
 * not share a provider.
 */
let outdated = false
const listeners = new Set<() => void>()

export function markSchemaOutdated() {
  if (outdated) return
  outdated = true
  listeners.forEach((fn) => fn())
}

export function isSchemaOutdated() {
  return outdated
}

export function subscribeSchemaOutdated(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** For tests. */
export function resetSchemaOutdated() {
  outdated = false
  listeners.forEach((fn) => fn())
}
