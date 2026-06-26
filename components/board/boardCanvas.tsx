"use client"

// ---------------------------------------------------------------------------
// BoardCanvas: Excalidraw bound to a Yjs document for real-time collaboration.
//
// Binding model (kept library-agnostic, mirrors Excalidraw's own collab model):
//   - elements live in a Y.Map<id, element> ("elements"); each value is the
//     whole element object. Merge authority is the element `version` integer,
//     so concurrent edits converge last-writer-wins per element with no lock.
//   - images are uploaded to object storage (avscan + MinIO); only metadata
//     ({ id, objectUuid, mimeType }) lives in a Y.Map ("files"). Clients resolve
//     each image to a backend URL. Raw bytes never enter the Yjs document.
//   - cursors / selections are EPHEMERAL and travel over Yjs awareness, never
//     persisted into the document (Property 2 in the design).
//
// Excalidraw is client-only (no SSR), so it is dynamically imported.
// ---------------------------------------------------------------------------

import * as React from "react"
import dynamic from "next/dynamic"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import * as Y from "yjs"
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID"
import { Loader2 } from "@/lib/icons"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostFileUploadURL, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useClientConfig, formatBytes } from "@/hooks/useClientConfig"
import "@excalidraw/excalidraw/index.css"

// Types are erased at runtime; importing them as types keeps SSR safe.
import type {
  ExcalidrawImperativeAPI,
  Collaborator,
} from "@excalidraw/excalidraw/types"

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)

// Origin tag so the Yjs observer can ignore writes this client just made and
// avoid an echo/update loop.
const LOCAL_ORIGIN = "board-local"

// Personal Excalidraw library (shapes the user saves or installs from
// libraries.excalidraw.com). It is a per-browser collection shared across all
// boards, mirroring excalidraw.com behaviour, so it is persisted in
// localStorage rather than the shared Yjs document.
const LIBRARY_STORAGE_KEY = "onecamp:excalidraw:library"

// Per-board camera (scroll + zoom) persisted per browser, mirroring how
// Excalidraw/Figma/Miro remember where you were in a document. Restoring this
// on load is what stops a refresh from dropping the user on empty canvas far
// from their content. Stored client-side only (no backend writes on pan/zoom).
const VIEWPORT_STORAGE_PREFIX = "onecamp:board:viewport:"

interface BoardViewport {
  scrollX: number
  scrollY: number
  zoom: number
}

function loadBoardViewport(boardId: string): BoardViewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_PREFIX + boardId)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.scrollX === "number" && typeof v?.scrollY === "number" && typeof v?.zoom === "number") {
      return v as BoardViewport
    }
    return null
  } catch {
    return null
  }
}

function saveBoardViewport(boardId: string, v: BoardViewport) {
  try {
    localStorage.setItem(VIEWPORT_STORAGE_PREFIX + boardId, JSON.stringify(v))
  } catch {
    // Private mode / quota: a non-persisted camera is acceptable.
  }
}

// isAllowedLibraryHost only permits installing libraries from the official
// Excalidraw library host, so a crafted "#addLibrary=" link cannot make the
// browser fetch an arbitrary URL.
function isAllowedLibraryHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === "excalidraw.com" || host.endsWith(".excalidraw.com")
  } catch {
    return false
  }
}

// cloneElement returns an independent deep copy of an Excalidraw element before
// it is written into Yjs. This is REQUIRED: Excalidraw mutates element objects
// in place (e.g. it pushes points into the same `points` array while a freehand
// stroke is being drawn and bumps `version` on the same object). If we stored
// the live reference, `yElements.get(id)` would hand back that very object, so
// the version gate would always see existing.version === el.version and block
// every update after the first - persisting only a stroke's starting point and
// losing the rest on reload. Cloning gives Yjs a stable snapshot per change.
function cloneElement<T>(el: T): T {
  try {
    return structuredClone(el)
  } catch {
    return JSON.parse(JSON.stringify(el)) as T
  }
}

