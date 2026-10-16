"use client"

/**
 * GuestDocViewer — a read-only, LIVE view of a shared document for an external
 * guest (no OneCamp account). It binds the doc's own editor (useDocEditor, the
 * one every doc surface is built with) to the live Yjs document over the
 * collaboration websocket, but:
 *   - connects with a short-lived GUEST collab token (not a member session),
 *   - is editable={false}, and
 *   - the collaboration service enforces read-only server-side regardless.
 *
 * The same blocks matter for more than looks: y-prosemirror deletes from its
 * copy of the document whatever its schema can't hold. Built from the shorter
 * shared list, this viewer dropped every callout, toggle, to-do list and table
 * embed, and drew the rest at chat size.
 *
 * Its node views read GuestReaderContext: they draw what a guest may see
 * without asking the API, which a guest has no session for.
 */

import "@/components/minimal-tiptap/styles/index.css"
import { useEffect, useState } from "react"
import { EditorContent } from "@tiptap/react"
import { DOC_EDITOR_CLASS, useDocEditor } from "@/components/docEditor/useDocEditor"
import { GuestReaderContext } from "@/components/minimal-tiptap/guestReader"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"

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
  /** The id of the page's title heading, which names the doc's text. */
  labelledBy?: string
}

export function GuestDocViewer({ documentName, tokenFetcher, labelledBy }: GuestDocViewerProps) {
  const { provider, synced } = useCollaborationProvider({
    enabled: true,
    documentId: documentName,
    tokenFetcher,
    username: "Guest",
    userId: "guest",
  })

  const editor = useDocEditor({
    guest: true,
    editable: false,
    labelledBy,
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
      <div aria-busy="true" className="mt-6 grid min-h-[40vh] w-full content-start gap-3">
        <p role="status" className={slow ? "text-ui-sm text-ink-3" : "sr-only"}>
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

  // The doc's own type (DOC_EDITOR_CLASS), flush with the paper card's
  // measure: the card already insets the text. Its own TooltipProvider: the
  // signed-in app's providers hold the app's one, and the guest page is
  // outside them, so an image's actions (tooltipped) threw and took the
  // whole document down for a guest.
  return (
    <GuestReaderContext.Provider value={true}>
      <TooltipProvider delayDuration={500} skipDelayDuration={300}>
        <EditorContent editor={editor} className={cn(DOC_EDITOR_CLASS, "doc-editor-flush mt-4 max-w-none")} />
      </TooltipProvider>
    </GuestReaderContext.Provider>
  )
}

