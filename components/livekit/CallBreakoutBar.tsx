"use client"

/**
 * Breakout rooms for everyone in the call (calls package C, meet-10 and
 * zoom-02), in the bar above the dock: Join your room when the rooms open
 * (or pick one while people choose), and in a room, which one, the time left
 * or the call back counted down, and Back to main room. It hears the
 * server's word (the "breakout" packet: where you now belong, room 0 the
 * main room) and moves you, and shows what whoever runs the call says to
 * every room. Loaded while the call has rooms or you're in one.
 */

import * as React from "react"
import { useNow } from "@/hooks/useNow"
import { useTellHeight } from "@/hooks/useTellHeight"
import { RoomEvent, type RemoteParticipant, type Room } from "livekit-client"
import type { CallBreakouts, InBreakout } from "@/lib/calls/breakouts"
import { breakoutChoices, myBreakout, secondsUntil } from "@/lib/calls/breakoutRooms"
import { readSignal, type SignalSender } from "@/lib/calls/signals"
import { CALL_TOPIC } from "./callState"
import { callToast } from "./callSurface"
import { LOBBY_PRIMARY, LOBBY_SECONDARY } from "./lobbyButtons"
import { clock } from "./CallBreakoutsPanel"
import { showCallFailure } from "./VideoControls"
import type { Asker } from "./handsRunner"
import { breakoutToken, chooseBreakout } from "@/services/callBreakoutsService"

/** Where the server says you now belong, or what it says to every room. Only the server may send one. Pure. */
export type BreakoutPacket = { t: "breakout"; room: number; name?: string } | { t: "breakout_broadcast"; by?: string; text: string }

export function readBreakoutPacket(payload: Uint8Array, sender: SignalSender | undefined): BreakoutPacket | null {
  const m = readSignal<Record<string, unknown>>(payload, sender, { topic: CALL_TOPIC, from: "server" })
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined)
  if (m?.t === "breakout") {
    const room = Number.isInteger(m.room) && (m.room as number) > 0 ? (m.room as number) : 0
    const name = text(m.name)
    return { t: "breakout", room, ...(room && name ? { name } : {}) }
  }
  if (m?.t === "breakout_broadcast") {
    const said = text(m.text)?.slice(0, 500)
    return said ? { t: "breakout_broadcast", by: text(m.by), text: said } : null
  }
  return null
}

