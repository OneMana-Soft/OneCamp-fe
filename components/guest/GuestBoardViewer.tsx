"use client"

/**
 * GuestBoardViewer — a LIVE view of a shared board for someone outside the
 * workspace, bound to the live Yjs document over the collaboration websocket
 * with a short-lived guest collab token:
 *   - a share link's guest only looks;
 *   - a call's guest draws on the board on the call's stage while the call
 *     lets them (canDraw: "Guests can draw") and the collaboration server
 *     agrees (it decides on every connect, and reconnects them whenever the
 *     call changes its mind). Their strokes reach the document through the
 *     binding's one writer, as a member's do. A guest adds no pictures: they
 *     upload nothing.
 *   - a call's guest sees everyone's cursor on the board, and shows the
 *     others their own (by their guest name) only while they may draw,
 *     through the member canvas's own presence (components/board/boardPresence).
 *     A share link's guest neither shows nor sees any.
 *
 * This is a deliberately SLIM, isolated view rather than a reuse of the
 * member BoardCanvas: the member canvas depends on authenticated hooks (client
 * config, the member image pipeline, axios auth interceptors) that don't apply
 * to a guest and could trigger auth redirects. Here we only:
 *   - bind the elements map through BoardCanvas's own lib/board/binding, both ways,
 *   - resolve images through the grant-authorized guest attachment endpoint,
 *   - make no thumbnails.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import * as Y from "yjs"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { LOCAL_ORIGIN, followShared, liveCount, storeScene, type BoardElement, type SharedElements } from "@/lib/board/binding"
import { NOTE_AUTHORS, stampNewNotes } from "@/lib/board/authors"
import { sceneSignature } from "@/lib/board/scene"
import { useSceneReady } from "@/hooks/useSceneReady"
import { useBoardPresence } from "@/components/board/boardPresence"
import { BoardCursors } from "@/components/board/boardCursors"
import { CanvasPending } from "@/components/guest/canvasPending"
import { useBoardTheme } from "@/components/board/useBoardTheme"
import "@excalidraw/excalidraw/index.css"
// Before Excalidraw loads: its faces come from this server, never esm.sh (V-94).
import "@/lib/board/excalidrawAssets"
import "@/components/board/excalidrawTheme.css"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <CanvasPending />,
})

interface GuestBoardViewerProps {
  /** Hocuspocus document name ("board:<id>"). */
  documentName: string
  /** Raw board uuid, for resolving image attachment URLs. */
  boardId: string
  /** What authorizes guest image fetches: a share link's token, or a call's board token ("" until it comes). */
  token: string
  /** Returns a fresh short-lived guest collab JWT on every (re)connect. */
  tokenFetcher: () => Promise<string>
  /** The call lets this guest draw now; the collaboration server has the last word. */
  canDraw?: boolean
  /**
   * The canvas's theme. A share link's page gives none, so the canvas follows
   * the viewer's theme as a member's board does (it was forced light, inside
   * a dark page's chrome); a call's stage gives "dark".
   */
  theme?: "light" | "dark"
  /** Who the guest is to the board's people: a call's guest's identity, and their name as a guest's. A share link's guest has none. */
  user?: { id: string; name: string }
}

/** A share link's guest: no one to the board's people, so no cursor either way. */
const NO_ONE = { id: "", name: "" }

