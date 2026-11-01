"use client"

// Annotation on Call Signals (meet-14, zoom-03; ROWS head S3): the call's ink,
// sent and read on the call's own topic (lib/calls/signals), and its layer
// over a shared screen on the stage. lib/calls/ink says what a packet may
// carry and what it does; this file moves the packets and draws the strokes.
// Nothing is kept: like every call signal until Call State (#29), ink lives
// in the call's screens only, and someone who joins mid-share gets each
// author's strokes from that author.

import * as React from "react"
import { RoomEvent, Track, type DataPacket_Kind, type Participant, type RemoteParticipant, type Room, type TrackPublication } from "livekit-client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Flashlight, Pencil, SquarePen, Trash2, Undo2, X } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { heldFor, partOf, runsCall } from "@/lib/calls/control"
import { onEscape } from "@/lib/keys/onEscape"
import { useClaimTouches } from "@/hooks/useClaimTouches"
import {
  INK_STROKE_MAX,
  LASER_MS,
  NO_INK,
  inkChunks,
  inkPath,
  inkReduce,
  mayClearAll as mayClearAllOf,
  readInk,
  shareOwner,
  toFrame,
  type InkEvent,
  type InkRules,
  type InkState,
  type InkStroke,
  type InkTool,
} from "@/lib/calls/ink"
import { CALL_SIGNAL_TOPIC, encodeSignal, readCallSignal } from "@/lib/calls/signals"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { cn } from "@/lib/utils/helpers/cn"
import { heldReason } from "./callHolds"
import { CALL_PEOPLE_EVENTS, callHueOf, callHues, roomPeople } from "./callHues"
import { readCallMetadata } from "./callState"
import { DockButton } from "./DockButton"

/**
 * The call's ink, and what you may do with it: one object for the call's
 * life, so ink never draws the call again. Each share's layer reads its own
 * strokes from it, and draws again only when they change (ShareInk).
 */
export interface CallInk {
  /** The strokes on a share now: the same array until they change. */
  strokes: (share: string) => readonly InkStroke[]
  /** Calls `fn` when the strokes on `share` change, and when the call's room, roles or holds do; gives back the unsubscribe. */
  subscribe: (share: string, fn: () => void) => () => void
  /** Your identity. */
  me: () => string
  /** Why you can't draw now (the call holds sharing for you), or null. */
  heldWhy: () => string | null
  /** Whether you may clear everyone's ink on a share: it's yours, or you run the call. */
  mayClearAll: (share: string) => boolean
  /**
   * The hue of whoever drew a stroke: their colour in the call (callHues), their speaking ring's. The same function
   * until who is in the call, or what they're called, changes: a layer reads it as it reads its strokes.
   */
  hues: () => (identity: string) => CampHue
  begin: (share: string, tool: InkTool, point: [number, number]) => void
  extend: (point: [number, number]) => void
  /** Ends the stroke being drawn; given a share, only a stroke on that share. */
  end: (share?: string) => void
  undo: (share: string) => void
  clear: (share: string, whose: "mine" | "all") => void
}

export const CallInkContext = React.createContext<CallInk | null>(null)

/** How often a stroke being drawn goes out: often enough to watch it drawn. */
const SEND_MS = 50
/** A move closer than this to the last point adds nothing (a step is under half a pixel on a 1920 frame). */
const MIN_STEP = 3
/** A share with no strokes: always this one array, so its layer sees nothing change. */
const NO_STROKES: readonly InkStroke[] = []
const NO_SHEET: ReadonlyMap<string, CampHue> = new Map()
const NO_HUES = (identity: string) => callHueOf(NO_SHEET, identity)

type Drawing = { share: string; id: string; tool: InkTool; points: number[]; sent: number }

const strokeId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6)

/** The rules every packet is read under, from the room as it is now: the server sets the roles and the holds. */
function inkRules(room: Room): InkRules {
  const held = readCallMetadata(room.metadata).held
  const part = (identity: string) => partOf(room.getParticipantByIdentity(identity)?.attributes)
  return { held: (identity) => heldFor(held, part(identity)).has("share"), runs: (identity) => runsCall(part(identity).role) }
}

