/**
 * A board's frame shown as a slide: zoomed in or out until it covers most of
 * the room the canvas leaves free, and centred there, as Meet shows a
 * presented slide and Miro's presentation mode shows a frame (Slides control
 * on a call's stage, components/livekit/stageSlides). Excalidraw's
 * fitToContent only zooms out, so a frame smaller than the canvas stays at
 * 100%, and its fitToViewport floors the zoom to tenths, which can leave a
 * slide a tenth short: the zoom is worked out here and pinned.
 * Loaded with the stage's slides, so no route's first load carries it.
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { CONTAINER, PHONE_FOOTER, TOOL_ROW, ZOOM_CLUSTER } from "./excalidrawPart"

/** How much of the free room a slide covers on the axis that binds: a little of the stage shows round it. */
export const SLIDE_COVER = 0.92

/** Room to keep clear at each edge of a board's canvas, in CSS px from that edge (Excalidraw's canvasOffsets). */
export interface CanvasInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * What's drawn over the canvas inside `host`, at its top and at its foot:
 * Excalidraw's tool row, its phone footer and its zoom cluster (the one
 * registry, ./excalidrawPart), and whatever `over` matches (a caller's own
 * bar on the board), each taken off the edge it sits nearer. Measured from
 * the canvas, which needn't start at the top of `host`. A part that isn't
 * drawn takes nothing, and one outside the canvas (a phone's row of pills
 * above it) reaches no further than its edge, so it takes nothing either.
 * Nothing is taken at the sides, where a slide keeps its own margin.
 */
export function canvasInsets(host: Element | null | undefined, over?: string): CanvasInsets {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 }
  const canvas = host?.querySelector(CONTAINER)?.getBoundingClientRect()
  if (!host || !canvas || canvas.height === 0) return insets
  for (const part of host.querySelectorAll([TOOL_ROW, PHONE_FOOTER, ZOOM_CLUSTER, over].filter(Boolean).join(", "))) {
    const r = part.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.top + r.height / 2 < canvas.top + canvas.height / 2) insets.top = Math.max(insets.top, r.bottom - canvas.top)
    else insets.bottom = Math.max(insets.bottom, canvas.bottom - r.top)
  }
  return insets
}

/** What showing a frame uses of Excalidraw's API (a test passes a stand-in). */
export type FrameCamera = Pick<ExcalidrawImperativeAPI, "getSceneElements" | "getAppState" | "scrollToContent">

/**
 * Puts the camera on the frame `id` as a slide, in the room `insets` leave
 * free; false while the frame isn't on the scene. A canvas with no free room
 * (not laid out yet) gets Excalidraw's own fit, which only zooms out.
 */
export function presentFrame(api: FrameCamera, id: string, insets: CanvasInsets, animate: boolean): boolean {
  const frame = api.getSceneElements().find((e) => e.id === id)
  if (!frame) return false
  const { width, height } = api.getAppState()
  const zoom = Math.min((width - insets.left - insets.right) / frame.width, (height - insets.top - insets.bottom) / frame.height) * SLIDE_COVER
  if (Number.isFinite(zoom) && zoom > 0) {
    api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: SLIDE_COVER, canvasOffsets: insets, minZoom: zoom, maxZoom: zoom, animate })
  } else {
    api.scrollToContent(frame, { fitToContent: true, animate })
  }
  return true
}

/** What a person does on the canvas to move its camera their way: a pointer or a finger, the wheel, a key. */
const TAKES_THE_CAMERA = ["pointerdown", "wheel", "keydown"] as const
/** How many frames a change of room waits for Excalidraw to take the canvas's new size. */
const SIZE_TAKEN_WITHIN = 30

/** A frame held on screen as a slide (holdFrame). */
export interface FrameHold {
  /** Shows the frame `id` as a slide (presentFrame) and holds it there; false while it isn't on the scene. */
  show(id: string, animate: boolean): boolean
  /** Lets the camera go: a change of room no longer moves it. */
  drop(): void
  /** Stops watching the room and the canvas. */
  stop(): void
}

/**
 * Holds a frame shown as a slide in the room the canvas inside `host` leaves
 * free, while that room changes, as Meet and Zoom keep a presented slide
 * fitted to the stage: a row above the board wraps, a phone turns, a panel
 * opens beside it, or what's drawn over the canvas (`over` and Excalidraw's
 * parts, as canvasInsets) grows. Each change shows the frame again, at once,
 * in the room then free. A person who moves the camera on the canvas (a
 * pointer or a finger, the wheel, a key) keeps it until a frame is shown
 * again. Excalidraw takes a canvas's new size in an update of its own and
 * fits a frame in the size it has, so a change waits for that, a few frames
 * at most. Without a host it shows frames and holds nothing.
 */
export function holdFrame(api: FrameCamera, host: Element | null | undefined, over?: string): FrameHold {
  const canvas = host?.querySelector(CONTAINER) ?? null
  const parts = [CONTAINER, TOOL_ROW, PHONE_FOOTER, ZOOM_CLUSTER, over].filter(Boolean).join(", ")
  // The frame held while the camera is still where it was put, the room it was shown in last, and the frame asked for.
  let held: string | null = null
  let room = ""
  let pending = 0
  const roomOf = (insets: CanvasInsets) => {
    const { width, height } = api.getAppState()
    return [width, height, insets.top, insets.right, insets.bottom, insets.left].join(" ")
  }
  const put = (id: string, animate: boolean) => {
    const insets = canvasInsets(host, over)
    if (!presentFrame(api, id, insets, animate)) return false
    room = roomOf(insets)
    return true
  }
  const watch = canvas && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => soon()) : null
  if (canvas) watch?.observe(canvas)
  function look(tries: number) {
    pending = 0
    const box = held ? canvas?.getBoundingClientRect() : null
    if (!held || !box) return
    const { width, height } = api.getAppState()
    if (Math.abs(box.width - width) > 1 || Math.abs(box.height - height) > 1) {
      if (tries > 0) pending = requestAnimationFrame(() => look(tries - 1))
      return
    }
    // A part drawn since (a phone's footer, the caller's bar) is watched from now on.
    if (watch && host) for (const part of host.querySelectorAll(parts)) watch.observe(part)
    if (roomOf(canvasInsets(host, over)) !== room) put(held, false)
  }
  function soon() {
    if (held && canvas && !pending) pending = requestAnimationFrame(() => look(SIZE_TAKEN_WITHIN))
  }
  const moved = () => {
    held = null
  }
  for (const type of TAKES_THE_CAMERA) canvas?.addEventListener(type, moved, { capture: true, passive: true })
  return {
    show(id, animate) {
      if (!put(id, animate)) return false
      held = id
      // The canvas may have taken a size Excalidraw hasn't yet: look again once it has.
      soon()
      return true
    },
    drop() {
      held = null
    },
    stop() {
      held = null
      cancelAnimationFrame(pending)
      watch?.disconnect()
      for (const type of TAKES_THE_CAMERA) canvas?.removeEventListener(type, moved, { capture: true })
    },
  }
}
