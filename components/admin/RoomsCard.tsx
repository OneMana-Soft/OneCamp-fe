"use client"

// The Resource Directory (gcal-6): the workspace's meeting rooms, kept by its
// admins and booked by members with an event. A room is added and changed in
// the shared dialog (a sheet on a phone, its actions in the pinned footer),
// retired through the shared confirm (soft: it leaves the directory and keeps
// its bookings), and shows its next two weeks as busy blocks, an event's
// title only where the admin may read it. The page hands it its client, so
// this lazy chunk reaches no shared core; each change is said in place.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmAlertDialog } from "@/components/dialog/confirmAlertDialog"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { reasonOf } from "@/components/ui/saveStatus"
import { CalendarClock, DoorOpen, Pencil, Plus } from "@/lib/icons"
import { clockRange } from "@/lib/utils/date/clock"
import { format } from "date-fns"
import {
  addRoom,
  changeRoom,
  draftOf,
  listRooms,
  retireRoom,
  roomBookings,
  roomChange,
  roomInputOf,
  roomWhere,
  type Room,
  type RoomBooking,
  type RoomDraft,
  type RoomsHttp,
} from "@/lib/calendar/rooms"

type Open = { to: "add" } | { to: "change" | "retire" | "bookings"; room: Room } | null

export default function RoomsCard({ http }: { http: RoomsHttp }) {
  const [rooms, setRooms] = React.useState<Room[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [open, setOpen] = React.useState<Open>(null)
  const [said, setSaid] = React.useState("")

  const load = React.useCallback(async () => {
    setFailed(false)
    try {
      setRooms((await listRooms(http)).filter((r) => !r.retired))
    } catch {
      setFailed(true)
    }
  }, [http])
  React.useEffect(() => void load(), [load])

  const saved = (room: Room, was?: Room) => {
    setRooms((list) => (was ? (list ?? []).map((r) => (r.id === was.id ? room : r)) : [...(list ?? []), room]))
    setSaid(was ? `Saved ${room.name}.` : `Added ${room.name}.`)
    setOpen(null)
  }

  const retire = async (room: Room) => {
    await retireRoom(http, room.id)
    setRooms((list) => (list ?? []).filter((r) => r.id !== room.id))
    setSaid(`Retired ${room.name}. Its bookings stay on their events.`)
  }

  const add = (
    <Button type="button" variant="outline" size="sm" className={sectionActionClass} onClick={() => setOpen({ to: "add" })}>
      <Plus aria-hidden className="size-4" />
      Add a room
    </Button>
  )

  let body: React.ReactNode
  if (failed) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the rooms" onRetry={() => void load()} />
      </SettingsCard>
    )
  } else if (!rooms) {
    body = (
      <SettingsCard aria-label="Loading the rooms">
        <SettingsRowsSkeleton rows={2} />
      </SettingsCard>
    )
  } else if (rooms.length === 0) {
    body = (
      <SettingsCard>
        <div className="grid justify-items-center gap-2 px-4 py-8 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-[color-mix(in_oklab,var(--theme-glow,var(--primary))_14%,transparent)] text-primary">
            <DoorOpen aria-hidden className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No rooms yet</p>
          <p className="max-w-xs text-meta text-ink-3">Add the rooms people meet in, and they can book one with an event.</p>
          {add}
        </div>
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        <ul className="divide-y divide-border">
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} onOpen={(to) => setOpen({ to, room })} />
          ))}
        </ul>
      </SettingsCard>
    )
  }

  return (
    <SettingsSection
      title="Rooms"
      description="The rooms people book with an event, on every plan. Retiring one keeps its bookings."
      action={rooms?.length ? add : undefined}
    >
      <p role="status" className={said ? "px-1 text-meta text-ink-2" : "sr-only"}>
        {said}
      </p>
      {body}
      {open?.to === "add" || open?.to === "change" ? (
        <RoomDialog
          http={http}
          room={open.to === "change" ? open.room : undefined}
          onClose={() => setOpen(null)}
          onSaved={(room) => saved(room, open.to === "change" ? open.room : undefined)}
        />
      ) : null}
      {open?.to === "bookings" ? <BookingsDialog http={http} room={open.room} onClose={() => setOpen(null)} /> : null}
      <ConfirmAlertDialog
        open={open?.to === "retire"}
        onOpenChange={(on) => !on && setOpen(null)}
        title={open?.to === "retire" ? `Retire the room ${open.room.name}?` : "Retire the room?"}
        description="No one can book it from now on. Its bookings stay on their events, and the room stays in their history."
        confirmText="Retire room"
        destructive
        onConfirm={async () => {
          if (open?.to === "retire") await retire(open.room)
        }}
      />
    </SettingsSection>
  )
}

