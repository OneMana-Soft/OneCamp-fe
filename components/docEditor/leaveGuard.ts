"use client"

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

/**
 * Whether leaving now would lose edits this tab made that the collaboration
 * server hasn't confirmed: typed offline, or while the server is slow. A live
 * doc keeps no local copy (on purpose: a cached copy once doubled every
 * block), so those edits exist only in this tab's memory until the server
 * says it has them.
 *
 * The provider counts updates the server hasn't acknowledged
 * (unsyncedChanges), but it also counts its own handshake on every connect,
 * which loses nothing. So this tracks whether the document changed HERE
 * (an update not applied by the provider itself) since the count last
 * reached zero.
 */
function createUnsyncedEditsTracker(provider: HocuspocusProvider) {
  let changedHere = false
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    // The provider applies what the server sends with itself as the origin;
    // anything else (typing, an undo, a template, an AI insert) is this tab's.
    if (origin !== provider) changedHere = true
  }
  const onUnsynced = ({ number }: { number: number }) => {
    if (number === 0) changedHere = false
  }
  provider.document.on("update", onUpdate)
  provider.on("unsyncedChanges", onUnsynced)
  return {
    /** Edits made here that the server hasn't confirmed yet. */
    pending: () => changedHere && provider.unsyncedChanges > 0,
    stop: () => {
      provider.document.off("update", onUpdate)
      provider.off("unsyncedChanges", onUnsynced)
    },
  }
}

/**
 * Asks before the tab closes or reloads while work would be lost: edits the
 * collaboration server hasn't confirmed (online or offline), or anything else
 * the page says is still pending (an HTTP save, an image uploading).
 */
export function useLeaveGuard({
  provider,
  pending,
}: {
  provider?: HocuspocusProvider | null
  /** Other unfinished work, read when the person tries to leave. */
  pending?: () => boolean
}) {
  const pendingRef = React.useRef(pending)
  React.useLayoutEffect(() => {
    pendingRef.current = pending
  })

  React.useEffect(() => {
    const edits = provider ? createUnsyncedEditsTracker(provider) : null
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!edits?.pending() && !pendingRef.current?.()) return
      // Both, for the browsers that still read returnValue.
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      edits?.stop()
    }
  }, [provider])
}
