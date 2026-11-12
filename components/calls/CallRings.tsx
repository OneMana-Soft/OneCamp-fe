"use client"

// The one ring host (slack-06 H2), in the realtime engine's chunk: it hears
// each MESSAGE_CALL_RING the MQTT handler passes on (CALL_RING_EVENT), keeps
// the rings (lib/calls/ring), plays the tone, and acts for the card: Accept
// through the call's own door, Decline for this person alone. The card's code
// (RingCard) loads only when a ring arrives.

import { Component, useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import { ChatFace } from "@/components/message/chatFace"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { selectPanes, useOpenBeside } from "@/hooks/useOpenBeside"
import { usePhone } from "@/hooks/usePhone"
import { toast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { huddleCallOf } from "@/lib/calls/huddleCall"
import { accepted, withdrawAccepted } from "@/lib/calls/accepting"
import { useLiveCall } from "@/lib/calls/useLiveCall"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { paneFromHref } from "@/lib/split"
import { closeSplit } from "@/store/slice/splitActions"
import { GetEndpointUrl } from "@/services/endPoints"
import { chimeTimes, playChime } from "@/lib/calls/ringTone"
import {
  CALL_RING_EVENT,
  NO_RINGS,
  callOnScreen,
  mayTakeFocus,
  readRingMessage,
  ringDoor,
  ringRefusal,
  ringsReduce,
  sessionYouAreIn,
  type Ring,
  type RingGroup,
  type RingPerson,
} from "@/lib/calls/ring"
import type { RingCardProps } from "@/components/calls/RingCard"
import type { RawUserDMInterface } from "@/types/user"

const card = lazyPart<RingCardProps>(() => import("@/components/calls/RingCard").then((m) => m.default))

/** How long Accept waits for its call's door to take its join before the card says it couldn't join. */
const JOIN_WAIT_MS = 15_000

const face = (who: RingPerson, size: number, className: string) => <ChatFace name={who.name} profileKey={who.profile} userUUID={who.uuid} size={size} className={className} />

/** A group call's group: its name and size, from the read its call page makes too. */
function useGroup(ring: Ring | undefined): [string, RingGroup | undefined] {
  const id = ring?.resource.kind === "group" ? ring.resource.uuid : ""
  const read = useFetchOnlyOnce<RawUserDMInterface>(id ? `${GetEndpointUrl.GetDmGroupParticipants}/${id}` : "")
  const g = read.data?.data
  return [id, g ? { name: g.dm_name, people: g.dm_participants?.length || undefined } : undefined]
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Keeps the ring host's failure to itself: a ring that can't be drawn must
 * never take the realtime engine, and every live update with it, down.
 */
export class RingsContained extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error("The call ring host failed", error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function CallRings({ self }: { self?: string }) {
  const [state, dispatchRing] = useReducer(ringsReduce, NO_RINGS)
  const [joining, setJoining] = useState<RingCardProps["joining"]>({})
  const focusOf = useRef(new Map<string, boolean>())
  const doorOf = useRef(new Map<string, string>())
  const phone = usePhone()
  const router = useRouter()
  const dispatch = useDispatch()
  const openBeside = useOpenBeside()

  // The call you are in, from the read its page or pane already makes.
  const panes = useSelector(selectPanes)
  const onScreen = callOnScreen(usePathname() ?? "", panes)
  const read = useLiveCall(onScreen ? (huddleCallOf(onScreen.at, self)?.ref ?? null) : null)
  const inCall = sessionYouAreIn(read, self)
  const inCallRef = useRef(inCall)
  inCallRef.current = inCall

  useEffect(() => {
    const onRing = (e: Event) => {
      const msg = readRingMessage((e as CustomEvent).detail)
      if (!msg) return
      // As it arrives: whether nobody is typing and no dialog is open.
      if (msg.state === "ring" && !focusOf.current.has(msg.session)) focusOf.current.set(msg.session, !inCallRef.current && mayTakeFocus(document))
      dispatchRing({ type: "message", msg, now: Date.now(), inCall: inCallRef.current })
    }
    window.addEventListener(CALL_RING_EVENT, onRing)
    return () => window.removeEventListener(CALL_RING_EVENT, onRing)
  }, [])

  // A ring for the call you're now in (its stop was lost) goes too.
  const rings = state.rings.filter((r) => r.session !== inCall)
  const newest = rings[0]

  // Each ring stops by itself at its end (the client's clock).
  const next = rings.length ? Math.min(...rings.map((r) => r.until)) : 0
  useEffect(() => {
    if (!next) return
    const t = setTimeout(() => dispatchRing({ type: "tick", now: Date.now() }), Math.max(0, next - Date.now()))
    return () => clearTimeout(t)
  }, [next])

  // The tone: the newest ring's, never when quiet, once while in a call or
  // with reduced motion; it stops with the card.
  const toneOf = newest && !newest.quiet ? newest : undefined
  const calling = !!inCall
  useEffect(() => {
    if (!toneOf) return
    const times = chimeTimes({ now: Date.now(), until: toneOf.until, quiet: false, inCall: calling, reduced: reducedMotion() })
    const timers = times.map((at) => setTimeout(playChime, at))
    return () => timers.forEach(clearTimeout)
  }, [toneOf, calling])

  // Accept's join: once its door takes it, the card says Joining… until the
  // join is over, then goes (the door's prejoin says how it went). A join no
  // door took is the card's to say, and is taken back, so a call opened later
  // never joins by itself.
  useEffect(() => {
    const waiting = Object.keys(joining).filter((s) => joining[s] === "pending")
    if (!waiting.length) return
    const t = setTimeout(() => {
      const lost = waiting.filter((s) => withdrawAccepted(doorOf.current.get(s) || "-"))
      if (lost.length) setJoining((j) => ({ ...j, ...Object.fromEntries(lost.map((s) => [s, "failed" as const])) }))
    }, JOIN_WAIT_MS)
    return () => clearTimeout(t)
  }, [joining])

  const onAccept = useCallback(
    (ring: Ring) => {
      const door = ringDoor(ring, self)
      if (!door) return
      setJoining((j) => ({ ...j, [ring.session]: "pending" }))
      doorOf.current.set(ring.session, door)
      accepted(door, () => {
        dispatchRing({ type: "hide", session: ring.session })
        setJoining((j) => ({ ...j, [ring.session]: undefined }))
      })
      // Leave and join: the call beside closes; a call page is left by going.
      if (inCall && onScreen && onScreen.pane >= 0) dispatch(closeSplit(onScreen.pane))
      const pane = paneFromHref(door)
      if (inCall && onScreen?.pane === -1) router.push(door)
      else if (!pane || !openBeside(pane)) router.push(door)
    },
    [self, inCall, onScreen, dispatch, router, openBeside],
  )

  const onDecline = useCallback((ring: Ring) => {
    dispatchRing({ type: "hide", session: ring.session })
    axiosInstance.post(`/calls/${encodeURIComponent(ring.session)}/decline`, {}, OWN_ERRORS).catch((err: { response?: { status?: number; data?: { code?: string } } }) => {
      // Best effort: a lost decline says nothing (the caller sees "didn't answer").
      const said = ringRefusal(err?.response?.status, err?.response?.data?.code)
      if (said) toast({ title: said, tone: "info" })
    })
  }, [])

  const onHide = useCallback((ring: Ring) => dispatchRing({ type: "hide", session: ring.session }), [])

  const [g0, group0] = useGroup(rings[0])
  const [g1, group1] = useGroup(rings[1])
  if (!newest) return null
  const groups: RingCardProps["groups"] = { [g0]: group0, [g1]: group1 }
  return (
    <card.Part
      rings={rings}
      inCall={!!inCall}
      phone={phone}
      groups={groups}
      joining={joining}
      focus={focusOf.current.get(newest.session) ?? false}
      face={face}
      onAccept={onAccept}
      onDecline={onDecline}
      onHide={onHide}
    />
  )
}
