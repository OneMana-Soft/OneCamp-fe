"use client"

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { trackUnsentEdits } from "@/lib/collabSession"

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
    const edits = provider ? trackUnsentEdits(provider) : null
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
