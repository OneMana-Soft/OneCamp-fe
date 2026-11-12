"use client"

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import type { CompanionChoice } from "@/lib/calls/companion"
import { CallEndScreen } from "./CallEndScreen"
import { callScreenHeight } from "./CallStage"
import { PreJoin } from "./PreJoin"
import { useCallLifecycle, type CallLifecycle } from "./useCallLifecycle"

type Parts = typeof import("./CallCompanion")
const load = () => import("./CallCompanion")
// While their code comes: the offers' room (Cancel stays put), the moved screen's dark ground.
const Offers = lazyPart<ComponentProps<Parts["CompanionOffers"]>>(() => load().then((m) => m.CompanionOffers), {
  placeholder: () => <div aria-hidden className="mt-3 min-h-[68px]" />,
}).Part
const Moved = lazyPart<ComponentProps<Parts["CallMoved"]>>(() => load().then((m) => m.CallMoved), {
  placeholder: ({ embedded }) => <div aria-hidden className={`dark w-full bg-[#0B0C0E] ${callScreenHeight(embedded)}`} />,
}).Part
/** A companion's mode on its stage: VideoConference's companionMode. */
export const CompanionMode = lazyPart<ComponentProps<Parts["CompanionMode"]>>(() => load().then((m) => m.CompanionMode)).Part

type Own = (language?: string) => Promise<string>
export type MemberLifecycle = CallLifecycle & { joinWith(own: Own, c: CompanionChoice): void; switchBack(): void; screen?: MediaStream }

/**
 * A companion's join mints its own token, and so does Try again, until Join
 * or Switch back joins them as themselves. Present only's screen stops with
 * the call or the page, so Try again comes back as a companion.
 */
export function useMemberCallLifecycle(...[mint, start]: Parameters<typeof useCallLifecycle>): MemberLifecycle {
  const own = useRef<Own | null>(null)
  const [shown, show] = useState<MediaStream>()
  const life = useCallLifecycle((c) => (own.current ? own.current(c.language) : mint(c)), start)
  const { phase, join: go, retry: again } = life
  const screen = phase === "joining" || phase === "in-call" ? shown : undefined
  useEffect(() => () => screen?.getTracks().forEach((t) => t.stop()), [screen])
  const as = useCallback((o: Own | null, s?: MediaStream) => {
    own.current = o
    show(s)
  }, [])
  const join = useCallback<CallLifecycle["join"]>(
    (c) => {
      as(null)
      go(c)
    },
    [as, go],
  )
  const retry = useCallback(() => {
    show(undefined)
    again()
  }, [again])
  return {
    ...life,
    join,
    retry,
    joinWith(o, c) {
      as(o, c.screen)
      go({ audioEnabled: false, videoEnabled: false })
    },
    switchBack() {
      as(null)
      again()
    },
    screen,
  }
}

export interface Companion {
  elsewhere: boolean
  onJoin: (c: CompanionChoice) => void
}

/** You're in this call on another device: the server's read names your account in it. */
export function inElsewhere(people: readonly { user_uuid?: string; in_call: boolean }[] | undefined, you: string | undefined): boolean {
  return !!you && !!people?.some((p) => p.in_call && p.user_uuid === you)
}

/** None without a call going on to accompany. */
export function memberCompanion(
  life: Pick<MemberLifecycle, "joinWith">,
  session: { id?: string; people?: readonly { user_uuid?: string; in_call: boolean }[] } | null | undefined,
  you: string | undefined,
): Companion | undefined {
  const id = session?.id
  if (!id) return undefined
  return { elsewhere: inElsewhere(session.people, you), onJoin: (c) => life.joinWith((l) => load().then((m) => m.companionToken(id, l)), c) }
}

export function MemberPreJoin({ companion: c, ...props }: ComponentProps<typeof PreJoin> & { companion?: Companion }) {
  if (!c || !props.live) return <PreJoin {...props} />
  const more = <Offers elsewhere={c.elsewhere} joining={!!props.joining} onJoin={c.onJoin} />
  return <PreJoin {...props} joinLabel={c.elsewhere ? "Switch here" : props.joinLabel} more={more} />
}

/** The end screen, or the moved one: the call moved to their other device, its companion went to a breakout room, or present only met a share hold. */
export function MemberCallEnd({
  companion,
  ...props
}: ComponentProps<typeof CallEndScreen> & { call: Pick<MemberLifecycle, "switchBack">; companion?: (c: CompanionChoice) => void }) {
  const { end } = props.call
  const r = end?.removed?.reason
  const why = end?.moved ? "moved" : r === "went_to_room" || r === "share_held" ? r : undefined
  return why ? <Moved {...props} reason={why} companion={companion} /> : <CallEndScreen {...props} />
}
