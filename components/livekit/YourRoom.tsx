"use client"

// A member's personal meeting room (calls CALLS-2), at /app/meet/room: one
// address that's always theirs ("/r/maya"), where people outside the
// workspace ask to come in. Opened once, then changed here: who waits in the
// lobby, a passcode, the address itself; or closed. Its calls are hosted on
// the meeting's own page, as an instant meeting's are (/app/meet/m/<id>).

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DangerZone,
  SettingRow,
  SettingsCard,
  SettingsCardError,
  SettingsRowsSkeleton,
  SettingsSection,
  SETTINGS_STACK,
  SwitchRow,
} from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ArrowLeft, Check, Copy, Loader2, Video } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { changeMyRoom, closeMyRoom, MY_ROOM, openMyRoom, type MyRoom, type RoomChanges } from "@/services/roomService"
import { roomLink } from "@/services/guestDoor"
import { SECRET_HINT, SECRET_LENGTH, secretProblem } from "@/lib/publish/secret"

/** The meeting's own page, where its owner hosts the room's calls. */
export const roomMeetingPath = (room: MyRoom) => `/app/meet/m/${encodeURIComponent(room.meeting_id)}`

export function YourRoom() {
  const router = useRouter()
  const { data, isLoading, isError, mutate } = useFetch<{ data: MyRoom | null }>(MY_ROOM, undefined, undefined, OWN_ERRORS)
  const room = data?.data ?? null
  const show = React.useCallback((next: MyRoom | null) => void mutate({ data: next }, { revalidate: false }), [mutate])
  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push("/app/home")
  }

  let body: React.ReactNode
  if (isLoading && !data) {
    body = (
      <SettingsCard aria-label="Loading your room">
        <SettingsRowsSkeleton rows={2} control="button" />
      </SettingsCard>
    )
  } else if (isError && !data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="your room" onRetry={() => void mutate()} />
      </SettingsCard>
    )
  } else if (!room) {
    body = <NoRoom onOpened={show} />
  } else {
    body = <RoomSettings room={room} onChanged={show} />
  }

  return (
    <div className="h-full overflow-y-auto bg-sheet" data-your-room="">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-8">
        <div className="flex items-center gap-2 pb-1 sm:-ml-9">
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={back}>
            <ArrowLeft />
          </Button>
          <h1 className="font-display text-title-2 font-semibold text-ink">Your room</h1>
        </div>
        <p className="max-w-[60ch] pb-6 pl-9 text-ui text-ink-2 text-pretty sm:pl-0">
          One address that&apos;s always yours. Share it once: people outside your workspace ask to come in, and you let them in.
        </p>
        {body}
      </div>
    </div>
  )
}

/** Before a room: what it is, and Open your room. */
function NoRoom({ onOpened }: { onOpened: (room: MyRoom) => void }) {
  const [opening, setOpening] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const open = async () => {
    setOpening(true)
    setError(undefined)
    try {
      onOpened(await openMyRoom())
    } catch (e) {
      setError(apiErrorMessage(e, "Your room couldn't be opened. Try again in a moment."))
    } finally {
      setOpening(false)
    }
  }
  return (
    <SettingsCard>
      <div className="set-row flex flex-col items-start gap-4 sm:flex-row sm:items-center" data-room-none="">
        <span aria-hidden="true" className="inline-grid size-10 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2 ring-1 ring-inset ring-line [&>svg]:size-5">
          <Video />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">No room yet</p>
          <p className="text-xs text-muted-foreground text-pretty">It takes your name for its address. Guests wait in its lobby until you let them in.</p>
          {error ? (
            <p role="alert" className="pt-1 text-xs text-danger-ink">
              {error}
            </p>
          ) : null}
        </div>
        <Button className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => void open()} disabled={opening}>
          {opening ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}
          Open your room
        </Button>
      </div>
    </SettingsCard>
  )
}

