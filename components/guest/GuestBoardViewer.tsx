"use client"

/**
 * GuestBoardViewer — a read-only, LIVE view of a shared board for an external
 * guest. It binds Excalidraw (view mode) to the live Yjs document over the
 * collaboration websocket using a short-lived guest collab token.
 *
 * This is a deliberately SLIM, isolated viewer rather than a reuse of the
 * member BoardCanvas: the member canvas depends on authenticated hooks (client
 * config, the member image pipeline, axios auth interceptors) that don't apply
 * to a guest and could trigger auth redirects. Here we only:
 *   - mirror BoardCanvas's Yjs binding (elements map, version-LWW merge),
 *   - resolve images through the grant-authorized guest attachment endpoint,
 *   - render view-only (no editing, no awareness publishing, no thumbnails).
 * The collaboration service also enforces read-only server-side.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import * as Y from "yjs"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { Loader2 } from "@/lib/icons"
import "@excalidraw/excalidraw/index.css"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

function cloneElement<T>(el: T): T {
  try {
    return structuredClone(el)
  } catch {
    return JSON.parse(JSON.stringify(el)) as T
  }
}

interface GuestBoardViewerProps {
  /** Hocuspocus document name ("board:<id>"). */
  documentName: string
  /** Raw board uuid, for resolving image attachment URLs. */
  boardId: string
  /** Raw share-link token, used to authorize guest image fetches. */
  token: string
  /** Returns a fresh short-lived guest collab JWT on every (re)connect. */
  tokenFetcher: () => Promise<string>
}

export function GuestBoardViewer({ documentName, boardId, token, tokenFetcher }: GuestBoardViewerProps) {
  const { provider, synced } = useCollaborationProvider({
    enabled: true,
    documentId: documentName,
    tokenFetcher,
    username: "Guest",
    userId: "guest",
  })

  const [api, setApi] = React.useState<ExcalidrawImperativeAPI | null>(null)
  const seenFilesRef = React.useRef<Set<string>>(new Set())

  const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
  const guestAttachmentURL = React.useCallback(
    (objectUuid: string) =>
      `${backendBase}/guest/board-attachment/${encodeURIComponent(token)}/${encodeURIComponent(objectUuid)}`,
    [backendBase, token],
  )

  // Bind the live Yjs document into the read-only Excalidraw scene. Mirrors the
  // member canvas: attach observers first, then hydrate, so content that streams
  // in just after the initial sync is always painted.
  React.useEffect(() => {
    if (!api || !provider) return
    const yDoc = provider.document
    const yElements = yDoc.getMap<Record<string, unknown>>("elements")
    const yFiles = yDoc.getMap<Record<string, unknown>>("files")

    const resolveFileEntries = (entries: Record<string, unknown>[]) => {
      const toAdd: { id: string; dataURL: string; mimeType: string; created: number }[] = []
      for (const meta of entries) {
        const m = meta as { id?: string; objectUuid?: string; mimeType?: string }
        if (!m.id || !m.objectUuid || seenFilesRef.current.has(m.id)) continue
        seenFilesRef.current.add(m.id)
        toAdd.push({
          id: m.id,
          dataURL: guestAttachmentURL(m.objectUuid),
          mimeType: m.mimeType || "image/png",
          created: Date.now(),
        })
      }
      if (toAdd.length > 0) api.addFiles(toAdd as never[])
    }

    const hydrate = () => {
      resolveFileEntries(Array.from(yFiles.values()) as Record<string, unknown>[])
      const local = api.getSceneElementsIncludingDeleted()
      const merged = new Map<string, Record<string, unknown>>()
      for (const el of local) merged.set((el as { id: string }).id, el as never)
      yElements.forEach((remote) => {
        const id = (remote as { id: string }).id
        const cur = merged.get(id) as { version?: number } | undefined
        const rv = (remote as { version?: number }).version ?? 0
        if (!cur || (cur.version ?? 0) <= rv) merged.set(id, cloneElement(remote))
      })
      if (merged.size > 0) {
        api.updateScene({ elements: Array.from(merged.values()) as never[] })
      }
    }

    const onElements = () => hydrate()
    const onFiles = (event: Y.YMapEvent<Record<string, unknown>>) => {
      const entries: Record<string, unknown>[] = []
      event.keysChanged.forEach((k) => {
        const f = yFiles.get(k)
        if (f) entries.push(f as Record<string, unknown>)
      })
      resolveFileEntries(entries)
    }

    yElements.observe(onElements)
    yFiles.observe(onFiles)
    hydrate()

    return () => {
      yElements.unobserve(onElements)
      yFiles.unobserve(onFiles)
    }
  }, [api, provider, guestAttachmentURL])

  // Frame the content once synced so the guest doesn't land on empty canvas.
  React.useEffect(() => {
    if (!api || !synced) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const tryFit = () => {
      const els = api.getSceneElements()
      if (els.length > 0) {
        api.scrollToContent(els, { fitToContent: true, animate: false } as never)
      } else if (attempts++ < 12) {
        timer = setTimeout(tryFit, 200)
      }
    }
    tryFit()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [api, synced])

  if (!provider) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={(a: ExcalidrawImperativeAPI) => setApi(a)}
        viewModeEnabled
        zenModeEnabled
        UIOptions={{ canvasActions: { export: false, saveToActiveFile: false, loadScene: false, toggleTheme: false } }}
      />
    </div>
  )
}

export default GuestBoardViewer