// Soft and hard limits on the number of (non-deleted) elements a board holds.
// Crossing the soft cap surfaces a one-time, non-blocking warning; the hard cap
// is enforced by AI generation (which refuses to push a board past it). These
// keep very large boards from degrading interactivity.
export const BOARD_MAX_ELEMENTS = 5000
export const BOARD_WARN_ELEMENTS = 4000

// boardAttachmentURL builds the backend image URL for a stored object. The
// endpoint enforces board access and 307-redirects to a presigned MinIO URL,
// which Excalidraw loads as an image (no raw bytes in the Yjs document).
function boardAttachmentURL(boardId: string, objectUuid: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")
  return `${baseUrl}${GetEndpointUrl.GetBoardAttachment}/${boardId}/${objectUuid}`
}

// uploadBoardImage sends a pasted/dropped image's bytes to the backend
// (avscan + MinIO) and returns the stored object uuid. The dataURL is only used
// as the byte source for the upload; it never enters the shared document.
async function uploadBoardImage(boardId: string, dataURL: string, mimeType: string): Promise<string> {
  const blob = await (await fetch(dataURL)).blob()
  return uploadBoardBlob(boardId, blob, mimeType || blob.type || "image/png")
}

// uploadBoardBlob uploads raw bytes (used by image paste and thumbnail capture)
// to the board attachment pipeline and returns the stored object uuid.
async function uploadBoardBlob(boardId: string, blob: Blob, mimeType: string): Promise<string> {
  const ext = (mimeType || blob.type || "image/png").split("/")[1] || "png"
  const file = new File([blob], `board-image.${ext}`, { type: mimeType || blob.type || "image/png" })
  const formData = new FormData()
  formData.append("file", file)
  formData.append("jsonData", JSON.stringify({ src_key: "board", src_value: boardId }))
  const res = await axiosInstance.post(PostFileUploadURL.UploadFile, formData)
  return (res.data as { object_uuid?: string })?.object_uuid || ""
}

interface BoardCanvasProps {
  provider: HocuspocusProvider
  /** The board uuid, used to upload/resolve images via the backend. */
  boardId: string
  /** Whether the Yjs document has finished its first sync. */
  synced: boolean
  /** Read-only viewers cannot mutate the canvas. */
  editable: boolean
  /** Current user, used for the awareness/cursor presence. */
  user: { id: string; name: string; profileKey?: string }
  /** Excalidraw theme follows the app theme. */
  theme?: "light" | "dark"
  /** Called once the imperative API is ready (for AI streaming etc.). */
  onApiReady?: (api: ExcalidrawImperativeAPI) => void
}

