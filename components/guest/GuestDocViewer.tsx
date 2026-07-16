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

import * as React from "react"
import "@/components/minimal-tiptap/styles/index.css"
import { EditorContent } from "@tiptap/react"
import { useMinimalTiptapEditor } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { Loader2 } from "@/lib/icons"

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

  // Gate on the provider being ready so the editor is built already bound to
  // Yjs (same pattern as the member editor) — avoids a flash of empty content.
  if (!provider || !editor) {
    return (
      <div className="flex min-h-[40vh] w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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

export default GuestDocViewer