/**
 * The call's ink in one store, outside React (CODE-REVIEWER-126): what every
 * screen in the call drew, the stroke you're drawing, and the room's packets.
 * A drawn point or a packet tells only the layers of the share it falls on;
 * each packet came every 50 ms per person drawing, and drew the whole call.
 */
function inkStore() {
  let room: Room | undefined
  let state: InkState = NO_INK
  let drawing: Drawing | null = null
  let sender: number | undefined
  const fades = new Set<number>()
  const listeners = new Map<string, Set<() => void>>()
  // Each person's colour in the call (callHues), worked out once for who is in it: every stroke reads it at every draw.
  let hues: ((identity: string) => CampHue) | undefined
  const huesNow = () => {
    if (!hues) {
      const sheet = callHues(roomPeople(room))
      hues = (identity) => callHueOf(sheet, identity, room?.getParticipantByIdentity(identity)?.name)
    }
    return hues
  }

  /** Tells the layers of one share, or of every share. */
  const tell = (share?: string) => {
    for (const [at, fns] of listeners) if (share === undefined || at === share) for (const fn of [...fns]) fn()
  }
  const me = () => room?.localParticipant.identity ?? ""
  const apply = (e: InkEvent) => {
    if (!room) return
    const next = inkReduce(state, e, inkRules(room))
    if (next === state) return
    state = next
    tell(e.share)
  }
  const fadeLater = (share: string, id: string, by: string) => {
    const t = window.setTimeout(() => {
      fades.delete(t)
      apply({ kind: "ink-fade", share, id, by })
    }, LASER_MS)
    fades.add(t)
  }
  const publish = (kind: string, payload: unknown, to?: string[]) => {
    const local = room?.localParticipant
    if (!local) return
    void local.publishData(encodeSignal(kind, payload), to ? { reliable: true, topic: CALL_SIGNAL_TOPIC, destinationIdentities: to } : { reliable: true, topic: CALL_SIGNAL_TOPIC }).catch(() => {})
  }
  const heldWhy = () => (room && heldFor(readCallMetadata(room.metadata).held, partOf(room.localParticipant.attributes)).has("share") ? heldReason("share") : null)
  const mayClearAll = (share: string) => !!room && mayClearAllOf(me(), share, runsCall(partOf(room.localParticipant.attributes).role))
  // What of the stroke you're drawing hasn't gone yet goes now: the rest of it, and its end.
  const flush = (end: boolean) => {
    const d = drawing
    if (!d) return
    for (const packet of inkChunks(d.share, { id: d.id, tool: d.tool, points: d.points, done: end }, d.sent)) publish("ink", packet)
    d.sent = d.points.length / 2
  }
  // Yours draws here as you draw it: LiveKit never hands a packet back to its sender.
  const drawHere = (d: Drawing, end: boolean) => apply({ kind: "ink", share: d.share, id: d.id, tool: d.tool, at: 0, p: d.points.slice(), end, by: me() })

  const ink: CallInk = {
    strokes: (share) => state.get(share) ?? NO_STROKES,
    subscribe(share, fn) {
      const fns = listeners.get(share) ?? new Set<() => void>()
      listeners.set(share, fns)
      fns.add(fn)
      return () => {
        fns.delete(fn)
        if (fns.size === 0 && listeners.get(share) === fns) listeners.delete(share)
      }
    },
    me,
    heldWhy,
    mayClearAll,
    hues: huesNow,
    begin(share, tool, point) {
      if (!room || heldWhy() || !point.every(Number.isFinite)) return
      window.clearInterval(sender)
      const d: Drawing = { share, id: strokeId(), tool, points: [...point], sent: 0 }
      drawing = d
      drawHere(d, false)
      sender = window.setInterval(() => flush(false), SEND_MS)
    },
    extend(point) {
      const d = drawing
      if (!d || d.points.length / 2 >= INK_STROKE_MAX || !point.every(Number.isFinite)) return
      const [x, y] = [d.points[d.points.length - 2], d.points[d.points.length - 1]]
      if (Math.abs(point[0] - x) < MIN_STEP && Math.abs(point[1] - y) < MIN_STEP) return
      d.points.push(point[0], point[1])
      drawHere(d, false)
    },
    end(share) {
      const d = drawing
      if (!d || (share !== undefined && d.share !== share)) return
      window.clearInterval(sender)
      flush(true)
      drawHere(d, true)
      drawing = null
      if (d.tool === "laser") fadeLater(d.share, d.id, me())
    },
    undo(share) {
      const last = [...(state.get(share) ?? [])].reverse().find((k) => k.by === me())
      if (!last) return
      apply({ kind: "ink-undo", share, id: last.id, by: me() })
      publish("ink-undo", { share, id: last.id })
    },
    clear(share, whose) {
      if (whose === "all" && !mayClearAll(share)) return
      apply({ kind: "ink-clear", share, whose, by: me() })
      publish("ink-clear", { share, whose })
    },
  }

  /** Reads the room's packets and people from now on, and tells every layer; gives back the hands-off. */
  const attach = (r: Room | undefined) => {
    room = r
    hues = undefined
    tell()
    if (!r) return () => {}
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
      const e = readInk(readCallSignal(payload, participant, topic))
      if (!e) return
      apply(e)
      if (e.kind === "ink" && e.end && e.tool === "laser") fadeLater(e.share, e.id, e.by)
    }
    // Someone who joins mid-share gets your strokes from you, so LiveKit names you as their author.
    const onJoin = (p: RemoteParticipant) => {
      for (const [share, strokes] of state)
        for (const k of strokes) if (k.by === me() && k.done && k.tool === "pen") for (const packet of inkChunks(share, k, 0)) publish("ink", packet, [p.identity])
    }
    const onUnpublished = (pub: TrackPublication, p: Participant) => {
      if (pub.source === Track.Source.ScreenShare) apply({ kind: "ink-gone", share: `${p.identity}|${Track.Source.ScreenShare}` })
    }
    const onLeft = (p: RemoteParticipant) => apply({ kind: "ink-gone", share: `${p.identity}|${Track.Source.ScreenShare}` })
    // Roles and holds change on the server's word: every layer reads them again.
    const onTold = () => tell()
    // Someone joining, leaving or renamed can change colours (callHues): the sheet is worked out again, and every layer draws again.
    const onPeople = () => {
      hues = undefined
      tell()
    }
    for (const e of CALL_PEOPLE_EVENTS) r.on(e, onPeople)
    r.on(RoomEvent.DataReceived, onData)
    r.on(RoomEvent.ParticipantConnected, onJoin)
    r.on(RoomEvent.TrackUnpublished, onUnpublished)
    r.on(RoomEvent.LocalTrackUnpublished, onUnpublished)
    r.on(RoomEvent.ParticipantDisconnected, onLeft)
    r.on(RoomEvent.RoomMetadataChanged, onTold)
    r.on(RoomEvent.ParticipantAttributesChanged, onTold)
    return () => {
      for (const e of CALL_PEOPLE_EVENTS) r.off(e, onPeople)
      r.off(RoomEvent.DataReceived, onData)
      r.off(RoomEvent.ParticipantConnected, onJoin)
      r.off(RoomEvent.TrackUnpublished, onUnpublished)
      r.off(RoomEvent.LocalTrackUnpublished, onUnpublished)
      r.off(RoomEvent.ParticipantDisconnected, onLeft)
      r.off(RoomEvent.RoomMetadataChanged, onTold)
      r.off(RoomEvent.ParticipantAttributesChanged, onTold)
      if (room === r) room = undefined
    }
  }
  /** Stops what's pending: the laser strokes' fades and a stroke's sending. */
  const stop = () => {
    fades.forEach((t) => window.clearTimeout(t))
    fades.clear()
    window.clearInterval(sender)
  }
  return { ink, attach, stop }
}

