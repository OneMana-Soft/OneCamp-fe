"use client"

// The call's changes said to a screen reader (calls meet-18, D-CL-11 and
// D-CL-13), once each, through the app's one polite live region
// (lib/ui/announce), the call's only voice: joins and leaves gathered over two
// seconds, and knocks too, said in the knock bar's words for everyone waiting
// then; hands going up with their place in line (yours too) and coming down;
// and recording or captions stopping (their starts are said by their own
// pills). A queue leaves 1.5 s between sentences, so one never cuts another
// off.

import { useEffect, useRef } from "react"
import { announce } from "@/lib/ui/announce"
import { handAnnouncement, placeIn } from "@/lib/calls/hands"
import { peopleChange } from "@/lib/calls/announcements"
import { knockNotice } from "@/lib/calls/lobby"

export interface AnnouncedCall {
  people: readonly { identity: string; name: string; you: boolean; hand: number | null }[]
  knocks: readonly { ticket: string; name: string }[]
  recording: boolean
  captions: boolean
}

const GATHER_MS = 2_000
const GAP_MS = 1_500

export function useCallAnnouncements(call: AnnouncedCall) {
  const queue = useRef<string[]>([])
  const draining = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seen = useRef<AnnouncedCall | null>(null)
  const pending = useRef<{ joined: string[]; left: string[]; knocked: string[] }>({ joined: [], left: [], knocked: [] })
  const gathering = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const drain = () => {
      const next = queue.current.shift()
      if (next === undefined) {
        draining.current = null
        return
      }
      announce(next)
      draining.current = setTimeout(drain, GAP_MS)
    }
    const say = (text: string) => {
      queue.current.push(text)
      if (!draining.current) drain()
    }
    const flush = () => {
      gathering.current = null
      const p = pending.current
      if (p.joined.length) say(peopleChange(p.joined, "joined"))
      if (p.left.length) say(peopleChange(p.left, "left"))
      // Only while someone who knocked in the moment still waits: one let in
      // at once is said as a join.
      const waiting = seen.current?.knocks ?? []
      const notice = knockNotice(waiting)
      if (notice && waiting.some((k) => p.knocked.includes(k.ticket))) say(notice.title)
      pending.current = { joined: [], left: [], knocked: [] }
    }
    const gather = () => {
      if (!gathering.current) gathering.current = setTimeout(flush, GATHER_MS)
    }

    const before = seen.current
    seen.current = call
    // The call as it was when this person came in is nobody's news.
    if (!before) return
    const had = new Map(before.people.map((p) => [p.identity, p]))
    const has = new Set(call.people.map((p) => p.identity))
    for (const p of call.people) if (!had.has(p.identity) && !p.you) pending.current.joined.push(p.name)
    for (const p of before.people) if (!has.has(p.identity) && !p.you) pending.current.left.push(p.name)
    const knew = new Set(before.knocks.map((k) => k.ticket))
    for (const k of call.knocks) if (!knew.has(k.ticket)) pending.current.knocked.push(k.ticket)
    if (pending.current.joined.length || pending.current.left.length || pending.current.knocked.length) gather()

    // Hands of people who were here before: up in the queue's order, its
    // place the server's (placeIn); down one by one, or many at once (a host's
    // Lower all) as one.
    const line = call.people.filter((p) => p.hand !== null).sort((a, b) => (a.hand ?? 0) - (b.hand ?? 0)).map((p) => p.identity)
    const lowered: (typeof call.people)[number][] = []
    for (const p of call.people) {
      const was = had.get(p.identity)
      if (!was || (was.hand === null) === (p.hand === null)) continue
      if (p.hand === null) lowered.push(p)
      else say(handAnnouncement(p.name, true, placeIn(line, p.identity), p.you))
    }
    if (lowered.length === 1) say(handAnnouncement(lowered[0].name, false, null, lowered[0].you))
    if (lowered.length > 1) say(`${lowered.length} hands lowered`)
    if (before.recording && !call.recording) say("Recording stopped")
    if (before.captions && !call.captions) say("Captions are off")
  }, [call])

  useEffect(
    () => () => {
      if (draining.current) clearTimeout(draining.current)
      if (gathering.current) clearTimeout(gathering.current)
    },
    [],
  )
}