export default function CallBreakoutBar({
  room,
  breakouts: b,
  identity,
  runsCall,
  inRoom,
  asker,
  language,
  onHop,
  onHeight,
  hidden = false,
}: {
  room: Room
  breakouts: CallBreakouts | undefined
  identity: string
  runsCall: boolean
  /** The breakout room you're in, or null in the main room. */
  inRoom: InBreakout | null
  /** Who asks for a room's token: a member's session, or a guest's call token. */
  asker: Asker
  language?: string
  /** Moves the call to a room's token (null: back to the call's own), carrying your mic and camera. */
  onHop: (to: (InBreakout & { token: string }) | null, carry: { audio: boolean; video: boolean }) => void
  /** The bar's height, for the stage to keep clear (as KnockBar's). */
  onHeight: (px: number) => void
  /** Hears the server only: the knock bar has the dock's notice. */
  hidden?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  // What whoever runs the call said to every room, in the bar for 15 s (on a
  // phone a toast would sit on the bar); a toast only while the bar is hidden.
  const [said, setSaid] = React.useState<{ by?: string; text: string } | null>(null)
  const hiddenNow = React.useRef(hidden)
  hiddenNow.current = hidden
  React.useEffect(() => {
    if (!said) return
    const t = window.setTimeout(() => setSaid(null), 15_000)
    return () => window.clearTimeout(t)
  }, [said])
  const move = React.useCallback(
    async (n: number, name?: string) => {
      const me = room.localParticipant
      const carry = { audio: me.isMicrophoneEnabled, video: me.isCameraEnabled }
      setBusy(true)
      try {
        if (n === 0) {
          void chooseBreakout(asker, 0)
          onHop(null, carry)
          return
        }
        await chooseBreakout(asker, n)
        const t = await breakoutToken(asker, n, language)
        if (t.ok) onHop({ n: t.n, name: t.name || name || "", token: t.token }, carry)
        else showCallFailure({ title: name ? `You couldn't join ${name}` : "You couldn't join that room", description: t.msg })
      } finally {
        setBusy(false)
      }
    },
    [room, asker, language, onHop],
  )

  // The server's word: where you now belong, and what's said to every room.
  const at = React.useRef(inRoom?.n ?? 0)
  at.current = inRoom?.n ?? 0
  React.useEffect(() => {
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== CALL_TOPIC) return
      const p = readBreakoutPacket(payload, participant)
      if (!p) return
      if (p.t === "breakout_broadcast") {
        if (hiddenNow.current) callToast({ title: p.by ? `${p.by}, to every room` : "To every room", description: p.text, duration: 15_000 })
        else setSaid({ by: p.by, text: p.text })
        return
      }
      if (p.room !== at.current) void move(p.room, p.name)
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, move])

  const now = useNow(!hidden && !!b?.open && (b.closingAt !== undefined || b.endsAt !== undefined))
  if (hidden) return null
  const closing = secondsUntil(b?.closingAt, now)
  const left = secondsUntil(b?.endsAt, now)

  if (inRoom) {
    const when = closing !== undefined ? `Back to the main room in ${clock(closing)}` : left !== undefined ? `${clock(left)} left` : null
    return (
      <Bar onHeight={onHeight} said={said}>
        <span className="min-w-[9rem] flex-1 text-ui-sm">
          <span className="font-medium">{inRoom.name || "Your breakout room"}</span>
          {when ? <span className="text-ink-2"> · {when}</span> : null}
        </span>
        <button type="button" className={LOBBY_SECONDARY} disabled={busy} onClick={() => void move(0)}>
          Back to main room
        </button>
      </Bar>
    )
  }
  const saidOnly = said ? <Bar onHeight={onHeight} said={said} /> : null
  if (!b?.open || closing !== undefined) return saidOnly
  const mine = myBreakout(b, identity)
  const choices = breakoutChoices(b, identity, runsCall)
  if (mine && !b.choose) {
    return (
      <Bar onHeight={onHeight} said={said}>
        <span className="min-w-[9rem] flex-1 text-ui-sm font-medium">{`Breakout rooms are open: you're in ${mine.name}`}</span>
        <button type="button" className={LOBBY_PRIMARY} disabled={busy} onClick={() => void move(mine.n, mine.name)} aria-label={`Join ${mine.name}`}>
          Join
        </button>
      </Bar>
    )
  }
  if (choices.length === 0) return saidOnly
  return (
    <Bar onHeight={onHeight} said={said}>
      <span className="min-w-[9rem] flex-1 text-ui-sm font-medium">{runsCall && !b.choose ? "Visit a breakout room" : "Breakout rooms are open: pick one"}</span>
      <span className="flex flex-wrap gap-1.5" role="group" aria-label="Breakout rooms">
        {choices.slice(0, 6).map((r) => (
          <button key={r.n} type="button" className={r.n === mine?.n ? LOBBY_PRIMARY : LOBBY_SECONDARY} disabled={busy} onClick={() => void move(r.n, r.name)} aria-label={`Join ${r.name}`}>
            {r.name}
          </button>
        ))}
        {choices.length > 6 ? (
          <select
            aria-label="More rooms"
            className={LOBBY_SECONDARY}
            value=""
            onChange={(e) => {
              const r = choices.find((c) => c.n === Number(e.target.value))
              if (r) void move(r.n, r.name)
            }}
          >
            <option value="" disabled>
              More rooms
            </option>
            {choices.slice(6).map((r) => (
              <option key={r.n} value={r.n}>
                {r.name}
              </option>
            ))}
          </select>
        ) : null}
      </span>
    </Bar>
  )
}

function Bar({ children, onHeight, said }: { children?: React.ReactNode; onHeight: (px: number) => void; said: { by?: string; text: string } | null }) {
  const ref = React.useRef<HTMLDivElement>(null)
  useTellHeight(ref, onHeight)
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Breakout rooms"
      data-breakout-bar=""
      className="hub-pop-down flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[14px] bg-[#1F2024] p-1.5 pl-3 text-[#EEEEF0] shadow-e3 ring-1 ring-inset ring-white/[0.06]"
    >
      {said ? (
        <p role="status" data-breakout-said="" className="basis-full py-0.5 text-ui-sm">
          <span className="font-medium">{said.by ? `${said.by}, to every room: ` : "To every room: "}</span>
          <span className="text-ink-2">{said.text}</span>
        </p>
      ) : null}
      {children}
    </div>
  )
}