/** The call's ink: what every screen in it drew, and drawing of your own. The same object for the call's life. */
export function useCallInk(room: Room | undefined): CallInk {
  const [store] = React.useState(inkStore)
  React.useEffect(() => store.attach(room), [store, room])
  React.useEffect(() => store.stop, [store])
  return store.ink
}

type Frame = { w: number; h: number }
/** A share's frame before LiveKit has told its size: a 1080p screen's. */
const SCREEN_FRAME: Frame = { w: 1920, h: 1080 }

/** One stroke: the drawer's hue over a dark casing, so it reads on white slides and on dark code alike. */
const InkLine = React.memo(function InkLine({ stroke, frame, hue }: { stroke: InkStroke; frame: Frame; hue: CampHue }) {
  const d = inkPath(stroke.points, frame)
  const laser = stroke.tool === "laser"
  // A laser stroke fades from the moment it ends; with reduced motion it goes at once when its time is up.
  const [fading, setFading] = React.useState(false)
  React.useEffect(() => {
    if (!laser || !stroke.done || prefersReducedMotion()) return
    const raf = window.requestAnimationFrame(() => setFading(true))
    return () => window.cancelAnimationFrame(raf)
  }, [laser, stroke.done])
  return (
    <g
      data-ink-stroke=""
      data-by={stroke.by}
      data-hue={hue}
      data-tool={stroke.tool}
      className={HUE_CLASS[hue]}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={laser ? { opacity: fading ? 0 : 1, transition: `opacity ${LASER_MS}ms ease-in` } : undefined}
    >
      <path d={d} stroke="rgb(11 12 14 / 0.5)" strokeWidth={laser ? 10 : 6} vectorEffect="non-scaling-stroke" />
      <path d={d} className="stroke-hue" strokeWidth={laser ? 6 : 3} vectorEffect="non-scaling-stroke" />
    </g>
  )
})

