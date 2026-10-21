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
import { ToastAction } from "@/components/ui/toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Ellipsis } from "@/lib/icons"
import { NO_PART, partOf, type CallAction, type CallPart, type CallTarget, type PersonAction } from "@/lib/calls/control"
import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"
import { actInCall } from "@/services/callService"
import { CALL_TOPIC, controlNotice, readControlPacket } from "./callState"
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
  return {
    identity: p.identity,
    name,
    role: partOf(p.attributes).role,
    guest,
    micOn: p.isMicrophoneEnabled,
    cameraOn: p.isCameraEnabled,
    sharing: !!p.isScreenShareEnabled,
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
    case "mute_on_entry":
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
    async (action: CallAction, opts: { identity?: string; source?: string; on?: boolean; name?: string } = {}) => {
      if (!sessionId) return
      try {
        const { affected } = await actInCall(sessionId, { action, identity: opts.identity, source: opts.source, on: opts.on })
        const done = actionDone(action, opts.name, affected)
        if (done) callToast({ title: done })
      } catch (e) {
        const code = apiErrorCode(e)
        if (code === "not_in_call" && opts.identity) {
          callToast({ title: `${opts.name ?? "They"} had already left the call` })
          return
        }
        showCallFailure({ title: "That didn't happen", description: apiErrorMessage(e, "Try again in a moment.") })
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
      void send(a.action, { identity: target?.identity, source: a.source, name: target?.name })
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

  return { enabled: !!sessionId, run, endForEveryone, setMuteOnEntry }
}

/**
 * The server's notices to you about the call: muted, asked to unmute, given a
 * part in it. Asked to unmute, you get Unmute to press and nothing else: the
 * server never turns your microphone on. Ended for everyone is kept for the
 * end screen (endedBy).
 */
export function useControlNotices(room: Room, endedBy: React.MutableRefObject<string | null | undefined>) {
  React.useEffect(() => {
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== CALL_TOPIC) return
      const p = readControlPacket(payload, participant)
      if (!p) return
      if (p.t === "ended") {
        endedBy.current = p.by ?? null
        return
      }
      const { title, detail } = controlNotice(p)
      if (p.t === "ask_unmute") {
        callToast({
          title,
          description: detail,
          tone: "person",
          action: (
            <ToastAction
              altText="Unmute your microphone"
              onClick={() => room.localParticipant.setMicrophoneEnabled(true).catch(() => showCallFailure({ title: "Couldn't turn your microphone on", description: "Check that the browser may use it, then try again." }))}
            >
              Unmute
            </ToastAction>
          ),
        })
        return
      }
      callToast({ title, description: detail, tone: "info" })
    }
    room.on(RoomEvent.DataReceived, onData)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
    }
  }, [room, endedBy])
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
      <PersonMenuItems actions={actions} onSelect={onSelect} />
    </DropdownMenu>
  )
}
