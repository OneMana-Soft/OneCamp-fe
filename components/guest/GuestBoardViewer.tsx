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
 *   - a share link's guest is brought and held (miro-21), never a trigger: an
 *     editor presenting takes them along, fitted to their screen, a hold keeps
 *     them there, and a bring moves them once with a way back, through the
 *     member board's own hooks (board/usePresenterFollow, board/useBringReceiver).
 *   - a share link's guest reacts and raises a hand (miro-24 W3-B2) with the
 *     board's own React button and signals (board/boardSignalsLater), as
 *     someone who may not edit: they see everyone's reactions rise, and an
 *     editor may lower their hand, but they hear of no one's hand and lower
 *     none. They say who they are only on their first reaction or hand; the
 *     collaboration server names them by their link. A call's guest reacts
 *     in the call (its reactions are the board's set).
 *     A call's guest follows the call's slides instead.
 *
 * This is a deliberately SLIM, isolated view rather than a reuse of the
 * member BoardCanvas: the member canvas depends on authenticated hooks (client
 * config, the member image pipeline, axios auth interceptors) that don't apply
 * to a guest and could trigger auth redirects. Here we only:
 *   - bind the elements map through BoardCanvas's own lib/board/binding, both ways,
 *   - resolve images through the grant-authorized guest attachment endpoint,
 *   - make no thumbnails.
 */

import { lazyPiece } from "@/lib/lazy/lazyPiece"
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
import { useSheetMode } from "@/components/ui/overlayMode"
import { usePresenterFollow } from "@/components/board/usePresenterFollow"
import { useBringReceiver } from "@/components/board/useBringReceiver"
import { useBoardSignalsLater } from "@/components/board/boardSignalsLater"
import { FollowFrame } from "@/components/docEditor/presence/FollowFrame"
import { setPresenceControl, type PresenceControl } from "@/components/docEditor/presence/control"
import { onEscape } from "@/lib/keys/onEscape"
import "@excalidraw/excalidraw/index.css"
// Before Excalidraw loads: its faces come from this server, never esm.sh (V-94).
import "@/lib/board/excalidrawAssets"
import "@/components/board/excalidrawTheme.css"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"

// A guest's cards stay shut and read nothing; other sites are framed as for members (boardEmbeds).
const GuestEmbedView = lazyPiece(() => import("@/components/board/boardEmbeds"))
// A share link's guest's React button (components/guest/guestReact), a chunk of its own.
const GuestReact = lazyPiece(() => import("@/components/guest/guestReact"))

// Excalidraw as every board draws it (boardExcalidraw).
const Excalidraw = dynamic(async () => (await import("@/components/board/boardExcalidraw")).default, {
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
  /** A frame the board opens at, which its caller puts the camera on (a call's slide): no first framing of the whole drawing over it. */
  opensAt?: string
  /** Excalidraw's API and the board's document, once both are there (a call's stage reads the frames' order). */
  onApiReady?: (api: ExcalidrawImperativeAPI, doc: Y.Doc) => void
}

/** A share link's guest: no one to the board's people, so no cursor either way. */
const NO_ONE = { id: "", name: "" }

export function GuestBoardViewer({ documentName, token, tokenFetcher, canDraw = false, user, theme: given, opensAt, onApiReady }: GuestBoardViewerProps) {
  const followed = useBoardTheme()
  const theme = given ?? followed
  const sheetMode = useSheetMode()
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
  // A share link's guest follows an editor presenting and is brought by a bring; a call's guest follows the call's
  // slides (its stage's opensAt), so a presenter on the board never pulls the stage away.
  const linkGuest = !inCall
  const live = linkGuest ? provider?.awareness : null
  const { presenter, held, stopFollowing } = usePresenterFollow(linkGuest ? api : null, live)
  useBringReceiver(live, linkGuest ? api : null, synced)
  // A share link's guest's reactions and hand (miro-24 W3-B2): the board's own signals, as someone who may not edit.
  const { react, hand, layer: rising } = useBoardSignalsLater(live, false, synced)
  const hereKey = `guest:${documentName}`
  const control = React.useMemo<PresenceControl | null>(() => {
    if (!live) return null
    // They say who they are on their first act; the collaboration server names them by their link.
    const sayWho = () => {
      if (!live.getLocalState()?.user) live.setLocalStateField("user", { id: "guest", name: "Guest" })
    }
    return {
      jump: () => false,
      follow: () => {},
      following: null,
      react: (emoji) => {
        sayWho()
        react(emoji)
      },
      hand: {
        up: hand.up,
        set: (up) => {
          sayWho()
          hand.set(up)
        },
      },
    }
  }, [live, react, hand])
  React.useEffect(() => {
    if (!control) return
    setPresenceControl(hereKey, control)
    return () => setPresenceControl(hereKey, null)
  }, [hereKey, control])
  // Esc stops following, while there is someone to stop following (not again on each of their moves).
  const followingSomeone = presenter !== null
  React.useEffect(() => (followingSomeone && !held ? onEscape("page", stopFollowing) : undefined), [followingSomeone, held, stopFollowing])
  const who = presenter?.name || "them"
  const followSaid = presenter ? (held ? `Following ${who}, held on their view` : `Following ${who}. Press Esc to stop.`) : ""
  const seenFilesRef = React.useRef<Set<string>>(new Set())
  // How many elements the guest sees, on the canvas's wrapper, as the member's canvas says it (data-board-elements).
  const wrapRef = React.useRef<HTMLDivElement>(null)
  // The board's element itself, for the React button to find Excalidraw's zoom cluster in (components/guest/guestReact).
  const [wrap, setWrap] = React.useState<HTMLDivElement | null>(null)
  const wrapTo = React.useCallback((el: HTMLDivElement | null) => {
    wrapRef.current = el
    setWrap(el)
  }, [])

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

  React.useEffect(() => {
    if (api && provider) onApiReady?.(api, provider.document)
  }, [api, provider, onApiReady])

  // Frame the content once synced so the guest doesn't land on empty canvas.
  React.useEffect(() => {
    if (!api || !synced || !sceneReady || opensAt) return
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
  }, [api, synced, sceneReady, opensAt])

  if (!provider) return <CanvasPending />

  return (
    <div ref={wrapTo} className="relative h-full w-full" data-guest-board="">
      <Excalidraw
        guest
        sheetMode={sheetMode}
        embedView={GuestEmbedView}
        excalidrawAPI={(a: ExcalidrawImperativeAPI) => setApi(a)}
        viewModeEnabled={!drawing}
        zenModeEnabled={!drawing}
        theme={theme}
        onChange={drawing ? onChange : undefined}
        onPointerUpdate={drawing ? (onPointerUpdate as never) : undefined}
        UIOptions={{ canvasActions: { export: false, saveToActiveFile: false, loadScene: false, toggleTheme: false }, tools: { image: false } }}
      />
      {inCall && <BoardCursors api={api} awareness={provider.awareness} dark={theme === "dark"} />}
      <FollowFrame leader={presenter ? { id: presenter.userId, name: presenter.name } : null} said={followSaid} onStop={stopFollowing} held={held} />
      {control && (
        <React.Suspense fallback={null}>
          <GuestReact hereKey={hereKey} host={wrap} />
        </React.Suspense>
      )}
      {rising}
    </div>
  )
}

