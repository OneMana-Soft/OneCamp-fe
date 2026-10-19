"use client"

/**
 * Who is in the call (step 3, part 2): the dock's Participants, a count and
 * a list in the stage's side column, where the in-call AI's panel is. The
 * tiles count screens (a presenter is two); this counts people, and never
 * the transcription agent.
 */

import * as React from "react"
import { useParticipants } from "@livekit/components-react"
import type { Participant } from "livekit-client"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HUE_CLASS, avatarHueClass } from "@/components/ui/graphics/hues"
import { Ellipsis, MicOff, UserMinus, VideoOff, X } from "@/lib/icons"
import { senderOf } from "@/lib/calls/signals"
import { personHue } from "@/lib/utils/getAvatarColor"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { cn } from "@/lib/utils/helpers/cn"
import { guestName } from "./callLevels"

export interface CallPerson {
  identity: string
  name: string
  guest: boolean
  you: boolean
  micOn: boolean
  cameraOn: boolean
  participant: Participant
}

/** The people in a call, you first and the rest by name: no agent. Pure. */
export function peopleOf(participants: readonly Participant[]): CallPerson[] {
  return participants
    .filter((p) => senderOf(p) === "participant")
    .map((p) => {
      const { name, guest } = guestName(p.identity, p.name || p.identity)
      return { identity: p.identity, name, guest, you: p.isLocal, micOn: p.isMicrophoneEnabled, cameraOn: p.isCameraEnabled, participant: p }
    })
    .sort((a, b) => (a.you === b.you ? a.name.localeCompare(b.name) : a.you ? -1 : 1))
}

/** The people in the room this is drawn in, kept current as they come, go and mute. */
export function useCallPeople(): CallPerson[] {
  // useParticipants answers anew on every participant event (a mute too).
  return peopleOf(useParticipants())
}

/**
 * The list: a right column like the AI's panel (#131416, r14, 12 px in from
 * the stage's edges, clear of the dock). A host may remove anyone but
 * themselves, as a tile's own menu does.
 */
export function CallPeoplePanel({ people, onClose, onRemove }: { people: CallPerson[]; onClose: () => void; onRemove?: (p: Participant) => void }) {
  const titleId = React.useId()
  return (
    <aside
      aria-label="Participants"
      data-call-people=""
      className="hub-panel-in flex h-full w-full flex-col overflow-hidden bg-[#131416] text-foreground @3xl:my-3 @3xl:mr-3 @3xl:h-[calc(100%-24px-84px)] @3xl:w-[320px] @3xl:rounded-[14px] @3xl:shadow-e3 @7xl:h-[calc(100%-24px-100px)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 id={titleId} className="flex items-baseline gap-2 text-heading leading-tight">
          In the call
          <span className="text-ui-sm font-medium tabular-nums text-ink-3">{people.length}</span>
        </h2>
        <Button data-tone="light" aria-label="Close participants" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul aria-labelledby={titleId} className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {people.map((p) => {
          const hue = personHue(p.name || p.identity)
          return (
            <li key={p.identity} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 py-1.5">
              <span aria-hidden className={cn(HUE_CLASS[hue], avatarHueClass(hue), "grid size-7 shrink-0 place-items-center rounded-full text-micro font-semibold leading-none")}>
                {getNameInitials(p.name)}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span data-person-name="" className="truncate text-ui-sm font-medium text-[#EEEEF0]">
                  {p.name}
                </span>
                {p.you ? <span className="shrink-0 text-meta text-ink-3">You</span> : p.guest ? <span className="shrink-0 text-meta text-ink-3">Guest</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-ink-3 [&_svg]:size-4">
                {!p.micOn ? (
                  <span className="text-[#FF8086]">
                    <MicOff aria-hidden />
                    <span className="sr-only">Microphone off</span>
                  </span>
                ) : null}
                {!p.cameraOn ? (
                  <span>
                    <VideoOff aria-hidden />
                    <span className="sr-only">Camera off</span>
                  </span>
                ) : null}
              </span>
              {onRemove && !p.you ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`More for ${p.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-4"
                    >
                      <Ellipsis />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="text-danger-ink focus:text-danger-ink" onClick={() => onRemove(p.participant)}>
                      <UserMinus />
                      Remove from call
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
