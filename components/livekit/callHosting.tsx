"use client"

/**
 * Running a call from this screen (Call Control, lib/calls/control): your
 * part in it as the server tells the room, the actions you may take with the
 * server's word on each, the notices the server sends you, and the one menu
 * a tile and the People panel both draw (its items in PersonMenuItems,
 * loaded when first wanted). The server checks every action; this only
 * offers what it allows.
 */

import * as React from "react"
import { ParticipantEvent, RoomEvent, type Participant, type RemoteParticipant, type Room } from "livekit-client"
import dynamic from "next/dynamic"
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useConfirm } from "@/hooks/useConfirm"
import { Ellipsis } from "@/lib/icons"
import { handOf } from "@/lib/calls/handsCore"
import type { CallHold } from "@/lib/calls/holds"
import type { Knock } from "@/lib/calls/lobby"
import { NO_PART, heldFor, partOf, type CallAction, type CallPart, type CallTarget, type PersonAction } from "@/lib/calls/control"
import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"
import { actInCall } from "@/services/callService"
import { CALL_TOPIC, boardNotice, controlNotice, readBoardPacket, readCallMetadata, readControlPacket, type CallBoard } from "./callState"
import { holdNotice, letThroughDone, readHoldPacket } from "./callHolds"
import { guestName } from "./callLevels"
import { showCallFailure } from "./VideoControls"
import { callToast } from "./callSurface"

// A person's menu items: a click away, so loaded when first wanted (warmMenu).
const PersonMenuItems = dynamic(() => import("./PersonMenuItems"), { ssr: false })
const warmMenu = () => void import("./PersonMenuItems")

/** Someone's part in the call, kept current as the server changes it. */
export function useCallPart(participant: Participant | undefined): CallPart {
  const [part, setPart] = React.useState<CallPart>(() => (participant ? partOf(participant.attributes) : NO_PART))
  React.useEffect(() => {
    if (!participant) return
    const update = () => setPart(partOf(participant.attributes))
    update()
    participant.on(ParticipantEvent.AttributesChanged, update)
    return () => {
      participant.off(ParticipantEvent.AttributesChanged, update)
    }
  }, [participant])
  return part
}

/** A LiveKit participant as an action's target: their part, and what they have on. Pure. */
export function targetOf(p: Participant): CallTarget & { name: string } {
  const { name, guest } = guestName(p.identity, p.name || p.identity)
  const { role, allowed } = partOf(p.attributes)
  return {
    identity: p.identity,
    name,
    role,
    guest,
    micOn: p.isMicrophoneEnabled,
    cameraOn: p.isCameraEnabled,
    sharing: !!p.isScreenShareEnabled,
    handUp: handOf(p.attributes) !== null,
    allowed,
  }
}

/** What an action did, in words, when nothing on the screen shows it. Pure. */
export function actionDone(action: CallAction, name: string | undefined, affected: number): string | null {
  switch (action) {
    case "ask_unmute":
      return `Asked ${name ?? "them"} to unmute`
    case "ask_all_unmute":
      return affected > 0 ? `Asked ${affected === 1 ? "1 person" : `${affected} people`} to unmute` : "Everyone's microphone is already on"
    case "mute_all":
      return affected > 0 ? `Muted ${affected === 1 ? "1 person" : `${affected} people`}` : "Everyone is already muted"
    case "make_cohost":
      return `${name ?? "They"} can now run the call with you`
    case "remove":
      return `${name ?? "They"} left the call`
    case "lower_hand":
      return `Lowered ${name ? `${name}'s` : "their"} hand`
    case "lower_all_hands":
      return affected > 0 ? `Lowered ${affected === 1 ? "1 hand" : `${affected} hands`}` : null
    case "admit":
      return `${name ?? "They"} can join now`
    case "deny":
      return `${name ?? "They"} wasn't let in`
    case "admit_all":
      return affected > 0 ? `Let ${affected === 1 ? "1 person" : `${affected} people`} in` : "Nobody was waiting"
    case "undo_guests":
      return affected > 0 ? `Took back ${affected === 1 ? "1 change" : `${affected} changes`} guests made` : "Guests haven't changed the board"
    case "mute_on_entry":
    case "hold":
      // A lasting switch: it shows what was done, and everyone else hears it from the server.
      return null
  }
  return null
}

/**
 * The actions you may take in a call, each sent to the server and said when
 * it is refused. Removing someone and ending the call for everyone are asked
 * first. Nothing here without the call's id: a guest has none, and so no
 * actions.
 */
