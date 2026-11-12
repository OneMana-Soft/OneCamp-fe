"use client"

// The board's drawing tools beside Excalidraw's pen (miro-10):
//
//  - Highlighter (M): the pen as a wide marker that never hides what it
//    crosses (see-through ink, in a colour of the board's palette). Its button
//    stands after the pen in Excalidraw's tool row, at a desk and on a phone.
//    The pen's own button or key, or any other tool, puts it down, and the pen
//    has its own ink back.
//  - A pen's stroke held still at its end becomes the shape it looks like (a
//    rectangle, an ellipse, a diamond, a triangle, a line or an arrow) as one
//    undo step: Ctrl+Z gives the hand's stroke back. A quick stroke stays ink.
//
// Only for someone who may draw: a viewer or a guest who may not gets neither
// (their canvas has no tool row, and nothing here listens). The button and the
// key are here, in the workbench's chunk; the watch (the marker's ink, the
// hold, the fitting) is a piece of its own that comes with the first use of
// the pen or the highlighter (./drawingWatch).
import * as React from "react"
import { createPortal } from "react-dom"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { notForTheBoard } from "@/components/board/boardKeys"
import { TOOL_ROW, useExcalidrawPart } from "@/components/board/excalidrawPart"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import type { BoardStyle } from "@/lib/board/notes"

const DrawingWatch = lazyPiece(() => import("./drawingWatch"))

/** Excalidraw's pen in its tool row (0.18), and the keys that pick it. */
const PEN_TOOL = '[data-testid="toolbar-freedraw"]'
const PEN_KEYS = new Set(["p", "P", "x", "X", "7"])
/** A shipped utility (!important) over Excalidraw's own lit ground. */
const UNLIT = "!bg-transparent"

/** A place of ours in Excalidraw's tool row, straight after its pen: there while the row is, made again when the row is. */
function usePenSlot(host: HTMLElement | null): HTMLElement | null {
  const row = useExcalidrawPart(host, TOOL_ROW)
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)
  React.useLayoutEffect(() => {
    const pen = row?.querySelector(PEN_TOOL)?.closest("label")
    if (!pen) return setSlot(null)
    const el = document.createElement("span")
    el.style.display = "contents"
    el.setAttribute("data-highlighter-slot", "")
    pen.after(el)
    setSlot(el)
    return () => el.remove()
  }, [row])
  return slot
}

export default function DrawingTools({ api, host, editable, style }: { api: ExcalidrawImperativeAPI; host: HTMLElement | null; editable: boolean; style: BoardStyle }) {
  const slot = usePenSlot(editable ? host : null)
  const [armed, setArmed] = React.useState(false)
  // The watch comes with the first use of the pen or the highlighter, and stays.
  const [used, setUsed] = React.useState(false)
  React.useEffect(() => {
    if (!editable || used) return
    if (armed) return setUsed(true)
    return api.onChange((_elements, state) => {
      if (state.activeTool.type === "freedraw") setUsed(true)
    })
  }, [api, editable, used, armed])

  // M picks the highlighter up and puts it down; the pen's own keys put it down for the pen.
  React.useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || notForTheBoard(e)) return
      if (PEN_KEYS.has(e.key)) return setArmed(false)
      if (e.key !== "m" && e.key !== "M") return
      e.preventDefault()
      setArmed((a) => !a)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [editable])

  // Under the highlighter only the highlighter is lit (DB-137 F1), though the pen is Excalidraw's tool in hand: the
  // pen's input is read as Excalidraw's checkbox, which the board's lit ground and dot (excalidrawTheme.css, radios
  // only) pass over, and Excalidraw's own lit ground is taken off its icon by a class the app already ships: no new
  // CSS. Excalidraw keeps the classes it rendered unless it renders others. A press on the pen's button: the pen again.
  React.useEffect(() => {
    const pen = armed ? slot?.previousElementSibling : null
    if (!pen) return
    const input = pen.querySelector(PEN_TOOL)
    const icon = pen.querySelector(".ToolIcon__icon")
    input?.classList.replace("ToolIcon_type_radio", "ToolIcon_type_checkbox")
    icon?.classList.add(UNLIT)
    const put = () => setArmed(false)
    pen.addEventListener("click", put)
    return () => {
      pen.removeEventListener("click", put)
      input?.classList.replace("ToolIcon_type_checkbox", "ToolIcon_type_radio")
      icon?.classList.remove(UNLIT)
    }
  }, [armed, slot])

  const disarm = React.useCallback(() => setArmed(false), [])
  if (!editable) return null
  return (
    <>
      {slot &&
        createPortal(
          // Excalidraw's own tool markup, so the row's look, sizes and lit state are its tools' (excalidrawTheme.css).
          <label className="ToolIcon Shape" title="Highlighter (M)">
            <input
              type="checkbox"
              className="ToolIcon_type_radio ToolIcon_size_medium"
              aria-label="Highlighter"
              aria-keyshortcuts="M"
              data-highlighter-tool=""
              checked={armed}
              onChange={(e) => setArmed(e.target.checked)}
            />
            <div className="ToolIcon__icon">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 11-6 6v3h9l3-3" />
                <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
              </svg>
            </div>
          </label>,
          slot,
        )}
      {used && (
        <React.Suspense fallback={null}>
          <DrawingWatch api={api} armed={armed} onDisarm={disarm} style={style} />
        </React.Suspense>
      )}
    </>
  )
}