export function GuestBoardViewer({ documentName, token, tokenFetcher, canDraw = false, user, theme: given }: GuestBoardViewerProps) {
  const followed = useBoardTheme()
  const theme = given ?? followed
  const { provider, synced, readOnly } = useCollaborationProvider({
    enabled: true,
    documentId: documentName,
    tokenFetcher,
    username: user?.name ?? "Guest",
    userId: user?.id ?? "guest",
  })
  const drawing = canDraw && !readOnly

  const [api, setApi] = React.useState<ExcalidrawImperativeAPI | null>(null)
  // Cursors: a call's guest (one with a `user`) sees everyone's, and publishes
  // their own name and pointer only while drawing (main, 27 Oct).
  const inCall = user !== undefined
  const onPointerUpdate = useBoardPresence({
    awareness: inCall ? provider?.awareness : null,
    user: user ?? NO_ONE,
    publish: inCall && drawing,
  })
  const seenFilesRef = React.useRef<Set<string>>(new Set())
  // How many elements the guest sees, on the canvas's wrapper, as the member's canvas says it (data-board-elements).
  const wrapRef = React.useRef<HTMLDivElement>(null)

  const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
  const guestAttachmentURL = React.useCallback(
    (objectUuid: string) =>
      `${backendBase}/guest/board-attachment/${encodeURIComponent(token)}/${encodeURIComponent(objectUuid)}`,
    [backendBase, token],
  )

  // As on the member's canvas, nothing goes on before Excalidraw's own scene,
  // which would wipe it (useSceneReady).
  const sceneReady = useSceneReady(api)

  // Bind the live Yjs document into the read-only Excalidraw scene. Mirrors the
  // member canvas: attach observers first, then hydrate, so content that streams
  // in just after the initial sync is always painted.
  React.useEffect(() => {
    if (!api || !provider || !sceneReady) return
    const yDoc = provider.document
    const yElements = yDoc.getMap<Record<string, unknown>>("elements")
    const yFiles = yDoc.getMap<Record<string, unknown>>("files")

    const resolveFileEntries = (entries: Record<string, unknown>[]) => {
      // A call's guest's pictures wait for the board's token; the files are read again once it comes.
      if (!token) return
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

    const onFiles = (event: Y.YMapEvent<Record<string, unknown>>) => {
      const entries: Record<string, unknown>[] = []
      event.keysChanged.forEach((k) => {
        const f = yFiles.get(k)
        if (f) entries.push(f as Record<string, unknown>)
      })
      resolveFileEntries(entries)
    }
    yFiles.observe(onFiles)
    resolveFileEntries(Array.from(yFiles.values()) as Record<string, unknown>[])

    // The member canvas's one binding (lib/board/binding followShared): all
    // of the drawing now, then each change by the keys it touched.
    const mark = () => {
      if (wrapRef.current) wrapRef.current.dataset.boardElements = String(liveCount(api.getSceneElements() as never))
    }
    const follow = followShared(api, yElements as unknown as SharedElements, { onMerged: mark })
    mark()

    return () => {
      follow.stop()
      yFiles.unobserve(onFiles)
    }
  }, [api, provider, sceneReady, guestAttachmentURL, token])

  // A guest who may draw writes what they changed to the document, as a
  // member's canvas does; a pan or a zoom changes no element, so it writes
  // nothing (sceneSignature).
  const lastSignature = React.useRef(sceneSignature([]))
  const onChange = React.useCallback(() => {
    if (!api || !provider) return
    const scene = api.getSceneElementsIncludingDeleted() as readonly BoardElement[]
    const signature = sceneSignature(scene)
    if (signature === lastSignature.current) return
    lastSignature.current = signature
    const doc = provider.document
    // The document's map holds Excalidraw's elements as plain records.
    // A note new to the shared board goes with its maker: this guest, by their name as a guest.
    doc.transact(() => {
      const shared = doc.getMap<Record<string, unknown>>("elements")
      stampNewNotes(doc.getMap<unknown>(NOTE_AUTHORS), scene as never, shared, { id: user?.id ?? "", name: user?.name ?? "Guest" })
      storeScene(shared as never, scene)
    }, LOCAL_ORIGIN)
  }, [api, provider, user?.id, user?.name])

  // Frame the content once synced so the guest doesn't land on empty canvas.
  React.useEffect(() => {
    if (!api || !synced || !sceneReady) return
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
  }, [api, synced, sceneReady])

  if (!provider) return <CanvasPending />

  return (
    <div ref={wrapRef} className="relative h-full w-full" data-guest-board="">
      <Excalidraw
        excalidrawAPI={(a: ExcalidrawImperativeAPI) => setApi(a)}
        viewModeEnabled={!drawing}
        zenModeEnabled={!drawing}
        theme={theme}
        onChange={drawing ? onChange : undefined}
        onPointerUpdate={drawing ? (onPointerUpdate as never) : undefined}
        UIOptions={{ canvasActions: { export: false, saveToActiveFile: false, loadScene: false, toggleTheme: false }, tools: { image: false } }}
      />
      {inCall && <BoardCursors api={api} awareness={provider.awareness} dark={theme === "dark"} />}
    </div>
  )
}

