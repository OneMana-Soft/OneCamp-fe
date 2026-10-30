"use client"

/**
 * Breakout rooms (calls package C, meet-10 and zoom-02), for whoever runs
 * the call: name the rooms, put people in them (one by one, or spread
 * evenly), open them (with a time limit, and whether people choose their
 * own), speak to every room at once, and call everyone back. Beside the
 * stage like People; the whole screen on a phone. Loaded when first opened.
 *
 * What the rooms are comes from the room's metadata (lib/calls/breakouts),
 * so every screen running the call shows the same; each act goes to the
 * server (POST /calls/{session}/act), which refuses in its own words.
 */

import * as React from "react"
import { useNow } from "@/hooks/useNow"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils/helpers/cn"
import { Megaphone, Plus, Users, X } from "@/lib/icons"
import type { CallBreakouts } from "@/lib/calls/breakouts"
import { secondsUntil } from "@/lib/calls/breakoutRooms"
import { CALL_PANEL_FOOT, CALL_PANEL_TOOL, CALL_SIDE_PANEL, useKeptDraft } from "./sidePanel"
import { ToolSwitch } from "./ToolSwitch"
import { CALL_SURFACE } from "./callSurface"

/** Someone in the call's main room who can be put in a room. */
export interface BreakoutPerson {
  identity: string
  name: string
}

export type BreakoutAct = (
  action: "breakouts_set" | "breakouts_assign" | "breakouts_spread" | "breakouts_open" | "breakouts_close" | "breakouts_broadcast",
  opts?: { rooms?: string[]; identity?: string; room?: number; on?: boolean; minutes?: number; text?: string; name?: string },
) => Promise<boolean>

/** The time limits offered when opening the rooms, in minutes; 0 is none. */
export const BREAKOUT_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60] as const
const MAX_ROOMS = 50
const MAX_NAME = 60
const MAX_MESSAGE = 500
const FIRST_ROOMS = ["Room 1", "Room 2"]

/** "4:05" for 245 seconds. Pure. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/** The rooms' names as the server keeps them: trimmed, none empty. Pure. */
export function roomNamesToSend(names: readonly string[]): string[] {
  return names.map((n) => n.trim()).filter(Boolean)
}

const FIELD =
  "h-9 w-full min-w-0 rounded-[8px] border border-white/[0.10] bg-white/[0.04] px-2.5 text-ui-sm text-foreground placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand [@media(pointer:coarse)]:h-11"

export default function CallBreakoutsPanel({
  breakouts,
  people,
  onAct,
  onClose,
}: {
  breakouts: CallBreakouts | undefined
  people: readonly BreakoutPerson[]
  onAct: BreakoutAct
  onClose: () => void
}) {
  const titleId = React.useId()
  const [editing, setEditing] = React.useState(false)
  const setUp = !breakouts || editing
  return (
    <aside aria-labelledby={titleId} data-call-breakouts="" className={CALL_SIDE_PANEL}>
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 id={titleId} className="text-heading leading-tight">
          Breakout rooms
        </h2>
        <Button data-tone="light" aria-label="Close Breakout rooms" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {setUp ? (
        <RoomsEditor
          initial={breakouts ? breakouts.rooms.map((r) => r.name) : FIRST_ROOMS}
          onCancel={breakouts ? () => setEditing(false) : undefined}
          onSave={async (rooms) => {
            if (await onAct("breakouts_set", { rooms })) setEditing(false)
          }}
        />
      ) : (
        <RoomsAtWork breakouts={breakouts} people={people} onAct={onAct} onEdit={() => setEditing(true)} />
      )}
    </aside>
  )
}

