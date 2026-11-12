"use client"

// A call ringing you (slack-06 H2): one card body, in a corner card at sm and
// up (top right, on the toast layer, so it shows and is reachable over an open
// dialog) and in the shared drawer on a phone. Presentational: the ring host
// (CallRings, in the realtime engine's chunk) reads, decides and acts; this
// chunk loads only when a ring arrives, and imports no reads of its own.

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type Ref } from "react"
import { Phone } from "lucide-react"
import { BellOff, PhoneOff } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { cn } from "@/lib/utils/helpers/cn"
import { RING_ON, RingFace } from "@/components/calls/RingFace"
import { ringLine, ringSaid, type Ring, type RingGroup, type RingPerson } from "@/lib/calls/ring"

export interface RingCardProps {
  /** The rings, newest first. */
  rings: Ring[]
  /** In another call now: the quieter form, and Accept says it leaves that call. */
  inCall: boolean
  phone: boolean
  /** A group call's group, by its uuid, once read. */
  groups: Record<string, RingGroup | undefined>
  /** Accept's join, by session: under way, or it didn't happen. */
  joining: Record<string, "pending" | "failed" | undefined>
  /** Whether the newest ring may take the focus (the host asks mayTakeFocus as it arrives). */
  focus: boolean
  /** Draws a person's face at a size, with a class on its circle (the moss ring). */
  face: (who: RingPerson, size: number, className: string) => ReactNode
  onAccept: (ring: Ring) => void
  onDecline: (ring: Ring) => void
  /** Escape or a swipe down: hidden on this device, not declined (the caller sees "didn't answer"). */
  onHide: (ring: Ring) => void
}

/** At most this many cards; the rest are counted under them. */
const SHOWN = 2

const SILENT = "Silent ring: your notifications are paused or this chat is muted"

/** A 2px moss bar that drains to the ring's end (none under reduced motion: globals.css). */
function Drain({ until, className }: { until: number; className?: string }) {
  // Read once as the bar mounts: its animation runs the rest of the ring.
  const left = useRef(Math.max(0, until - Date.now())).current
  return (
    <span aria-hidden="true" className={cn("block h-0.5 w-full overflow-hidden", className)}>
      <span className="ring-drain block h-full w-full bg-camp-moss" style={{ ["--ring-left" as string]: `${left}ms` }} />
    </span>
  )
}

function Line({ ring, groups, inCall, className }: { ring: Ring; groups: RingCardProps["groups"]; inCall: boolean; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3", className)}>
      <span className="min-w-0 truncate">{ringLine(ring, groups[ring.resource.uuid], inCall)}</span>
      {ring.quiet && (
        <span aria-label={SILENT} role="img" className="inline-flex items-center gap-1 rounded-sm bg-raised px-1.5 py-px text-ink-2 [&_svg]:size-3">
          <BellOff aria-hidden="true" />
          <span aria-hidden="true">Silent</span>
        </span>
      )}
    </span>
  )
}

/** Decline (danger) and Accept (brand): shared Buttons, no new variant. */
function Actions({ ring, props, accept, className, size }: { ring: Ring; props: RingCardProps; accept?: Ref<HTMLButtonElement>; className?: string; size?: "default" | "xl" }) {
  const pending = props.joining[ring.session] === "pending"
  return (
    <div className={cn("grid w-full grid-cols-2 gap-2", className)}>
      <Button variant="destructive" size={size} disabled={pending} onClick={() => props.onDecline(ring)}>
        <PhoneOff aria-hidden="true" />
        Decline
      </Button>
      <Button ref={accept} size={size} busy={pending} onClick={() => !pending && props.onAccept(ring)}>
        <Phone aria-hidden="true" />
        {pending ? "Joining…" : props.inCall ? "Leave and join" : "Accept"}
      </Button>
    </div>
  )
}

function Failed({ ring, joining }: { ring: Ring; joining: RingCardProps["joining"] }) {
  return joining[ring.session] === "failed" ? <p className="text-meta text-danger-ink">Couldn&apos;t join. Try again.</p> : null
}

