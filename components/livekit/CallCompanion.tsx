"use client"

// Another device in a call (meet-04), a part of its own (LazyCompanion): the
// green room's other ways in while a call is going on, a companion's mode on
// its stage, and the screen a device shows when its call moved to another
// device of theirs, or when a companion was put out. It only presents: the page asks the server
// (services/callCompanionService) and the server decides; a refusal is
// said under Join in its own words.

import { useState } from "react"
import { Button } from "@/components/ui/button"
// Icons every member page has loaded or none has (H7's guard): a part's icon
// that only some pages load first (the split pane's MessageSquare) gives the
// part a copy for each.
import { ArrowLeftRight, MicOff, MonitorUp } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { CompanionChoice } from "@/lib/calls/companion"
import type { MemberLifecycle } from "./LazyCompanion"
import { canShareScreen } from "./callErrors"
import { STAGE_PILL, callScreenHeight } from "./CallStage"

// The token's ask comes with the parts, so the member pages load it only with them.
export { companionToken } from "@/services/callCompanionService"

/**
 * What present-only asks the browser for: a screen, with a tab's sound but
 * never a whole screen's (the call may be playing on this computer, on the
 * device that joined), never the call's own tab, and Chrome's "Share this tab
 * instead" while presenting.
 */
const PRESENT_CAPTURE = {
  video: true,
  audio: true,
  systemAudio: "exclude",
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
} as DisplayMediaStreamOptions

export interface CompanionOffersProps {
  /** You're in this call on another device: the page's Join reads Switch here. */
  elsewhere: boolean
  joining: boolean
  onJoin: (c: CompanionChoice) => void
}

/**
 * Join as a companion (chat, hands and reactions, with no microphone, camera
 * or sound) and Present only, where this browser can share a screen (no phone
 * can): its picker opens in the press, as a browser asks for the gesture, and
 * a picker closed without a choice joins nothing.
 */
export function CompanionOffers({ elsewhere, joining, onJoin }: CompanionOffersProps) {
  const [presentable] = useState(() => canShareScreen())
  const [picking, setPicking] = useState(false)
  const present = async () => {
    setPicking(true)
    try {
      onJoin({ mode: "present", screen: await navigator.mediaDevices.getDisplayMedia(PRESENT_CAPTURE) })
    } catch {
      // Closed without a choice, or refused by the browser: nothing joined, nothing to undo.
    } finally {
      setPicking(false)
    }
  }
  const busy = joining || picking
  return (
    <div className="mt-3" data-companion-offers="">
      {elsewhere ? (
        <p role="note" className="mb-2 text-ui-sm text-ink-2 text-pretty">
          You&apos;re in this call on another device. Switch here moves you to this one, and the other leaves.
        </p>
      ) : null}
      <p className="text-meta text-ink-3">Or use this device without a microphone, camera or sound</p>
      <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
        <Button variant="secondary" className="flex-1 pointer-coarse:h-11" disabled={busy} onClick={() => onJoin({ mode: "companion" })}>
          <MicOff aria-hidden />
          Join as a companion
        </Button>
        {presentable ? (
          <Button variant="secondary" className="flex-1 pointer-coarse:h-11" disabled={busy} busy={picking} onClick={() => void present()}>
            <MonitorUp aria-hidden />
            Present only
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A companion's own stage says what it is, beside the place pill, in the
 * green room's words: the dock has no Mic or Camera and nothing plays, so a
 * hunt for Unmute never starts. Read out with the place pill.
 */
export function CompanionMode({ present }: { present: boolean }) {
  return (
    <p className={cn(STAGE_PILL, "whitespace-nowrap text-ink-2")} data-companion-mode="">
      {present ? "Presenting only" : "Companion"}
      <span aria-hidden> · </span>
      no sound here
    </p>
  )
}

/** Why: the call moved to another device (Switch here there), its person went to a breakout room, or present-only met a share hold. */
export type MovedReason = "moved" | "went_to_room" | "share_held"

/** Each reason's words. A share hold can't let present-only through: it has no attendee of its own to let through. */
const SAID: Record<MovedReason, { title: string; detail: string }> = {
  moved: {
    title: "This call moved to your other device",
    detail: "You joined it on another device, so this one left. Nothing here is listening or sending now.",
  },
  went_to_room: {
    title: "You went to a breakout room",
    detail: "This device was with you as a companion, and a companion stays in the call's main room. Join as a companion again when you're back.",
  },
  share_held: {
    title: "Screen sharing is off in this call",
    detail: "The people running the call have turned off screen sharing, so you can't present without joining. Join the call to ask them.",
  },
}

export interface CallMovedProps {
  reason: MovedReason
  /** The member page's call: Switch back after a move; a companion again, or the green room, after one was put out. */
  call: Pick<MemberLifecycle, "retry" | "reset" | "switchBack">
  /** Use here as a companion (moved only); none where there's no call to accompany. */
  companion?: (c: CompanionChoice) => void
  onBack?: () => void
  backLabel?: string
  embedded?: boolean
}

/**
 * The call went to another device of theirs (Switch here there), or a
 * companion was put out: this one says so and never joins again by itself, or the two would take the call
 * from each other in turn. On a phone its actions sit in a footer at the
 * window's foot, within the thumb's reach: sticky, as the screen is a window
 * tall and the phone's page draws it under its header and banner.
 */
export function CallMoved({ reason, call, companion, onBack, backLabel, embedded }: CallMovedProps) {
  const { title, detail } = SAID[reason]
  return (
    <div
      className={cn("dark flex w-full flex-col bg-[#0B0C0E] text-foreground sm:items-center sm:justify-center sm:p-4", callScreenHeight(embedded))}
      data-call-notice={reason}
    >
      <div className="flex flex-1 flex-col sm:w-[360px] sm:flex-none sm:rounded-[16px] sm:bg-[#1B1C1F] sm:shadow-e4">
        <div role="alert" className="flex flex-1 flex-col justify-center p-5">
          <span aria-hidden className="mb-3 grid size-10 place-items-center rounded-[12px] bg-[color-mix(in_oklab,var(--brand)_22%,transparent)] text-brand">
            <ArrowLeftRight className="size-5" />
          </span>
          <h2 className="text-title-3 font-semibold">{title}</h2>
          <p className="mt-1 text-ui text-ink-2 text-pretty">{detail}</p>
        </div>
        <div
          data-moved-actions=""
          className="sticky bottom-0 flex flex-col gap-2 border-t border-white/[0.06] bg-[#131416] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:static sm:flex-row sm:flex-wrap sm:border-0 sm:bg-transparent sm:px-5 sm:pt-0 sm:pb-5"
        >
          {reason === "moved" && companion ? (
            <Button className="pointer-coarse:h-11" onClick={() => companion({ mode: "companion" })}>
              Use here as a companion
            </Button>
          ) : null}
          {reason === "share_held" ? (
            <Button className="pointer-coarse:h-11" onClick={call.reset}>
              Join the call
            </Button>
          ) : (
            <Button variant={reason === "moved" ? "secondary" : "default"} className="pointer-coarse:h-11" onClick={reason === "moved" ? call.switchBack : call.retry}>
              {reason === "moved" ? "Switch back" : "Join as a companion again"}
            </Button>
          )}
          {onBack ? (
            <Button variant="ghost" className="pointer-coarse:h-11" onClick={onBack}>
              {backLabel ?? "Back"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
