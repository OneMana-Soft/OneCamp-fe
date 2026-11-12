"use client"

// What the board's drawing tools do on the canvas (miro-10; ./drawingTools has the button and the key): the
// highlighter's ink while it is in hand, and the pen's held stroke made the shape it looks like. A piece of its own,
// loaded with the first use of the pen or the highlighter.
import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { changeElements, loadConvert, type SceneElement } from "@/components/board/boardOps"
import { CONTAINER } from "@/components/board/excalidrawPart"
import { CAPTURE } from "@/lib/board/binding"
import { NOTE_COLOURS, STYLE_ROUGHNESS, type BoardStyle } from "@/lib/board/notes"
import { heldStill, recognizeStroke, shapeSkeleton, type Sample } from "@/lib/board/strokeShape"

/**
 * The highlighter's ink, as the canvas's settings for what is drawn next: a gold of the board's palette (a cream
 * note's edge), six times a thin pen's width, and see-through, so words and shapes under it stay readable. A dark
 * board turns it as it turns every colour on the canvas. The stroke is an ordinary freehand one: it syncs, exports
 * and undoes as the pen's does, and Excalidraw's colour swatches still change it.
 */
export const HIGHLIGHT = { currentItemStrokeColor: NOTE_COLOURS.cream.edge, currentItemStrokeWidth: 6, currentItemOpacity: 45 } as const

/**
 * The highlighter's one pressure, for every point of its stroke (DB-137 F2): an even marker, as wide at its ends as in
 * its middle. Not a mouse's 0.5, which Excalidraw takes for "no pressure" and draws tapering with speed (and a mouse
 * lifts at 0); a finger's force would vary it.
 */
export const EVEN_PRESSURE = 0.51
/** A highlighter stroke's event, as Excalidraw reads it after this window's capture: at the marker's one pressure. */
const even = (e: PointerEvent) => void Object.defineProperty(e, "pressure", { value: EVEN_PRESSURE })

type Api = Pick<ExcalidrawImperativeAPI, "getAppState" | "getSceneElementsIncludingDeleted" | "updateScene" | "setActiveTool" | "onChange">
type Stroke = SceneElement & { points?: readonly (readonly [number, number])[]; strokeColor?: string; strokeWidth?: number; opacity?: number }

/** Swaps a finished stroke for the shape it looks like, if it looks like one, as one undo step of its own. */
async function toShape(api: Api, id: string, style: BoardStyle): Promise<void> {
  const find = () => (api.getSceneElementsIncludingDeleted() as unknown as Stroke[]).find((e) => e.id === id && !e.isDeleted && e.type === "freedraw")
  const stroke = find()
  if (!stroke?.points) return
  const shape = recognizeStroke(stroke.points.map(([x, y]) => ({ x: stroke.x + x, y: stroke.y + y })))
  if (!shape) return
  const convert = await loadConvert()
  // Undone or rubbed out in the wait: nothing to swap.
  if (!find()) return
  const ink = {
    strokeColor: stroke.strokeColor ?? "#1e1e1e",
    strokeWidth: stroke.strokeWidth ?? 2,
    opacity: stroke.opacity ?? 100,
    roughness: STYLE_ROUGHNESS[style],
    round: (api.getAppState() as { currentItemRoundness?: string }).currentItemRoundness !== "sharp",
    frameId: stroke.frameId ?? null,
  }
  const [made] = convert([shapeSkeleton(shape, ink)] as never) as unknown as SceneElement[]
  changeElements(api, (el) => (el.id === id ? { isDeleted: true } : null), { add: [made] })
}

export default function DrawingWatch({ api, armed, onDisarm, style }: { api: Api; armed: boolean; onDisarm: () => void; style: BoardStyle }) {
  // The highlighter in hand: the pen, in the marker's ink; put down, the pen's own ink again.
  React.useEffect(() => {
    if (!armed) return
    const s = api.getAppState()
    const pen = { currentItemStrokeColor: s.currentItemStrokeColor, currentItemStrokeWidth: s.currentItemStrokeWidth, currentItemOpacity: s.currentItemOpacity }
    api.setActiveTool({ type: "freedraw" })
    api.updateScene({ appState: HIGHLIGHT as never, captureUpdate: CAPTURE.NEVER })
    // Another tool picked puts the highlighter down, once the pen has been seen in hand (the pick above lands a render later).
    let inHand = api.getAppState().activeTool.type === "freedraw"
    const stop = api.onChange((_elements, state) => {
      if (state.activeTool.type === "freedraw") inHand = true
      else if (inHand) onDisarm()
    })
    return () => {
      stop()
      api.updateScene({ appState: pen as never, captureUpdate: CAPTURE.NEVER })
    }
  }, [armed, api, onDisarm])

  // The pen's strokes: where the pen was and when, and at the lift whether it had come to rest.
  const latest = React.useRef({ armed, style })
  latest.current = { armed, style }
  React.useEffect(() => {
    let stroke: { pointer: number; id: string | null; samples: Sample[] } | null = null
    const down = (e: PointerEvent) => {
      // A second finger makes it a pinch, not a stroke.
      if (stroke) return void (stroke = null)
      if (e.button > 0 || !(e.target instanceof HTMLCanvasElement) || !e.target.closest(CONTAINER)) return
      if (api.getAppState().activeTool.type !== "freedraw") return
      stroke = { pointer: e.pointerId, id: null, samples: [{ t: Date.now(), x: e.clientX, y: e.clientY }] }
      if (latest.current.armed) even(e)
    }
    const move = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointer) return
      if (latest.current.armed) even(e)
      stroke.samples.push({ t: Date.now(), x: e.clientX, y: e.clientY })
      stroke.id ??= (api.getAppState() as unknown as { newElement: { id: string } | null }).newElement?.id ?? null
    }
    const up = (e: PointerEvent) => {
      const s = stroke
      if (!s || e.pointerId !== s.pointer) return
      stroke = null
      if (latest.current.armed) even(e)
      // A highlighter's stroke is a mark, never a shape; a quick stroke stays ink.
      if (latest.current.armed || !s.id || !heldStill(s.samples, Date.now())) return
      const id = s.id
      // After Excalidraw has taken the lift and kept the stroke as an undo step of its own, so undo gives it back.
      setTimeout(() => void toShape(api, id, latest.current.style), 0)
    }
    const cancel = () => void (stroke = null)
    window.addEventListener("pointerdown", down, true)
    window.addEventListener("pointermove", move, true)
    window.addEventListener("pointerup", up, true)
    window.addEventListener("pointercancel", cancel, true)
    return () => {
      window.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", up, true)
      window.removeEventListener("pointercancel", cancel, true)
    }
  }, [api])
  return null
}