export default function RingCard(props: RingCardProps) {
  const { rings, inCall, phone, groups, focus, face, onHide } = props
  const accept = useRef<HTMLButtonElement>(null)
  const newest = rings[0]
  const loud = (r: Ring) => !r.quiet && !inCall

  // To Accept only when nobody was typing and no dialog was open as it
  // arrived, and never while in a call (you may be speaking or sharing).
  const session = newest?.session
  useEffect(() => {
    if (session && focus && !inCall && !phone) accept.current?.focus({ preventScroll: true })
  }, [session, focus, inCall, phone])

  if (!newest) return null
  const more = rings.length - (phone ? 1 : SHOWN)
  const moreLine = more > 0 ? <p className="text-meta text-ink-3">+{more} more calling</p> : null
  // Said once per ring, not on every chime.
  const live = (
    <p aria-live="assertive" className="sr-only">
      {ringSaid(newest, groups[newest.resource.uuid])}
    </p>
  )

  if (phone) {
    return (
      <Drawer open onOpenChange={(open) => !open && onHide(newest)}>
        <DrawerContent
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // The sheet keeps the focus; on Accept only when nobody was typing.
            if (!focus || inCall) return
            e.preventDefault()
            accept.current?.focus({ preventScroll: true })
          }}
          header={<DrawerTitle className="sr-only">{`Incoming call from ${newest.caller.name}`}</DrawerTitle>}
          footer={<Actions ring={newest} props={props} accept={accept} size="xl" className="pb-[env(safe-area-inset-bottom)] [&_button]:h-12" />}
        >
          <section
            role="region"
            aria-label={`Incoming call from ${newest.caller.name}`}
            data-ring-card={newest.session}
            className="flex flex-col items-center gap-2 px-4 pb-3 pt-2 text-center"
          >
            <RingFace pulse={loud(newest)} size={64}>
              {face(newest.caller, 64, RING_ON)}
            </RingFace>
            <span className="max-w-full truncate text-lg font-semibold text-ink">{newest.caller.name}</span>
            <Line ring={newest} groups={groups} inCall={inCall} className="justify-center" />
            <Drain until={newest.until} className="mt-1 max-w-48" />
            <Failed ring={newest} joining={props.joining} />
            {moreLine}
            {live}
          </section>
        </DrawerContent>
      </Drawer>
    )
  }

  const escape = (ring: Ring) => (e: KeyboardEvent) => {
    if (e.key !== "Escape") return
    e.stopPropagation()
    onHide(ring)
  }
  return (
    <div className="pointer-events-none fixed right-[calc(var(--shell-right-inset,0px)+16px)] top-4 z-[var(--z-toast)] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {rings.slice(0, SHOWN).map((ring, i) => (
        <section
          key={ring.session}
          role="region"
          aria-label={`Incoming call from ${ring.caller.name}`}
          data-ring-card={ring.session}
          // Escape hides this ring, and the press is its own (lib/keys/escapeGuard).
          data-escape-own=""
          onKeyDown={escape(ring)}
          className="hub-fade-in pointer-events-auto overflow-hidden rounded-lg bg-pop text-ui [box-shadow:var(--e4),0_8px_32px_rgb(var(--glow)/0.18)]"
        >
          <div className="flex flex-col gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <RingFace pulse={loud(ring)} size={40}>
                {face(ring.caller, 40, RING_ON)}
              </RingFace>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-ink">{ring.caller.name}</span>
                <Line ring={ring} groups={groups} inCall={inCall} />
              </span>
            </div>
            <Failed ring={ring} joining={props.joining} />
            <Actions ring={ring} props={props} accept={i === 0 ? accept : undefined} />
          </div>
          <Drain until={ring.until} />
        </section>
      ))}
      {moreLine && <div className="pointer-events-auto self-end px-1">{moreLine}</div>}
      {live}
    </div>
  )
}