function RoomRow({ room, onOpen }: { room: Room; onOpen: (to: "change" | "retire" | "bookings") => void }) {
  const where = roomWhere(room)
  return (
    <li aria-label={room.name} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div className="grid min-w-0 flex-1 basis-56 gap-1">
        <p className="truncate text-sm font-medium text-foreground">{room.name}</p>
        {where ? <p className="text-meta text-ink-3">{where}</p> : null}
        {room.features.length ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {room.features.map((f) => (
              <Chip key={f}>{f}</Chip>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm" aria-label={`Bookings for ${room.name}`} onClick={() => onOpen("bookings")}>
          <CalendarClock aria-hidden className="size-4" />
          Bookings
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`Change ${room.name}`} onClick={() => onOpen("change")}>
          <Pencil aria-hidden className="size-4" />
          Change
        </Button>
        <Button type="button" variant="ghost" size="sm" className="text-danger-ink" aria-label={`Retire ${room.name}`} onClick={() => onOpen("retire")}>
          Retire
        </Button>
      </div>
    </li>
  )
}

const FIELDS: { key: keyof RoomDraft; label: string; placeholder: string; inputMode?: "numeric" }[] = [
  { key: "name", label: "Name", placeholder: "Atlas" },
  { key: "building", label: "Building", placeholder: "North wing" },
  { key: "floor", label: "Floor", placeholder: "2" },
  { key: "capacity", label: "Seats", placeholder: "8", inputMode: "numeric" },
  { key: "features", label: "Features", placeholder: "Screen, whiteboard, camera" },
]

function RoomDialog({ http, room, onClose, onSaved }: { http: RoomsHttp; room?: Room; onClose: () => void; onSaved: (room: Room) => void }) {
  const id = React.useId()
  const [draft, setDraft] = React.useState<RoomDraft>(() => draftOf(room))
  const [problem, setProblem] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const title = room ? `Change ${room.name}` : "Add a room"

  const save = async () => {
    const read = roomInputOf(draft)
    if ("problem" in read) {
      setProblem(read.problem)
      return
    }
    setProblem("")
    const change = room ? roomChange(draft, room) : read.input
    if (room && Object.keys(change).length === 0) return onClose()
    setBusy(true)
    try {
      onSaved(room ? await changeRoom(http, room.id, change) : await addRoom(http, change))
    } catch (e) {
      setProblem(reasonOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(on) => !on && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Where it is, how many it seats and what it has, so people pick the right one.</DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={`${id}-${f.key}`}>{f.label}</Label>
              <Input
                id={`${id}-${f.key}`}
                value={draft[f.key]}
                inputMode={f.inputMode}
                placeholder={f.placeholder}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
            </div>
          ))}
          {problem ? (
            <p role="alert" className="text-meta text-danger-ink">
              {problem}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} busy={busy}>
            {room ? "Save room" : "Add room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BookingsDialog({ http, room, onClose }: { http: RoomsHttp; room: Room; onClose: () => void }) {
  const [bookings, setBookings] = React.useState<RoomBooking[] | null>(null)
  const [failed, setFailed] = React.useState(false)
  const load = React.useCallback(async () => {
    setFailed(false)
    const from = new Date()
    const to = new Date(from.getTime() + 14 * 24 * 3600 * 1000)
    try {
      setBookings(await roomBookings(http, room.id, from, to))
    } catch {
      setFailed(true)
    }
  }, [http, room.id])
  React.useEffect(() => void load(), [load])

  return (
    <Dialog open onOpenChange={(on) => !on && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`${room.name} bookings`}</DialogTitle>
          <DialogDescription>The next two weeks. An event shows its title only where you may read it.</DialogDescription>
        </DialogHeader>
        {failed ? (
          <SettingsCardError what="the bookings" onRetry={() => void load()} />
        ) : !bookings ? (
          <SettingsRowsSkeleton rows={2} />
        ) : bookings.length === 0 ? (
          <p className="py-4 text-center text-meta text-ink-3">Free all of the next two weeks.</p>
        ) : (
          <ul className="grid gap-1.5">
            {bookings.map((b) => {
              const start = new Date(b.start)
              return (
                <li key={`${b.start}-${b.end}-${b.event_id ?? ""}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="w-24 shrink-0 text-meta text-ink-3">{format(start, "EEE d MMM")}</span>
                  <span className="shrink-0 text-meta tabular-nums text-ink-2">{clockRange(start, new Date(b.end))}</span>
                  <span className="min-w-0 truncate text-sm text-foreground">{b.title || "Busy"}</span>
                </li>
              )
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