/**
 * A tile's size for the dock's control (DESIGN-BUILD-57 MUST 3): 32 px, 44 px where a finger presses it, with the
 * corners a quarter of the side as the dock's are. Over DOCK_BUTTON's size as VideoControls' recording pill is, so the
 * dock's file, which the green room's first load carries, stays as it is.
 */
const TILE_CONTROL = "size-8 @3xl:size-8 [@media(hover:none)]:size-11 [&_svg]:size-4 rounded-[8px] [@media(hover:none)]:rounded-[11px]"

/** One control on the drawing bar: the dock's own, at a tile's size, its press kept off the tile beneath it. */
function InkControl({ onPress, ...props }: Omit<React.ComponentProps<typeof DockButton>, "onClick" | "className"> & { onPress?: () => void }) {
  return (
    <DockButton
      {...props}
      className={TILE_CONTROL}
      onClick={(e) => {
        e.stopPropagation()
        onPress?.()
      }}
    />
  )
}

/**
 * The ink over a shared screen on the stage, and its toolbar: Annotate; while
 * you draw, Stop drawing set apart from Pen, Laser pointer, Undo and Clear my
 * drawings, whose place a menu takes for the sharer and whoever runs the call,
 * adding Clear all drawings. The layer's viewBox is the share's own frame,
 * fitted as the picture's object-contain fits it, so a stroke lies on the same
 * spot of the screen on every tile.
 */
