"use client"

// The event form's Rooms row (gcal-6): the rooms free for the event's slot,
// sized for its people, as chips to press (the shared ToggleChip); the chosen
// ones pressed, a room the event already books among them though the free
// list leaves it out. A save a room stopped is said here, in the server's
// words alone (they name the other event only to who may read it), and a
// taken room with the way forward. No room free and none chosen asks the
// room directory once, so a workspace with no rooms yet says so (an admin
// with the way to Settings, Rooms) instead of "No room is free then."

import * as React from "react"
import { ToggleChip } from "@/components/ui/toggleChip"
import { Button } from "@/components/ui/button"
import { useFreeRooms, useRoomDirectory } from "@/hooks/useRooms"
import { useWorkspaceAdmin } from "@/hooks/useMyId"
import { roomWhere, type Room, type RoomRefusal } from "@/lib/calendar/rooms"

/** Free rooms shown before "N more rooms". */
const FIRST = 8

/** Where an admin adds rooms: Settings, Rooms (lib/adminSections, "rooms"). */
const ADD_ROOMS = "/app/admin?tab=rooms"

export function RoomRows({
  id,
  rooms,
  onChange,
  start,
  end,
  capacity,
  problem,
}: {
  id: string
  rooms: Room[]
  onChange: (rooms: Room[]) => void
  start: Date
  end: Date
  /** Its people, so a room too small isn't offered; 0 for any size. */
  capacity: number
  problem?: RoomRefusal | null
}) {
  const free = useFreeRooms(start, end, capacity)
  const [all, setAll] = React.useState(false)
  const chosen = new Set(rooms.map((r) => r.id))
  const others = (free.rooms ?? []).filter((r) => !chosen.has(r.id))
  const shown = [...rooms, ...(all ? others : others.slice(0, FIRST))]
  const more = all ? 0 : others.length - Math.min(others.length, FIRST)
  const toggle = (room: Room, on: boolean) => onChange(on ? [...rooms, room] : rooms.filter((r) => r.id !== room.id))
  // None free and none chosen: a busy slot, or no rooms set up yet? Only then
  // is the directory read; a chosen room already says there are rooms.
  const noneFree = !!free.rooms && others.length === 0 && rooms.length === 0
  const directory = useRoomDirectory(noneFree)
  const retry = free.failed ? free.retry : directory.failed ? directory.retry : null

  let note: React.ReactNode = null
  if (free.tooLong) note = "Free rooms can be found for up to 14 days."
  else if (retry) {
    note = (
      <span className="flex items-center gap-2">
        Couldn&apos;t find the free rooms.
        <Button type="button" variant="ghost" size="xs" onClick={retry}>
          Try again
        </Button>
      </span>
    )
  } else if (!free.rooms || (noneFree && !directory.rooms)) note = "Finding free rooms…"
  else if (noneFree && directory.rooms?.length === 0) note = <NoRoomsYet />
  else if (others.length === 0) note = rooms.length ? "No other room is free then." : "No room is free then."

  return (
    <div id={id} className="grid gap-2" data-form-rooms="">
      {shown.length ? (
        <div role="group" aria-label="Rooms" className="flex flex-wrap items-center gap-1.5">
          {shown.map((room) => (
            <ToggleChip key={room.id} tone="neutral" pressed={chosen.has(room.id)} title={roomWhere(room) || undefined} onPressedChange={(on) => toggle(room, on)}>
              {room.name}
              {room.capacity > 0 ? <span className="text-ink-3 tabular-nums"> · {room.capacity}</span> : null}
            </ToggleChip>
          ))}
          {more > 0 ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => setAll(true)}>
              {`${more} more ${more === 1 ? "room" : "rooms"}`}
            </Button>
          ) : null}
        </div>
      ) : null}
      {note ? <p className="text-meta text-ink-3" aria-live="polite">{note}</p> : null}
      {problem ? (
        <p role="alert" className="grid gap-0.5 text-meta text-danger-ink">
          <span>{problem.message}</span>
          {problem.taken ? <span className="text-ink-2">Pick another room or time.</span> : null}
        </p>
      ) : null}
    </div>
  )
}

/** No rooms set up yet: an admin gets the way to Settings, Rooms; a member, who adds them. */
function NoRoomsYet() {
  if (!useWorkspaceAdmin()) return <>No rooms yet. An admin adds them in Settings, Rooms.</>
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      No rooms yet.
      <a href={ADD_ROOMS} className="inline-flex items-center rounded-sm font-medium text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:min-h-11">
        Add rooms<span aria-hidden="true">&nbsp;→</span>
      </a>
    </span>
  )
}