/** A room's link, copied, with Start beside it. */
function RoomAddress({ room, onOpened }: { room: MyRoom; onOpened: (room: MyRoom) => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)
  const [opening, setOpening] = React.useState(false)
  const link = roomLink(room.address)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Couldn't copy the address", description: link, variant: "destructive" })
    }
  }
  if (!room.address) {
    // An admin turned its link off in the guest links list: the room is
    // still theirs, and opening it again gives it an address.
    return (
      <SettingsCard>
        <div className="set-row flex flex-col items-start gap-3 sm:flex-row sm:items-center" data-room-address="off">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium text-foreground">Your room has no address</p>
            <p className="text-xs text-muted-foreground text-pretty">An admin turned its link off. Give it an address again to share it.</p>
          </div>
          <Button
            className="h-11 w-full sm:h-9 sm:w-auto"
            disabled={opening}
            onClick={async () => {
              setOpening(true)
              try {
                onOpened(await openMyRoom())
              } catch (e) {
                toast({ title: "Couldn't give your room an address", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
              } finally {
                setOpening(false)
              }
            }}
          >
            {opening ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : null}
            Give it an address
          </Button>
        </div>
      </SettingsCard>
    )
  }
  return (
    <SettingsCard>
      <div className="set-row flex flex-col gap-3" data-room-address="">
        <div className="flex min-w-0 items-start gap-2">
          {/* The whole address. On a phone the host is a quiet first line and
              the room's own path the second, whole. */}
          <p
            aria-label="Your room's address"
            data-room-link=""
            className="min-h-11 min-w-0 flex-1 select-all rounded-lg bg-sunken px-3 py-2 text-ui text-ink ring-1 ring-inset ring-line [overflow-wrap:anywhere] sm:min-h-9 sm:py-1.5"
          >
            <span className="inline-block w-full text-ink-3 sm:w-auto sm:text-ink">{link.slice(0, link.length - room.address.length)}</span>
            {room.address}
          </p>
          <Button variant="secondary" className="h-11 shrink-0 sm:h-9" onClick={() => void copy()}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground text-pretty">{room.title}. It stays open until you close it.</p>
          <Button className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => router.push(roomMeetingPath(room))}>
            <Video aria-hidden />
            Start
          </Button>
        </div>
      </div>
    </SettingsCard>
  )
}