export function BoardCanvas({
  provider,
  boardId,
  synced,
  editable,
  user,
  theme = "light",
  onApiReady,
}: BoardCanvasProps) {
  const apiRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  const [api, setApi] = React.useState<ExcalidrawImperativeAPI | null>(null)
  // Excalidraw module, loaded client-side so we can render a custom MainMenu
  // (replacing Excalidraw's default menu, which ships its own brand/social
  // links and a "Reset the canvas" item we do not want on a shared board).
  const [excalMod, setExcalMod] = React.useState<typeof import("@excalidraw/excalidraw") | null>(null)
  React.useEffect(() => {
    let cancelled = false
    import("@excalidraw/excalidraw")
      .then((m) => {
        if (!cancelled) setExcalMod(m)
      })
      .catch(() => {
        /* falls back to the default menu if the module fails to load */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Yjs shared structures from the provider's document.
  const yDoc = provider.document
  const yElements = React.useMemo(() => yDoc.getMap<Record<string, unknown>>("elements"), [yDoc])
  // yFiles holds image METADATA only ({ id, objectUuid, mimeType }) - never raw
  // bytes. Images live in MinIO; clients resolve them to a backend URL.
  const yFiles = React.useMemo(() => yDoc.getMap<Record<string, unknown>>("files"), [yDoc])

  // Guards to prevent feedback loops when applying remote changes locally.
  const applyingRemoteRef = React.useRef(false)
  // fileIds we have already uploaded (local) or resolved (remote), so we never
  // re-upload or re-fetch the same image.
  const seenFilesRef = React.useRef<Set<string>>(new Set())
  // Tracks whether the large-board warning has already been shown this session,
  // so it surfaces once rather than on every edit past the cap.
  const warnedSizeRef = React.useRef(false)
  const { toast } = useToast()
  const clientConfig = useClientConfig()

  // Camera (scroll + zoom) persistence. We only begin saving after the initial
  // restore so the default 0,0 camera Excalidraw emits during mount can't
  // overwrite the user's remembered position before we apply it.
  const viewportRestoredRef = React.useRef(false)
  const viewportTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistViewport = React.useCallback(
    (scrollX: number, scrollY: number, zoom: number) => {
      if (!viewportRestoredRef.current) return
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current)
      viewportTimerRef.current = setTimeout(() => {
        saveBoardViewport(boardId, { scrollX, scrollY, zoom })
      }, 400)
    },
    [boardId],
  )

  // Reset the restore guard when switching boards so each board restores its
  // own camera once.
  React.useEffect(() => {
    viewportRestoredRef.current = false
  }, [boardId])

  React.useEffect(() => {
    return () => {
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current)
    }
  }, [])

  // Debounced canvas thumbnail capture (editors only). Best-effort: snapshots
  // the scene to a small PNG, uploads it, and stores the key on the board so
  // the listing can show a preview. Skipped for empty boards and viewers.
  const thumbTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureThumbnail = React.useCallback(async () => {
    if (!api || !editable) return
    try {
      const els = api.getSceneElements()
      if (!els.length) return
      const mod = await import("@excalidraw/excalidraw")
      const blob = await mod.exportToBlob({
        elements: els,
        appState: {
          ...api.getAppState(),
          exportBackground: true,
          viewBackgroundColor: "#ffffff",
          exportScale: 1,
        },
        // Skip embedding image bytes: their URLs are cross-origin (MinIO) and
        // would taint the export canvas. Shapes/text still render for the preview.
        files: {} as never,
        mimeType: "image/png",
        maxWidthOrHeight: 480,
        quality: 0.8,
      } as never)
      const objectUuid = await uploadBoardBlob(boardId, blob, "image/png")
      if (!objectUuid) return
      await axiosInstance.post(PostEndpointUrl.UpdateBoard, {
        board_uuid: boardId,
        board_thumbnail_key: objectUuid,
      })
    } catch {
      // Thumbnails are best-effort; never surface an error to the user.
    }
  }, [api, editable, boardId])

  const scheduleThumbnail = React.useCallback(() => {
    if (!editable) return
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current)
    thumbTimerRef.current = setTimeout(() => {
      void captureThumbnail()
    }, 10000)
  }, [editable, captureThumbnail])

  React.useEffect(() => {
    return () => {
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Personal library: load the saved library, persist changes, and handle an
  // "#addLibrary=<url>&token=..." deep link (e.g. opening a library from
  // libraries.excalidraw.com). The Excalidraw named helpers are imported
  // dynamically inside the effect so the package never loads during SSR.
  // -------------------------------------------------------------------------
  const persistLibrary = React.useCallback((items: readonly unknown[]) => {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items ?? []))
    } catch {
      // Private mode / quota: a non-persisted library is acceptable.
    }
  }, [])

  React.useEffect(() => {
    if (!api) return
    let cancelled = false
    void (async () => {
      let exc: typeof import("@excalidraw/excalidraw")
      try {
        exc = await import("@excalidraw/excalidraw")
      } catch {
        return
      }
      if (cancelled) return

      // Restore the user's saved library.
      try {
        const raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
        if (raw) {
          const items = JSON.parse(raw)
          if (Array.isArray(items) && items.length > 0 && !cancelled) {
            await api.updateLibrary({ libraryItems: items, merge: true })
          }
        }
      } catch {
        // Ignore a corrupt cache; the user can re-add libraries.
      }

      // Install a library from an "#addLibrary=" deep link, if present.
      const tokens = exc.parseLibraryTokensFromUrl?.()
      if (tokens && tokens.libraryUrl && !cancelled) {
        try {
          if (!isAllowedLibraryHost(tokens.libraryUrl)) {
            throw new Error("untrusted library host")
          }
          const res = await fetch(tokens.libraryUrl)
          const blob = await res.blob()
          const libItems = await exc.loadLibraryFromBlob(blob)
          if (!cancelled) {
            await api.updateLibrary({
              libraryItems: libItems,
              merge: true,
              openLibraryMenu: true,
              prompt: true,
            })
          }
        } catch {
          toast({
            title: "Could not add library",
            description: "This library link could not be loaded.",
            variant: "destructive",
          })
        } finally {
          // Clear the hash so a refresh does not re-trigger the install.
          if (typeof window !== "undefined" && window.location.hash.includes("addLibrary")) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search)
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, toast])

  // -------------------------------------------------------------------------
  // Seed the scene from the shared doc and subscribe to remote element/file
  // changes. This is gated on `api` ONLY (not `synced`): the observers are
  // attached BEFORE the initial server sync arrives, so the elements the
  // collaboration service streams on (re)connect are always painted, even if
  // they land a tick after the seed reads an empty map. Relying on the `synced`
  // transition alone was racy on a fresh reload and left a blank canvas while
  // the server still held the content (the "content cleared on refresh" bug).
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!api) return

    // Resolve image metadata entries to Excalidraw files by pointing each
    // fileId at its backend image URL (Excalidraw loads it as an image).
    const resolveFileEntries = (entries: Record<string, unknown>[]) => {
      const toAdd: { id: string; dataURL: string; mimeType: string; created: number }[] = []
      for (const meta of entries) {
        const m = meta as { id?: string; objectUuid?: string; mimeType?: string }
        if (!m.id || !m.objectUuid || seenFilesRef.current.has(m.id)) continue
        seenFilesRef.current.add(m.id)
        toAdd.push({
          id: m.id,
          dataURL: boardAttachmentURL(boardId, m.objectUuid),
          mimeType: m.mimeType || "image/png",
          created: Date.now(),
        })
      }
      if (toAdd.length > 0) api.addFiles(toAdd as never[])
    }

    // Reconcile the live scene with the shared doc, merging remote element
    // states over local by version (LWW per element). Safe to call repeatedly;
    // it is the single source of truth for "render whatever Yjs currently has".
    const hydrateFromY = () => {
      applyingRemoteRef.current = true
      try {
        resolveFileEntries(Array.from(yFiles.values()) as Record<string, unknown>[])
        const local = api.getSceneElementsIncludingDeleted()
        const merged = new Map<string, Record<string, unknown>>()
        for (const el of local) merged.set((el as { id: string }).id, el as never)
        yElements.forEach((remote) => {
          const id = (remote as { id: string }).id
          const cur = merged.get(id) as { version?: number } | undefined
          const rv = (remote as { version?: number }).version ?? 0
          // Clone so Excalidraw never receives (and mutates) the object Yjs
          // still holds, which would alias the stored value and corrupt it.
          if (!cur || (cur.version ?? 0) <= rv) merged.set(id, cloneElement(remote))
        })
        if (merged.size > 0) {
          api.updateScene({ elements: Array.from(merged.values()) as never[] })
        }
      } finally {
        applyingRemoteRef.current = false
      }
    }

    const onElementsChange = (_event: Y.YMapEvent<Record<string, unknown>>, txn: Y.Transaction) => {
      if (txn.origin === LOCAL_ORIGIN) return
      hydrateFromY()
    }

    const onFilesChange = (event: Y.YMapEvent<Record<string, unknown>>, txn: Y.Transaction) => {
      if (txn.origin === LOCAL_ORIGIN) return
      const entries: Record<string, unknown>[] = []
      event.keysChanged.forEach((k) => {
        const f = yFiles.get(k)
        if (f) entries.push(f as Record<string, unknown>)
      })
      resolveFileEntries(entries)
    }

    // Attach observers first so any update applied during/after the initial
    // sync is painted, then hydrate from whatever is already present.
    yElements.observe(onElementsChange)
    yFiles.observe(onFilesChange)
    hydrateFromY()

    return () => {
      yElements.unobserve(onElementsChange)
      yFiles.unobserve(onFilesChange)
    }
  }, [api, yElements, yFiles, boardId])

  // Belt-and-suspenders: when the provider reports a completed sync, hydrate
  // once more. If the initial sync update arrived before the observers were
  // attached (or in the same tick as the seed), this guarantees the freshly
  // synced content is on the canvas.
  React.useEffect(() => {
    if (!api || !synced) return
    applyingRemoteRef.current = true
    try {
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
    } finally {
      applyingRemoteRef.current = false
    }
  }, [api, synced, yElements])

  // -------------------------------------------------------------------------
  // Camera restore: once the API is ready, put the user back where they were
  // (saved per-board camera). If there is no saved camera (first open, a new
  // device, or a teammate opening a shared board), frame the existing content
  // so they never land on empty canvas and have to hunt for the drawing. Runs
  // once per board; enables camera persistence afterwards.
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!api || viewportRestoredRef.current) return

    const saved = loadBoardViewport(boardId)
    if (saved) {
      api.updateScene({
        appState: { scrollX: saved.scrollX, scrollY: saved.scrollY, zoom: { value: saved.zoom as number } } as never,
      })
      viewportRestoredRef.current = true
      return
    }

    // No saved camera: wait for content (it may stream in just after sync),
    // then fit it into view. Poll briefly so a slightly-late first sync still
    // gets framed.
    if (!synced) return
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const tryFit = () => {
      if (viewportRestoredRef.current) return
      const els = api.getSceneElements()
      if (els.length > 0) {
        api.scrollToContent(els, { fitToContent: true, animate: false } as never)
        viewportRestoredRef.current = true
      } else if (attempts++ < 12) {
        timer = setTimeout(tryFit, 200)
      } else {
        // Empty board: nothing to frame, leave the default camera and allow
        // persistence to start from here.
        viewportRestoredRef.current = true
      }
    }
    tryFit()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [api, synced, boardId])
  // -------------------------------------------------------------------------
  // Local -> Yjs: on every Excalidraw change, push changed elements into the
  // shared map. New images are uploaded to MinIO and only their metadata is
  // shared. Skipped while applying a remote change, and for viewers.
  // -------------------------------------------------------------------------
  const handleChange = React.useCallback(
    (elements: readonly { id: string; version?: number }[], appState: unknown, files: Record<string, unknown>) => {
      // Persist the camera (scroll + zoom) for everyone, including viewers and
      // while applying remote changes: panning/zooming is per-user navigation,
      // not a board mutation, and we want a refresh to restore it.
      const vs = appState as { scrollX?: number; scrollY?: number; zoom?: { value?: number } } | undefined
      if (vs && typeof vs.scrollX === "number" && typeof vs.scrollY === "number") {
        persistViewport(vs.scrollX, vs.scrollY, vs.zoom?.value ?? 1)
      }

      if (!editable || applyingRemoteRef.current) return
      // Sync from the full scene INCLUDING deleted elements so erases persist
      // (an eraser stroke flips isDeleted + bumps version; if we only synced the
      // visible elements the deletion would never reach Yjs and the element
      // would reappear on reload). Fall back to the onChange list if the API
      // is not ready yet.
      const allEls =
        (apiRef.current?.getSceneElementsIncludingDeleted() as readonly {
          id: string
          version?: number
          versionNonce?: number
          isDeleted?: boolean
        }[]) ?? elements
      yDoc.transact(() => {
        for (const el of allEls) {
          const existing = yElements.get(el.id) as
            | { version?: number; versionNonce?: number; isDeleted?: boolean }
            | undefined
          // Never resurrect a tombstone the shared doc does not have: a deleted
          // element with no entry in Yjs was either pruned by the server's
          // compaction or deleted before it ever synced. Re-adding it would
          // undo pruning and let the document grow back.
          if (!existing && (el.isDeleted ?? false)) continue
          const ev = existing?.version ?? -1
          const elv = el.version ?? 0
          const liveDeleted = (el as { isDeleted?: boolean }).isDeleted ?? false
          const storedDeleted = existing?.isDeleted ?? false
          // Store when the version advanced, when it matches but the nonce
          // differs (a same-version content change), when brand new, or whenever
          // the deletion state changed. The explicit isDeleted check is what
          // makes the eraser stick: a delete/undelete must always reach Yjs even
          // if the version bookkeeping looks unchanged, otherwise the element
          // resurrects on reload. Always store a CLONE - never the live, mutated
          // Excalidraw object (it mutates in place and would alias the snapshot).
          if (
            !existing ||
            ev < elv ||
            (ev === elv && existing.versionNonce !== el.versionNonce) ||
            liveDeleted !== storedDeleted
          ) {
            yElements.set(el.id, cloneElement(el) as never)
          }
        }
      }, LOCAL_ORIGIN)

      // Graceful size warning: count live (non-deleted) elements and warn once
      // when the board grows past the soft cap. Reset when it drops back below,
      // so a later growth can warn again.
      let liveCount = 0
      for (const el of elements) {
        if (!(el as { isDeleted?: boolean }).isDeleted) liveCount++
      }
      if (liveCount >= BOARD_WARN_ELEMENTS && !warnedSizeRef.current) {
        warnedSizeRef.current = true
        toast({
          title: "This board is getting large",
          description: `It has about ${liveCount} elements. Very large boards can slow down. Consider splitting it into multiple boards.`,
        })
      } else if (liveCount < BOARD_WARN_ELEMENTS && warnedSizeRef.current) {
        warnedSizeRef.current = false
      }

      // Refresh the board thumbnail a while after edits settle.
      scheduleThumbnail()

      // Offload any new images to object storage (async, outside the transact).
      if (files) {
        for (const [fileId, file] of Object.entries(files)) {
          if (yFiles.has(fileId) || seenFilesRef.current.has(fileId)) continue
          const f = file as { dataURL?: string; mimeType?: string }
          if (!f.dataURL || !f.dataURL.startsWith("data:")) continue
          seenFilesRef.current.add(fileId)

          // Guard the workspace upload limit before sending bytes. base64 is
          // ~4/3 the byte size; estimate to skip an obviously-too-large image
          // (the backend enforces the real cap too).
          const approxBytes = Math.floor((f.dataURL.length - (f.dataURL.indexOf(",") + 1)) * 0.75)
          if (clientConfig.upload_limit_bytes > 0 && approxBytes > clientConfig.upload_limit_bytes) {
            toast({
              title: "Image too large",
              description: `Images must be under ${clientConfig.upload_limit_mb} MB (this one is about ${formatBytes(approxBytes)}).`,
              variant: "destructive",
            })
            // Keep it marked seen so we don't retry on every change.
            continue
          }

          uploadBoardImage(boardId, f.dataURL, f.mimeType || "image/png")
            .then((objectUuid) => {
              if (!objectUuid) return
              yDoc.transact(() => {
                yFiles.set(fileId, { id: fileId, objectUuid, mimeType: f.mimeType || "image/png" })
              }, LOCAL_ORIGIN)
            })
            .catch(() => {
              // Keep it marked seen (no retry loop on every change) and tell
              // the user once; they can remove and re-add to try again.
              toast({
                title: "Image upload failed",
                description: "The image could not be saved to the board. Please try again.",
                variant: "destructive",
              })
            })
        }
      }
    },
    [editable, yDoc, yElements, yFiles, boardId, toast, clientConfig.upload_limit_bytes, clientConfig.upload_limit_mb, scheduleThumbnail, persistViewport],
  )

  // -------------------------------------------------------------------------
  // Awareness: broadcast our pointer + selection, and render remote ones as
  // Excalidraw collaborators (live cursors).
  // -------------------------------------------------------------------------
  const awareness = provider.awareness

  // Throttle pointer broadcasts (~20/sec). Excalidraw fires onPointerUpdate on
  // every mouse move; unthrottled this floods awareness for every collaborator.
  const lastPointerSentRef = React.useRef(0)
  const handlePointerUpdate = React.useCallback(
    (payload: { pointer: { x: number; y: number }; button: "down" | "up" }) => {
      if (!awareness) return
      const now = Date.now()
      // Always send button transitions immediately; throttle plain moves.
      if (payload.button === "up" && now - lastPointerSentRef.current < 50) return
      lastPointerSentRef.current = now
      awareness.setLocalStateField("pointer", payload.pointer)
      awareness.setLocalStateField("button", payload.button)
    },
    [awareness],
  )

  React.useEffect(() => {
    if (!api || !awareness) return

    // Publish identity once so others can label our cursor.
    const color = generateColorFromUUID(user.id || "default")
    awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name,
      color,
      profileKey: user.profileKey,
    })

    const onAwareness = () => {
      const states = awareness.getStates() as Map<number, Record<string, unknown>>
      const collaborators = new Map<string, Collaborator>()
      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const u = state.user as { id?: string; name?: string; color?: string; profileKey?: string } | undefined
        if (!u?.name) return
        const pointer = state.pointer as { x: number; y: number } | undefined
        collaborators.set(String(clientId), {
          username: u.name,
          pointer: pointer ? { x: pointer.x, y: pointer.y, tool: "pointer" } : undefined,
          button: (state.button as "down" | "up") || "up",
          color: { background: u.color || "#6366f1", stroke: "#ffffff" },
          id: u.id,
        } as Collaborator)
      })
      api.updateScene({ collaborators: collaborators as never })
    }

    awareness.on("change", onAwareness)
    onAwareness()
    return () => {
      awareness.off("change", onAwareness)
    }
  }, [api, awareness, user.id, user.name, user.profileKey])

  const handleApi = React.useCallback(
    (instance: ExcalidrawImperativeAPI) => {
      apiRef.current = instance
      setApi(instance)
      onApiReady?.(instance)
    },
    [onApiReady],
  )

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={handleApi}
        onChange={handleChange as never}
        onPointerUpdate={handlePointerUpdate as never}
        onLibraryChange={persistLibrary as never}
        viewModeEnabled={!editable}
        theme={theme}
        initialData={{
          // Enable object snapping so dragging/resizing shows alignment guides
          // and snaps to nearby elements - cleaner, more precise diagrams.
          appState: { objectsSnapModeEnabled: true },
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
          },
        }}
      >
        {excalMod && (
          <excalMod.MainMenu>
            <excalMod.MainMenu.DefaultItems.SearchMenu />
            <excalMod.MainMenu.DefaultItems.SaveAsImage />
            <excalMod.MainMenu.DefaultItems.ChangeCanvasBackground />
            <excalMod.MainMenu.DefaultItems.Help />
          </excalMod.MainMenu>
        )}
      </Excalidraw>
    </div>
  )
}

export default BoardCanvas