export function ShareInk({ share, name, frame }: { share: string; name: string; frame?: Frame }) {
  const ink = React.useContext(CallInkContext)
  // This share's strokes, and what you may do with them: drawn again only when they change.
  const subscribe = React.useCallback((fn: () => void) => (ink ? ink.subscribe(share, fn) : () => {}), [ink, share])
  const strokes = React.useSyncExternalStore(subscribe, () => ink?.strokes(share) ?? NO_STROKES, () => NO_STROKES)
  const me = React.useSyncExternalStore(subscribe, () => ink?.me() ?? "", () => "")
  const heldWhy = React.useSyncExternalStore(subscribe, () => ink?.heldWhy() ?? null, () => null)
  const mayClearAll = React.useSyncExternalStore(subscribe, () => !!ink?.mayClearAll(share), () => false)
  const hueOf = React.useSyncExternalStore(subscribe, () => ink?.hues() ?? NO_HUES, () => NO_HUES)
  const [on, setOn] = React.useState(false)
  const [tool, setTool] = React.useState<InkTool>("pen")
  const surface = React.useRef<SVGSVGElement>(null)
  const f = frame && frame.w > 0 && frame.h > 0 ? frame : SCREEN_FRAME
  // A hold that comes while you draw puts the pen down.
  const drawing = on && !!ink && !heldWhy

  // Escape puts the pen down: the page's own state, answered through the one Escape (lib/keys/escape), so an open
  // Clear menu takes its press first and the pen stays up.
  React.useEffect(() => (drawing ? onEscape("page", () => setOn(false)) : undefined), [drawing])

  // The pen put down mid-stroke ends the stroke.
  const end = ink?.end
  React.useEffect(() => {
    if (!drawing) end?.(share)
  }, [drawing, end, share])

  // While you draw, the layer keeps a finger's touches: the browser makes no fling of a quick stroke, so the next tap
  // (Clear drawings, Stop drawing) clicks the first time (V-207). touch-none alone kept the page still, not the tap.
  useClaimTouches(surface, drawing)

  if (!ink) return null
  const yours = shareOwner(share) === me
  const at = (e: { clientX: number; clientY: number }) => toFrame({ x: e.clientX, y: e.clientY }, surface.current!.getBoundingClientRect(), f)

  return (
    // data-ink-drawing: the tile's pin steps aside while you draw (StageTile; DESIGN-BUILD-57 MUST 1).
    <div className="pointer-events-none absolute inset-0 z-[2]" data-share-ink="" data-ink-drawing={drawing ? "" : undefined}>
      <svg
        ref={surface}
        data-ink-surface=""
        aria-hidden
        viewBox={`0 0 ${f.w} ${f.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("absolute inset-0 h-full w-full", drawing ? "pointer-events-auto cursor-crosshair touch-none" : "pointer-events-none")}
        onPointerDown={(e) => {
          if (!drawing || e.button > 0) return
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          ink.begin(share, tool, at(e))
        }}
        onPointerMove={(e) => {
          if (!drawing) return
          const all = e.nativeEvent.getCoalescedEvents?.() ?? []
          for (const p of all.length > 0 ? all : [e]) ink.extend(at(p))
        }}
        onPointerUp={() => ink.end(share)}
        onPointerCancel={() => ink.end(share)}
      >
        {strokes.map((k) => (
          <InkLine key={`${k.by}:${k.id}`} stroke={k} frame={f} hue={hueOf(k.by)} />
        ))}
      </svg>
      <TooltipProvider delayDuration={300}>
        <div
          role="toolbar"
          aria-label="Drawing"
          className={cn(
            "pointer-events-auto absolute left-2 top-2 z-[3] flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1 rounded-[12px] bg-[rgb(11_12_14/0.72)] p-1 ring-1 ring-inset ring-white/[0.06] transition-opacity focus-within:opacity-100",
            drawing ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          {drawing ? (
            <>
              <InkControl label="Stop drawing" icon={<X aria-hidden />} onPress={() => setOn(false)} />
              <span role="separator" aria-orientation="vertical" className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.14]" />
              <InkControl label="Pen" state={tool === "pen" ? "active" : "on"} pressed={tool === "pen"} icon={<Pencil aria-hidden />} onPress={() => setTool("pen")} />
              <InkControl label="Laser pointer" state={tool === "laser" ? "active" : "on"} pressed={tool === "laser"} icon={<Flashlight aria-hidden />} onPress={() => setTool("laser")} />
              <InkControl label="Undo" icon={<Undo2 aria-hidden />} onPress={() => ink.undo(share)} />
              {mayClearAll ? (
                <DropdownMenu modal={false}>
                  <InkControl label="Clear drawings" icon={<Trash2 aria-hidden />} trigger={(button) => <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>} />
                  <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onSelect={() => ink.clear(share, "mine")}>Clear my drawings</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => ink.clear(share, "all")}>Clear all drawings</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <InkControl label="Clear my drawings" icon={<Trash2 aria-hidden />} onPress={() => ink.clear(share, "mine")} />
              )}
            </>
          ) : (
            <InkControl
              label={yours ? "Annotate your screen" : `Annotate ${name}'s screen`}
              icon={<SquarePen aria-hidden />}
              hint={heldWhy ?? undefined}
              aria-disabled={heldWhy ? true : undefined}
              onPress={() => {
                if (!heldWhy) setOn(true)
              }}
            />
          )}
        </div>
      </TooltipProvider>
    </div>
  )
}
