"use client"

/**
 * A share link's guest's React button (miro-24 W3-B2): the board's own (components/board/boardReact), so a guest reacts
 * and raises a hand as a member does. On a computer it closes Excalidraw's zoom cluster at the canvas's foot, as a
 * member's map does (components/board/boardMap), so the zoom keeps its room: a cluster of its own there covered the
 * zoom-in (DB-82, W3-B2 F1). A phone's Excalidraw draws no zoom at the foot, so there it is a cluster of the board's
 * chrome of its own. What it does is the guest board's presence control (components/guest/GuestBoardViewer). Its own
 * chunk, drawn after the board; `host` is the guest board's own element.
 */
import { createPortal } from "react-dom"
import { ChromeCluster } from "@/components/board/boardChrome"
import BoardReact from "@/components/board/boardReact"
import { CONTAINER, PHONE_UI, ZOOM_CLUSTER, useExcalidrawPart } from "@/components/board/excalidrawPart"

export default function GuestReact({ hereKey, host }: { hereKey: string; host: HTMLElement | null }) {
  const zoom = useExcalidrawPart(host, ZOOM_CLUSTER)
  const board = useExcalidrawPart(host, CONTAINER)
  if (zoom) return createPortal(<BoardReact hereKey={hereKey} />, zoom)
  // Until Excalidraw has drawn its UI there is nothing to join, and a computer's would be drawn twice.
  if (!board?.classList.contains(PHONE_UI)) return null
  return (
    <ChromeCluster label="React" className="absolute bottom-3 right-3 z-30">
      <BoardReact hereKey={hereKey} />
    </ChromeCluster>
  )
}