export function useHostActions(sessionId: string | undefined) {
  const confirm = useConfirm()
  const send = React.useCallback(
    async (
      action: CallAction,
      opts: { identity?: string; source?: string; on?: boolean; what?: CallHold; name?: string; ticket?: string; board?: string; draw?: CallBoard["draw"]; rooms?: string[]; room?: number; minutes?: number; text?: string } = {},
    ): Promise<boolean> => {
      if (!sessionId) return false
      try {
        const { affected } = await actInCall(sessionId, {
          action,
          identity: opts.identity,
          source: opts.source,
          on: opts.on,
          what: opts.what,
          ticket: opts.ticket,
          board: opts.board,
          draw: opts.draw,
          rooms: opts.rooms,
          room: opts.room,
          minutes: opts.minutes,
          text: opts.text,
        })
        const done = action === "allow" && opts.what ? letThroughDone(opts.what, opts.name, !!opts.on) : actionDone(action, opts.name, affected)
        if (done) callToast({ title: done })
        return true
      } catch (e) {
        const code = apiErrorCode(e)
        if (code === "not_waiting") {
          callToast({ title: `${opts.name ?? "They"} had already stopped waiting` })
          return false
        }
        if (code === "not_in_call" && opts.identity) {
          callToast({ title: `${opts.name ?? "They"} had already left the call` })
          return false
        }
        showCallFailure({ title: "That didn't happen", description: apiErrorMessage(e, "Try again in a moment.") })
        return false
      }
    },
    [sessionId],
  )

  const run = React.useCallback(
    (a: PersonAction, target?: { identity: string; name: string; guest?: boolean }) => {
      if (a.action === "remove" && target) {
        confirm({
          title: `Remove ${target.name} from the call?`,
          description: target.guest
            ? `${target.name} is disconnected at once and told why. A guest can open their link again; to keep them out, lock the call or make a new link and turn off the old one.`
            : `${target.name} is disconnected at once, told why, and can't rejoin this call while it lasts.`,
          confirmText: "Remove from call",
          destructive: true,
          onConfirm: () => send("remove", { identity: target.identity, name: target.name }),
        })
        return
      }
      void send(a.action, { identity: target?.identity, source: a.source, what: a.what, on: a.on, name: target?.name })
    },
    [confirm, send],
  )

  const endForEveryone = React.useCallback(() => {
    confirm({
      title: "End the call for everyone?",
      description: "Everyone in it is disconnected at once and told you ended it. Anyone can start a new call afterwards.",
      confirmText: "End for everyone",
      destructive: true,
      onConfirm: () => send("end"),
    })
  }, [confirm, send])

  const setMuteOnEntry = React.useCallback((on: boolean) => send("mute_on_entry", { on }), [send])
  // Holds one thing for everyone who doesn't run the call, or lets them again (meet-12).
  const setHold = React.useCallback((what: CallHold, held: boolean) => send("hold", { what, on: held }), [send])
  // act: any action by name, as the lobby's (CALLS-2) admit, deny and admit_all; whether it was done.
  return { enabled: !!sessionId, run, endForEveryone, setMuteOnEntry, setHold, act: send }
}

/**
 * The server's notices to you about the call: muted, asked to unmute, given a
 * part in it, what the people running it hold for everyone or let you do, and
 * why the board left the stage. Asked to unmute, you get Unmute to press and
 * nothing else: the server never turns your microphone on. Ended for everyone
 * is kept for the end screen (endedBy).
 */
export function useControlNotices(room: Room, endedBy: React.MutableRefObject<string | null | undefined>) {
  React.useEffect(() => {
    // Whose board was last on the stage: the room's metadata can say none
    // already when the packet saying why it left arrives. Read again at
    // Connected too: livekit-client drops a metadata change that lands
    // before then, so a board that went up while you connected comes only
    // as the room's metadata (as useCallMetadata reads it).
    let boardBy = readCallMetadata(room.metadata).board?.by
    const onMeta = () => {
      const board = readCallMetadata(room.metadata).board
      if (board) boardBy = board.by
    }
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== CALL_TOPIC) return
      const hold = readHoldPacket(payload, participant)
      if (hold) {
        // Whether it holds you: not while you run the call or are let through it.
        const holdsYou = heldFor(new Set([hold.what]), partOf(room.localParticipant.attributes)).has(hold.what)
        const { title, detail } = holdNotice(hold, holdsYou)
        callToast({ title, description: detail, tone: "info" })
        return
      }
      const board = readBoardPacket(payload, participant)
      if (board) {
        const notice = boardNotice(board, { mine: boardBy === room.localParticipant.identity, myName: room.localParticipant.name })
        if (notice) callToast({ title: notice.title, tone: "info" })
        return
      }
      const p = readControlPacket(payload, participant)
      if (!p) return
      if (p.t === "ended") {
        endedBy.current = p.by ?? null
        return
      }
      const { title, detail } = controlNotice(p)
      if (p.t === "ask_unmute") {
        void import("./unmuteToast").then((m) => m.askToUnmute(room, title, detail, p.by))
        return
      }
      callToast({ title, description: detail, tone: "info" })
    }
    room.on(RoomEvent.Connected, onMeta)
    room.on(RoomEvent.RoomMetadataChanged, onMeta)
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.Connected, onMeta)
      room.off(RoomEvent.RoomMetadataChanged, onMeta)
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, endedBy])
}

export type CallAct = ReturnType<typeof useHostActions>["act"]

/**
 * Whether the bar above the dock says who waits (CALLS-2, KnockBar): while
 * anyone waits and the list is closed, until Not now (hide), which holds
 * until someone new knocks.
 */
export function useKnockBar(waiting: readonly Knock[] | undefined, listOpen: boolean) {
  const [put, setPut] = React.useState<ReadonlySet<string>>(() => new Set())
  const show = !listOpen && !!waiting?.some((k) => !put.has(k.ticket))
  const hide = React.useCallback(() => setPut(new Set(waiting?.map((k) => k.ticket))), [waiting])
  return { show, hide }
}

/**
 * The actions for one person, as a tile's and a People row's menu: one list
 * (lib/calls/control's personActions), drawn alike, the danger last and apart.
 */
export function PersonActionsMenu({
  name,
  actions,
  onSelect,
  triggerClassName,
}: {
  name: string
  actions: PersonAction[]
  onSelect: (a: PersonAction) => void
  triggerClassName: string
}) {
  if (actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Pointing at it or reaching it by key loads the menu, so it opens at once. */}
        <button type="button" aria-label={`More for ${name}`} className={triggerClassName} data-person-menu="" onPointerEnter={warmMenu} onFocus={warmMenu}>
          <Ellipsis />
        </button>
      </DropdownMenuTrigger>
      <PersonMenuItems name={name} actions={actions} onSelect={onSelect} />
    </DropdownMenu>
  )
}
