"use client"

/**
 * The list of who is in the call, in the stage's side column where the
 * in-call AI's panel is, loaded when it is first opened (a click away, so
 * none of a call's first load).
 *
 * Whoever runs the call runs it from here too (Call Control): each person's
 * part beside their name, their actions in a menu, and the call's own (mute
 * all, ask all to unmute, the lock, people joining muted, what everyone else
 * may do) above the list. Only what the server allows is offered
 * (lib/calls/control). Whoever may let people in sees who waits in the lobby
 * first (CallLobbySection).
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils/helpers/cn"
import { ToolSwitch } from "./ToolSwitch"
import { CALL_PANEL_TOOL, CALL_SIDE_PANEL } from "./sidePanel"
import { ChevronRight, MicOff, Mic, VideoOff, X, Hand } from "@/lib/icons"
import { callActions, holdSwitches, personActions, type CallPart, type HoldSwitch, type PersonAction } from "@/lib/calls/control"
import type { CallHold } from "@/lib/calls/holds"
import { ix } from "@/lib/ui/interactive"
import { heldSummary } from "./callHolds"
import { CALL_SURFACE } from "./callSurface"
import type { Knock } from "@/lib/calls/lobby"
import { CallLobbySection } from "./CallLobbySection"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { PersonActionsMenu, type CallAct } from "./callHosting"
import { personTags, type CallPerson } from "./callPeople"
import { HandBadge } from "./HandBadge"
import { feedbackLabel, placeIn } from "@/lib/calls/hands"
import { InviteWordShown } from "./invite"
import { qualityNote, type QualityVerdict } from "./callQualityNotes"

const NOTHING_HELD: ReadonlySet<CallHold> = new Set()

const TOOL_ICONS: Partial<Record<PersonAction["action"], React.ReactNode>> = {
  mute_all: <MicOff aria-hidden />,
  ask_all_unmute: <Mic aria-hidden />,
  lower_all_hands: <Hand aria-hidden />,
}

/**
 * "Let everyone" as one row that says what's off for everyone and opens Meet's
 * switches (a sheet on a phone), so the panel stays a list of people first:
 * five switches above it put the first person halfway down a phone
 * (DESIGN-BUILD-18, 26 Oct).
 */
