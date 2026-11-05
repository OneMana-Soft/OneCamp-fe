"use client"

// Protected objects on the board (miro-44; the record and its words are lib/board/protection), in one chunk the
// workbench loads only when the board has a protected object or the reader may protect:
//
//  - ProtectControl, in the bar beside a selection: Protect, or "Protected by Ann" and Lift protection, for the
//    board's owner and workspace admins (getBoardInfo's board_can_protect); "Protected by Ann" for everyone else
//    who selects one (a right press or a long press selects a locked object). A press asks the API, which checks
//    who may, writes the audit row and has the collaboration server change the record and the objects together;
//    the board then shows the change as any collaborator's. A refusal says why in the server's words (the app's
//    error toast, lib/axiosInstance).
//  - ProtectedLayer: a lock badge on each protected object in view, named "Protected by Ann" to a mouse that
//    rests on it, and the toast when the server puts back this tab's change to a protected object (Excalidraw's
//    Unlock, say): the server always does, the owner's tab included, so the tab says why at once.
//
// The badges are an overlay over the canvas, never part of the drawing, as the notes' tag chips are (z-2: over the
// canvases, under the cursors and every panel and bar).

import * as React from "react"
import type * as Y from "yjs"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import axiosInstance from "@/lib/axiosInstance"
import { BoardProtectRoutes } from "@/services/endpoints/boards.protect"
import { useToast } from "@/hooks/use-toast"
import { useBoardView } from "@/hooks/useBoardView"
import { useSceneElements } from "@/hooks/useSceneElements"
import { FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { Lock } from "@/lib/icons"
import { LOCAL_ORIGIN } from "@/lib/board/binding"
import { selectedIn } from "@/lib/board/scene"
import { boxInView, sceneToLocal } from "@/lib/board/viewport"
import { MAX_PROTECT, firstProtected, protectedBy, protectionDone, protectionLabel, protectionPlan, putBackCopy, type ProtectionRecord } from "@/lib/board/protection"
import type { SceneElement } from "@/components/board/boardOps"

/** The badge's side, and how far it sits out over the object's top right corner. */
const BADGE = 20
const OUT = 6

/**
 * Protect or lift, in the selection's bar, or who protected it. `canProtect` is the board's owner or a workspace
 * admin on a board they can edit; `lead` puts a divider before it, when it follows a bar's own buttons.
 */
export function ProtectControl({
  api,
  boardId,
  ids,
  record,
  canProtect,
  lead = false,
}: {
  api: ExcalidrawImperativeAPI
  boardId: string
  ids: readonly string[]
  record: ProtectionRecord
  canProtect: boolean
  lead?: boolean
}) {
  const { toast } = useToast()
  const all = useSceneElements<SceneElement>(api)
  const plan = React.useMemo(() => protectionPlan(selectedIn(all, [...ids]), record), [all, ids, record])
  const [busy, setBusy] = React.useState(false)
  const who = protectedBy(plan.protect ? [] : plan.ids, record)
  if (plan.ids.length === 0 || (!canProtect && !who)) return null

  const press = async () => {
    if (busy) return
    if (plan.ids.length > MAX_PROTECT) {
      toast({ variant: "destructive", title: plan.protect ? "Nothing was protected" : "No protection was lifted", description: `Choose at most ${MAX_PROTECT} objects at a time.` })
      return
    }
    setBusy(true)
    try {
      const res = await axiosInstance.post<{ changed?: number }>(BoardProtectRoutes.Protect, { board_uuid: boardId, element_ids: plan.ids, protect: plan.protect })
      toast(protectionDone(plan.protect, Number(res.data?.changed ?? 0)))
    } catch {
      // The app's error toast has said why, in the server's words (403: only the owner and admins).
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {lead && <FloatingBarDivider />}
      {who && (
        <span data-protected-by="" className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-ui-sm text-ink-2 [&_svg]:size-4">
          <Lock aria-hidden="true" />
          <span>{who}</span>
        </span>
      )}
      {canProtect && (
        <>
          {who && <FloatingBarDivider />}
          <FloatingBarButton label={protectionLabel(plan.protect, plan.ids.length)} disabled={busy} aria-busy={busy || undefined} onClick={() => void press()} className="px-2 text-ink" data-protect-action={plan.protect ? "protect" : "lift"}>
            {!who && <Lock />}
            <span>{plan.protect ? "Protect" : "Lift protection"}</span>
          </FloatingBarButton>
        </>
      )}
    </>
  )
}

/** Tells this tab when the server will put back its change to a protected object: any write of this tab's to one. */
function usePutBackTold(doc: Y.Doc, record: ProtectionRecord, canProtect: boolean) {
  const { toast } = useToast()
  const latest = React.useRef({ record, canProtect })
  latest.current = { record, canProtect }
  React.useEffect(() => {
    const elements = doc.getMap<unknown>("elements")
    // One toast for a burst (an Unlock of several, a nudge held down), not one for each.
    let told = 0
    const heard = (event: Y.YMapEvent<unknown>) => {
      if (event.transaction.origin !== LOCAL_ORIGIN) return
      const { record, canProtect } = latest.current
      const id = firstProtected(event.keysChanged, record)
      if (!id || Date.now() - told < 4000) return
      told = Date.now()
      toast(putBackCopy(record.get(id), canProtect))
    }
    elements.observe(heard)
    return () => elements.unobserve(heard)
  }, [doc, toast])
}

export default function ProtectedLayer({ api, doc, record, canProtect }: { api: ExcalidrawImperativeAPI; doc: Y.Doc; record: ProtectionRecord; canProtect: boolean }) {
  usePutBackTold(doc, record, canProtect)
  const all = useSceneElements<SceneElement>(api, record.size > 0)
  // A shape's words are protected with it: the shape wears the one badge.
  const shown = React.useMemo(() => (record.size === 0 ? [] : all.filter((e) => record.has(e.id) && !e.isDeleted && !e.containerId)), [all, record])
  const view = useBoardView(api, shown.length > 0)
  if (!view || shown.length === 0) return null
  return (
    <div aria-hidden="true" data-protected-badges="" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {shown.map((e) => {
        const at = sceneToLocal(view, e.x, e.y)
        const width = e.width * view.zoom
        const height = e.height * view.zoom
        if (!boxInView(view, at.left, at.top, at.left + width, at.top + height)) return null
        const angle = typeof e.angle === "number" ? e.angle : 0
        const named = protectedBy([e.id], record)
        return (
          // The object's own box, turned as it is, so the badge keeps to its corner however it's turned.
          <div key={e.id} data-protected-of={e.id} className="absolute" style={{ left: at.left, top: at.top, width, height, transform: angle ? `rotate(${angle}rad)` : undefined }}>
            <span
              data-protected-badge=""
              data-tip={named}
              className="pointer-fine:pointer-events-auto absolute flex items-center justify-center rounded-md bg-pop text-ink-2 shadow-e1 ring-1 ring-line [&_svg]:size-3"
              style={{ width: BADGE, height: BADGE, right: -OUT, top: -OUT }}
            >
              <Lock />
            </span>
          </div>
        )
      })}
    </div>
  )
}
