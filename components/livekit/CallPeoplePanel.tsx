"use client"

/**
 * The list of who is in the call, in the stage's side column where the
 * in-call AI's panel is, loaded when it is first opened (a click away, so
 * none of a call's first load).
 *
 * Whoever runs the call runs it from here too (Call Control): each person's
 * part beside their name, their actions in a menu, and the call's own (mute
 * all, ask all to unmute, the lock, people joining muted) above the list.
 * Only what the server allows is offered (lib/calls/control).
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { HUE_CLASS, avatarHueClass } from "@/components/ui/graphics/hues"
import { MicOff, Mic, VideoOff, X } from "@/lib/icons"
import { callActions, personActions, type CallPart, type PersonAction } from "@/lib/calls/control"
import { personHue } from "@/lib/utils/getAvatarColor"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { cn } from "@/lib/utils/helpers/cn"
import { PersonActionsMenu } from "./callHosting"
import { personTags, type CallPerson } from "./callPeople"

const TOOL =
  "inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-white/[0.06] px-2.5 text-ui-sm font-medium text-[#EEEEF0] transition-colors hover:bg-white/[0.10] active:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-brand [@media(pointer:coarse)]:h-11 [&_svg]:size-4"

const TOOL_ICONS: Partial<Record<PersonAction["action"], React.ReactNode>> = {
  mute_all: <MicOff aria-hidden />,
  ask_all_unmute: <Mic aria-hidden />,
}

/** A lasting setting of the call as a switch row: its name, a line of help, the switch. */
function ToolSwitch({ label, help, checked, onChange }: { label: string; help?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = React.useId()
  return (
    <div className="mt-2 flex min-h-8 items-center justify-between gap-3 [@media(pointer:coarse)]:min-h-11" data-call-switch="">
      <span className="flex min-w-0 flex-col">
        <label htmlFor={id} className="cursor-pointer text-ui-sm text-ink-2">
          {label}
        </label>
        {help ? (
          <span id={`${id}-help`} className="text-meta text-ink-3">
            {help}
          </span>
        ) : null}
      </span>
      <Switch id={id} aria-describedby={help ? `${id}-help` : undefined} checked={checked} onCheckedChange={onChange} />
    </div>
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
}: {
  people: CallPerson[]
  onClose: () => void
  me?: CallPart & { identity: string }
  spotlit?: string
  settings?: { locked: boolean; muteOnEntry: boolean }
  onAction?: (a: PersonAction, target?: CallPerson) => void
  onMuteOnEntry?: (on: boolean) => void
}) {
  const titleId = React.useId()
  const toolsId = React.useId()
  const tools = me && onAction ? callActions(me, settings ?? { locked: false, muteOnEntry: false }) : []
  // One-shot actions are buttons; the lock and joining muted, which last, are switches.
  const lockable = tools.some((t) => t.action === "lock" || t.action === "unlock")
  const muteOnEntry = tools.some((t) => t.action === "mute_on_entry")
  const buttons = tools.filter((t) => t.action === "mute_all" || t.action === "ask_all_unmute")
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
      {buttons.length > 0 || lockable || muteOnEntry ? (
        <div className="shrink-0 border-b border-white/[0.06] px-3 pt-2 pb-2.5" role="group" aria-labelledby={toolsId} data-call-tools="">
          <p id={toolsId} className="mb-1.5 text-micro text-ink-3">
            Run the call
          </p>
          {buttons.length > 0 ? (
            <div className="flex gap-1.5">
              {buttons.map((t) => (
                <button key={t.action} type="button" className={TOOL} onClick={() => onAction?.(t)}>
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
        </div>
      ) : null}
      <ul aria-labelledby={titleId} className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {people.map((p) => {
          const hue = personHue(p.name || p.identity)
          const tags = personTags(p)
          const actions =
            me && onAction ? personActions(me, { identity: p.identity, role: p.role, guest: p.guest, micOn: p.micOn, cameraOn: p.cameraOn, sharing: p.sharing }, spotlit) : []
          return (
            <li key={p.identity} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 py-1.5" data-person-row="">
              <span aria-hidden className={cn(HUE_CLASS[hue], avatarHueClass(hue), "grid size-7 shrink-0 place-items-center rounded-full text-micro font-semibold leading-none")}>
                {getNameInitials(p.name)}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span data-person-name="" className="truncate text-ui-sm font-medium text-[#EEEEF0]">
                  {p.name}
                </span>
                {tags ? (
                  <span className="shrink-0 text-meta text-ink-3" data-person-tags="">
                    {tags}
                  </span>
                ) : null}
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