/** A room's settings: who comes in, its passcode and address, and closing it. */
function RoomSettings({ room, onChanged }: { room: MyRoom; onChanged: (room: MyRoom | null) => void }) {
  const confirm = useConfirm()
  const { toast } = useToast()
  const lobby = useSaveStatus()
  const [waitPending, setWaitPending] = React.useState<boolean | null>(null)
  const change = async (changes: RoomChanges) => onChanged(await changeMyRoom(changes))
  // Offered back once it holds, as every switch that ticks is; resolves to whether it held.
  const applyWait = async (next: boolean): Promise<boolean> => {
    setWaitPending(next)
    const held = await lobby.run(() => change({ guests_wait: next }), switchOffer("Guests wait in the lobby", next, applyWait))
    setWaitPending(null)
    return held
  }

  const close = () =>
    confirm({
      title: "Close your room?",
      description: "Its address stops working at once, and anyone in it from outside is removed. You can open a new room later.",
      confirmText: "Close room",
      destructive: true,
      onConfirm: async () => {
        try {
          await closeMyRoom()
          onChanged(null)
          toast({ title: "Your room is closed" })
        } catch (e) {
          toast({ title: "Couldn't close your room", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        }
      },
    })

  return (
    <div className={SETTINGS_STACK}>
      {!room.on ? (
        <p role="status" data-room-off="" className="rounded-lg bg-sunken px-4 py-3 text-xs text-ink-2 ring-1 ring-inset ring-line text-pretty">
          Personal rooms are off for this workspace, so your room&apos;s address doesn&apos;t answer now. An admin can turn them back on.
        </p>
      ) : null}
      <RoomAddress room={room} onOpened={(r) => onChanged(r)} />
      <SettingsSection title="Who comes in" description="People in your workspace can come in as themselves, without waiting.">
        <SettingsCard>
          <SwitchRow
            label="Guests wait in the lobby"
            description="You, or anyone running the call, lets each guest in."
            checked={waitPending ?? room.guests_wait}
            disabled={lobby.status.state === "saving"}
            status={lobby.status}
            onChange={(next) => void applyWait(next)}
          />
          <PasscodeRow room={room} onSave={change} />
          <AddressRow room={room} onSave={change} />
        </SettingsCard>
      </SettingsSection>
      <DangerZone>
        <SettingRow label="Close your room" description="Its address stops working, and guests in it are removed. You can open a new room later." controlId="room-close">
          <Button variant="secondary" className="h-11 text-danger-ink sm:h-9" onClick={close}>
            Close room
          </Button>
        </SettingRow>
      </DangerZone>
    </div>
  )
}

/**
 * A row's value being changed: the field (with a prefix, such as /r/), what
 * failed said under it and marked on it, Save (outline: the page's one
 * primary is Start) and Cancel. Enter saves.
 */
function RowEdit({
  id,
  value,
  onChange,
  prefix,
  placeholder,
  maxLength,
  canSave,
  save,
  onSubmit,
  onCancel,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  placeholder?: string
  maxLength: number
  canSave: boolean
  save: ReturnType<typeof useSaveStatus>
  onSubmit: () => void
  onCancel: () => void
}) {
  const failed = save.status.state === "error" && !!save.status.error
  return (
    <form
      className="flex flex-col gap-2 md:flex-row md:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave && save.status.state !== "saving") onSubmit()
      }}
    >
      <div className="min-w-0 md:flex-1">
        <div className="relative">
          {prefix ? (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base text-ink-3 md:text-sm">
              {prefix}
            </span>
          ) : null}
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            autoFocus
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={failed || undefined}
            aria-describedby={failed ? `${id}-error` : undefined}
            // The text starts just after a short prefix (/r/), so the two read as one address.
            className={prefix ? "pl-[26px] md:pl-6" : undefined}
          />
        </div>
        {failed ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger-ink text-pretty">
            Not saved. {save.status.error}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="h-11 flex-1 md:h-8 md:flex-none" disabled={!canSave || save.status.state === "saving"}>
          Save
        </Button>
        <Button type="button" variant="ghost" className="h-11 flex-1 md:h-8 md:flex-none" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** A passcode: set, changed or turned off. A new one ends every unlock a guest holds. */
function PasscodeRow({ room, onSave }: { room: MyRoom; onSave: (c: RoomChanges) => Promise<void> }) {
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState("")
  const save = useSaveStatus()
  // A first passcode is offered back, and Undo takes it off again. A changed or
  // removed one isn't: this page never holds the old passcode (a room says only
  // whether it has one), so there is nothing to put back.
  const submit = async (passcode: string): Promise<boolean> => {
    const first = !room.passcode && passcode !== ""
    const held = await save.run(() => onSave({ passcode }), first ? { what: "Passcode: On", undo: () => submit("") } : undefined)
    if (held) {
      setEditing(false)
      setValue("")
    }
    return held
  }
  return (
    <SettingRow
      label="Passcode"
      description={room.passcode ? "Guests type it before they come in. A new one asks everyone again." : "Anyone with the address can ask to come in."}
      controlId="room-passcode"
      layout={editing ? "stacked" : "inline"}
      // A failure is said once: under the field while it is open, else by the row.
      status={editing && save.status.state === "error" ? undefined : save.status}
    >
      {editing ? (
        <RowEdit
          id="room-passcode"
          value={value}
          onChange={setValue}
          placeholder={SECRET_HINT}
          maxLength={SECRET_LENGTH.longest}
          canSave={!secretProblem("passcode", value)}
          save={save}
          onSubmit={() => void submit(value)}
          onCancel={() => (setEditing(false), setValue(""))}
        />
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="h-11 sm:h-9" onClick={() => setEditing(true)}>
            {room.passcode ? "Change" : "Set a passcode"}
          </Button>
          {room.passcode ? (
            <Button variant="ghost" className="h-11 sm:h-9" disabled={save.status.state === "saving"} onClick={() => void submit("")}>
              Turn off
            </Button>
          ) : null}
        </div>
      )}
    </SettingRow>
  )
}

/** The room's address: changed, the old one stops answering at once. */
function AddressRow({ room, onSave }: { room: MyRoom; onSave: (c: RoomChanges) => Promise<void> }) {
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(room.slug)
  const save = useSaveStatus()
  // A new address is offered back: Undo asks for the old one again, and says so
  // if someone took it meanwhile.
  const saveSlug = async (slug: string, was: string): Promise<boolean> => {
    const held = await save.run(() => onSave({ slug }), { what: `Address: /r/${slug}`, undo: () => saveSlug(was, slug) })
    if (held) setEditing(false)
    return held
  }
  if (!room.address) return null
  return (
    <SettingRow
      label="Address"
      description={editing ? "The old address stops working as soon as you save." : room.address}
      controlId="room-address"
      layout={editing ? "stacked" : "inline"}
      status={editing && save.status.state === "error" ? undefined : save.status}
    >
      {editing ? (
        <RowEdit
          id="room-address"
          value={value}
          onChange={setValue}
          prefix="/r/"
          maxLength={64}
          canSave={!!value.trim() && value !== room.slug}
          save={save}
          onSubmit={() => void saveSlug(value, room.slug)}
          onCancel={() => (setEditing(false), setValue(room.slug))}
        />
      ) : (
        <Button variant="secondary" className="h-11 sm:h-9" onClick={() => (setValue(room.slug), setEditing(true))}>
          Change
        </Button>
      )}
    </SettingRow>
  )
}