function LetEveryone({ switches, onHold }: { switches: HoldSwitch[]; onHold: (what: CallHold, held: boolean) => void }) {
  const titleId = React.useId()
  const summaryId = React.useId()
  const summary = heldSummary(switches.filter((s) => !s.on).map((s) => s.what))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Let everyone"
          aria-describedby={summaryId}
          // A step out on each side, so its hover is a row's and its words stay in line with the switches'.
          className="-mx-1.5 mt-2 flex min-h-8 w-[calc(100%+0.75rem)] items-center justify-between gap-3 rounded-[8px] px-1.5 text-left [@media(pointer:coarse)]:min-h-11"
          data-call-holds=""
          {...ix("row")}
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-ui-sm text-ink-2">Let everyone</span>
            {/* The line wraps to two rather than cutting a word, at every width (DESIGN-BUILD-19, 26 Oct). */}
            <span id={summaryId} className="line-clamp-2 text-meta text-ink-3">
              {summary}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="start" aria-labelledby={titleId} className={cn(CALL_SURFACE, "w-72 max-w-[calc(100vw-24px)] p-3")} data-call-holds-switches="">
        {/* A phone's sheet is headed as a person's is; beside the panel it's a group label. */}
        <p id={titleId} className="text-micro text-ink-3 max-sm:pt-1 max-sm:text-ui-sm max-sm:font-medium max-sm:text-[#EEEEF0]">
          Let everyone
        </p>
        {switches.map((h) => (
          <ToolSwitch key={h.what} label={h.label} checked={h.on} onChange={(on) => onHold(h.what, !on)} />
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The list: a right column like the AI's panel (#131416, r14, 12 px in from
 * the stage's edges, clear of the dock). me is your own part; without it (a
 * guest, or before the server has told the room) nobody's menu appears.
 */
export default function CallPeoplePanel({
  people,
  onClose,
  me,
  spotlit,
  settings = { locked: false, muteOnEntry: false },
  onAction,
  onMuteOnEntry,
  lobby,
  onLobbyAction,
  invite,
  quality,
  held = NOTHING_HELD,
  onHold,
  hasChat = false,
}: {
  people: CallPerson[]
  onClose: () => void
  me?: CallPart & { identity: string }
  spotlit?: string
  settings?: { locked: boolean; muteOnEntry: boolean }
  onAction?: (a: PersonAction, target?: CallPerson) => void
  onMuteOnEntry?: (on: boolean) => void
  /** Who waits in the lobby, with the server's list (CALLS-2). */
  lobby?: readonly Knock[]
  onLobbyAction?: CallAct
  /** The call's Invite, for whoever may let people in, at the head: where Zoom's Participants and Meet's People put it (calls HU13). */
  invite?: React.ReactNode
  /** Why the call stutters for each person, by identity, for whoever runs it (calls A5). */
  quality?: ReadonlyMap<string, QualityVerdict>
  /** What the call holds for everyone who doesn't run it (meet-12). */
  held?: ReadonlySet<CallHold>
  /** Holds one thing for everyone, or lets them again: the "Let everyone" switches. */
  onHold?: (what: CallHold, held: boolean) => void
  /** Whether the call has a chat to hold: a conversation's call (its thread). */
  hasChat?: boolean
}) {
  const titleId = React.useId()
  // The panel takes focus as it opens, on its heading with no ring, as a dialog does (focusSelf).
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])
  const toolsId = React.useId()
  // Raised hands come first in the list, in the queue's order (peopleOf).
  const queue = people.filter((p) => p.hand !== null).map((p) => p.identity)
  const tools = me && onAction ? callActions(me, { ...(settings ?? { locked: false, muteOnEntry: false }), hands: queue.length, held }) : []
  // One-shot actions are buttons; the lock and joining muted, which last, are switches.
  const lockable = tools.some((t) => t.action === "lock" || t.action === "unlock")
  const muteOnEntry = tools.some((t) => t.action === "mute_on_entry")
  const buttons = tools.filter((t) => t.action === "mute_all" || t.action === "ask_all_unmute" || t.action === "lower_all_hands")
  // What everyone who doesn't run the call may do: a switch each, on while they may (Meet's host management).
  const letEveryone = me && onHold ? holdSwitches(me, held, hasChat) : []
  // Who waits in the lobby, for whoever may let them in.
  const act = me?.can.has("admit") ? onLobbyAction : undefined
  const lobbySection =
    act && lobby && lobby.length > 0 ? (
      <CallLobbySection waiting={lobby} onDecide={(ticket, name, admit) => act(admit ? "admit" : "deny", { ticket, name })} onAdmitAll={() => act("admit_all")} />
    ) : null
  return (
    <aside
      aria-label="People"
      data-call-people=""
      className={CALL_SIDE_PANEL}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 ref={headingRef} tabIndex={-1} id={titleId} className="flex items-baseline gap-2 text-heading leading-tight outline-none">
          People
          <span className="text-ui-sm font-medium tabular-nums text-ink-3">{people.length}</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          {invite ? <InviteWordShown.Provider value>{invite}</InviteWordShown.Provider> : null}
          <Button data-tone="light" aria-label="Close People" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {lobbySection}
      {buttons.length > 0 || lockable || muteOnEntry || letEveryone.length > 0 ? (
        <div className="shrink-0 border-b border-white/[0.06] px-3 pt-2 pb-2.5" role="group" aria-labelledby={toolsId} data-call-tools="">
          <p id={toolsId} className="mb-1.5 text-micro text-ink-3">
            Run the call
          </p>
          {buttons.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {buttons.map((t) => (
                <button key={t.action} type="button" className={cn(CALL_PANEL_TOOL, "[&_svg]:size-4")} onClick={() => onAction?.(t)}>
                  {TOOL_ICONS[t.action]}
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          {/* Lasting states are switches: a lock is on until someone turns it off. */}
          {lockable ? (
            <ToolSwitch
              label="Lock the call"
              help="Nobody new can join"
              checked={!!settings?.locked}
              onChange={(on) => onAction?.({ action: on ? "lock" : "unlock", label: on ? "Lock call" : "Unlock call" })}
            />
          ) : null}
          {muteOnEntry && onMuteOnEntry ? <ToolSwitch label="People join muted" checked={!!settings?.muteOnEntry} onChange={(on) => onMuteOnEntry(on)} /> : null}
          {letEveryone.length > 0 && onHold ? <LetEveryone switches={letEveryone} onHold={onHold} /> : null}
        </div>
      ) : null}
      <ul aria-labelledby={titleId} className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {people.map((p) => {
          const tags = personTags(p, held)
          const actions =
            me && onAction
              ? personActions(me, { identity: p.identity, role: p.role, guest: p.guest, micOn: p.micOn, cameraOn: p.cameraOn, sharing: p.sharing, handUp: p.hand !== null, allowed: p.allowed }, spotlit, held)
              : []
          const place = placeIn(queue, p.identity)
          return (
            <li key={p.identity} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 py-1.5" data-person-row="">
              <IdentityMark variant="avatar" size={28} id={avatarSeed(p.name || p.identity)} label={p.name || p.identity} />
              {/* The name keeps its line; a sign that stays sits under it, so it never squeezes the name. */}
              <span className="flex min-w-0 flex-1 flex-col items-start">
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  <span data-person-name="" className="truncate text-ui-sm font-medium text-[#EEEEF0]">
                    {p.name}
                  </span>
                  {tags ? (
                    <span className="shrink-0 text-meta text-ink-3" data-person-tags="">
                      {tags}
                    </span>
                  ) : null}
                </span>
                {p.feedback ? (
                  <span data-person-feedback="" className="mt-0.5 rounded-[6px] bg-white/[0.08] px-1.5 py-0.5 text-micro font-medium text-[#EEEEF0]">
                    {feedbackLabel(p.feedback)}
                  </span>
                ) : null}
                <QualityNote verdict={quality?.get(p.identity)} />
              </span>
              {place !== null ? <HandBadge place={place} /> : null}
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
              <PersonActionsMenu
                name={p.name}
                actions={actions}
                onSelect={(a) => onAction?.(a, p)}
                triggerClassName="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-[#EEEEF0] focus-visible:outline-2 focus-visible:outline-brand [@media(pointer:coarse)]:size-11 [&_svg]:size-4"
              />
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

/** Under a name: why the call is suffering for them, when it is. */
function QualityNote({ verdict }: { verdict?: QualityVerdict }) {
  const note = qualityNote(verdict)
  if (!note) return null
  return (
    <span data-person-quality="" title={note.detail} className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-micro font-medium text-[#F5B544]">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#F5B544]" />
      {note.label}
      <span className="sr-only">: {note.detail}</span>
    </span>
  )
}