function RoomsEditor({ initial, onSave, onCancel }: { initial: string[]; onSave: (rooms: string[]) => Promise<void>; onCancel?: () => void }) {
  const [names, setNames] = React.useState<string[]>(initial)
  const [busy, setBusy] = React.useState(false)
  const rooms = roomNamesToSend(names)
  const set = (i: number, v: string) => setNames((ns) => ns.map((n, j) => (j === i ? v : n)))
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-ui-sm text-ink-2">Name the rooms. You put people in them next, then open them.</p>
        <ol className="mt-3 flex flex-col gap-2" aria-label="Rooms">
          {names.map((n, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className={FIELD}
                aria-label={`Room ${i + 1}'s name`}
                value={n}
                maxLength={MAX_NAME}
                onChange={(e) => set(i, e.target.value)}
              />
              {names.length > 1 ? (
                <Button
                  data-tone="light"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${n.trim() || `room ${i + 1}`}`}
                  onClick={() => setNames((ns) => ns.filter((_, j) => j !== i))}
                  className="h-9 w-9 shrink-0 rounded-lg text-ink-3 hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
        {names.length < MAX_ROOMS ? (
          <button type="button" className={cn(CALL_PANEL_TOOL, "mt-3")} onClick={() => setNames((ns) => [...ns, `Room ${ns.length + 1}`])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add a room
          </button>
        ) : null}
      </div>
      <div className={cn(CALL_PANEL_FOOT, "flex gap-2")}>
        {onCancel ? (
          <Button variant="ghost" data-tone="light" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          className="flex-1"
          busy={busy}
          disabled={rooms.length === 0}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave(rooms)
            } finally {
              setBusy(false)
            }
          }}
        >
          {onCancel ? "Save rooms" : rooms.length === 1 ? "Make 1 room" : `Make ${rooms.length} rooms`}
        </Button>
      </div>
    </>
  )
}

function RoomsAtWork({ breakouts: b, people, onAct, onEdit }: { breakouts: CallBreakouts; people: readonly BreakoutPerson[]; onAct: BreakoutAct; onEdit: () => void }) {
  const now = useNow(b.open && (b.endsAt !== undefined || b.closingAt !== undefined))
  const [choose, setChoose] = React.useState(false)
  const [minutes, setMinutes] = React.useState(0)
  const [message, setMessage] = useKeptDraft("breakouts:message", "")
  const closing = secondsUntil(b.closingAt, now)
  const left = secondsUntil(b.endsAt, now)
  const nameOf = new Map(people.map((p) => [p.identity, p.name]))
  const unassigned = people.filter((p) => b.assigned[p.identity] === undefined)
  const peopleId = React.useId()
  const minutesId = React.useId()
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p role="status" className="text-ui-sm text-ink-2" data-breakouts-state="">
          {closing !== undefined
            ? `Everyone comes back in ${clock(closing)}`
            : b.open
              ? left !== undefined
                ? `The rooms are open: ${clock(left)} left`
                : "The rooms are open"
              : "The rooms aren't open yet"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {closing === undefined ? (
            <button type="button" className={CALL_PANEL_TOOL} onClick={() => void onAct("breakouts_spread")}>
              <Users className="h-3.5 w-3.5" aria-hidden />
              Spread everyone evenly
            </button>
          ) : null}
          {!b.open ? (
            <button type="button" className={CALL_PANEL_TOOL} onClick={onEdit}>
              Rename or add rooms
            </button>
          ) : null}
        </div>
        <ul className="mt-3 flex flex-col gap-2" aria-label="Rooms">
          {b.rooms.map((r) => {
            const inIt = Object.entries(b.assigned).filter(([, n]) => n === r.n)
            const named = inIt.map(([id]) => nameOf.get(id)).filter((n): n is string => !!n)
            const others = inIt.length - named.length
            return (
              <li key={r.n} className="rounded-[10px] bg-white/[0.04] px-3 py-2.5" data-breakout-room={r.n}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-ui font-medium">{r.name}</span>
                  <span className="shrink-0 text-meta tabular-nums text-ink-3">{inIt.length === 1 ? "1 person" : `${inIt.length} people`}</span>
                </div>
                {inIt.length > 0 ? (
                  <p className="mt-0.5 text-ui-sm text-ink-2">
                    {named.join(", ")}
                    {others > 0 ? `${named.length ? ", " : ""}${others === 1 ? "1 more" : `${others} more`}` : ""}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
        {people.length > 0 ? (
          <section className="mt-4" aria-labelledby={peopleId}>
            <h3 id={peopleId} className="text-meta font-medium uppercase tracking-wide text-ink-3">
              {unassigned.length > 0 ? `In the main room, no room yet: ${unassigned.length}` : "Who goes where"}
            </h3>
            <ul className="mt-1.5 flex flex-col">
              {people.map((p) => (
                <li key={p.identity} className="flex min-h-10 items-center justify-between gap-2 [@media(pointer:coarse)]:min-h-12">
                  <span className="min-w-0 truncate text-ui-sm">{p.name}</span>
                  <PanelSelect
                    label={`${p.name}'s room`}
                    className="w-40 shrink-0"
                    value={b.assigned[p.identity] === undefined ? "" : String(b.assigned[p.identity])}
                    placeholder="No room yet"
                    options={b.rooms.map((r) => [String(r.n), r.name])}
                    onChange={(v) => void onAct("breakouts_assign", { identity: p.identity, room: Number(v), name: p.name })}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!b.open ? (
          <section className="mt-4" aria-label="Opening the rooms">
            <ToolSwitch label="Let people choose their room" checked={choose} onChange={setChoose} />
            <div className="mt-2 flex min-h-8 items-center justify-between gap-3 text-ui-sm text-ink-2 [@media(pointer:coarse)]:min-h-11">
              <span id={minutesId}>Close the rooms after</span>
              <PanelSelect
                labelledBy={minutesId}
                className="w-32"
                value={String(minutes)}
                options={BREAKOUT_MINUTES.map((m) => [String(m), m === 0 ? "No limit" : `${m} minutes`])}
                onChange={(v) => setMinutes(Number(v))}
              />
            </div>
          </section>
        ) : null}
      </div>
      <div className={CALL_PANEL_FOOT}>
        {b.open ? (
          <>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const text = message.trim()
                if (!text) return
                void onAct("breakouts_broadcast", { text }).then((sent) => sent && setMessage(""))
              }}
            >
              <input className={FIELD} aria-label="Message to every room" placeholder="Message every room" maxLength={MAX_MESSAGE} value={message} onChange={(e) => setMessage(e.target.value)} />
              <Button type="submit" variant="ghost" data-tone="light" size="icon" aria-label="Send to every room" disabled={!message.trim()} className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
                <Megaphone className="h-4 w-4" />
              </Button>
            </form>
            <Button className="mt-2 w-full" variant="destructive" disabled={closing !== undefined} onClick={() => void onAct("breakouts_close")}>
              {closing !== undefined ? "Calling everyone back" : "Close rooms"}
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => void onAct("breakouts_open", { on: choose, minutes })}>
            Open rooms
          </Button>
        )}
      </div>
    </>
  )
}

/** The app's select on the panel's dark surface: its list wears the call's surface too. */
function PanelSelect(p: { label?: string; labelledBy?: string; className: string; value: string; placeholder?: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Select value={p.value} onValueChange={p.onChange}>
      <SelectTrigger aria-label={p.label} aria-labelledby={p.labelledBy} className={cn(FIELD, p.className)}>
        <SelectValue placeholder={p.placeholder} />
      </SelectTrigger>
      <SelectContent className={CALL_SURFACE}>
        {p.options.map(([v, name]) => (
          <SelectItem key={v} value={v}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
