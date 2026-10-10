"use client"

/**
 * GuestDocViewer — a read-only, LIVE view of a shared document for an external
 * guest (no OneCamp account). It binds the same TipTap editor used by members
 * to the live Yjs document over the collaboration websocket, but:
 *   - connects with a short-lived GUEST collab token (not a member session),
 *   - is editable={false}, and
 *   - the collaboration service enforces read-only server-side regardless.
 *
 * Because it reuses the member editor's extension set, the rendering matches
 * exactly what members see — no second, divergent renderer to maintain.
 */

import "@/components/minimal-tiptap/styles/index.css"
import { useEffect, useState } from "react"
import { EditorContent } from "@tiptap/react"
import { useMinimalTiptapEditor } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * How long a document may take to arrive before the guest is told it can't be
 * reached yet. The connection keeps trying either way.
 */
export const GUEST_DOC_SLOW_MS = 8_000

interface GuestDocViewerProps {
  /** Fully-formed Hocuspocus document name (the bare doc uuid for docs). */
  documentName: string
  /** Returns a fresh short-lived guest collab JWT on every (re)connect. */
  tokenFetcher: () => Promise<string>
}

export function GuestDocViewer({ documentName, tokenFetcher }: GuestDocViewerProps) {
  const { provider, synced } = useCollaborationProvider({
    enabled: true,
    documentId: documentName,
    tokenFetcher,
    username: "Guest",
    userId: "guest",
  })

  const editor = useMinimalTiptapEditor({
    editable: false,
    collaboration: provider
      ? { enabled: true, documentId: documentName, username: "Guest", userId: "guest" }
      : undefined,
    provider: provider || undefined,
    providerSynced: synced,
    editorClassName: "focus:outline-none",
  })

  // Shown only once the document has synced. The editor used to render as
  // soon as the connection object existed, so a document that never arrived
  // (the link turned off between the check and the connect, the collaboration
  // service down) looked like an empty document.
  //
  // Once it has arrived it stays. A network blip sets the hook's synced flag
  // back to false, and the provider never says "synced" again when its socket
  // survived the blip, so waiting on the flag swapped a connected document for
  // the skeleton, and then "Can't reach the document", until a reload.
  const [arrived, setArrived] = useState(false)
  if (synced && !arrived) setArrived(true)
  const ready = !!provider && !!editor && (synced || arrived)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (ready) {
      setSlow(false)
      return
    }
    const t = setTimeout(() => setSlow(true), GUEST_DOC_SLOW_MS)
    return () => clearTimeout(t)
  }, [ready])

  if (!ready) {
    return (
      <div aria-busy="true" className="grid min-h-[40vh] w-full content-start gap-3 px-1 py-2">
        <p role="status" className={slow ? "text-sm text-muted-foreground" : "sr-only"}>
          {slow ? "Can't reach the document right now; still trying." : "Opening the document…"}
        </p>
        <div aria-hidden="true" className="grid gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    )
  }

  return (
    <EditorContent
      editor={editor}
      className="minimal-tiptap-editor prose prose-sm dark:prose-invert max-w-none px-1 py-2"
    />
  )
}

