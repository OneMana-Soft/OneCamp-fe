"use client"

/**
 * Who is waiting to join, in a bar docked above the call's dock (CALLS-2),
 * for whoever may let them in while the People panel is closed: one person
 * named with Admit, several counted with Admit all, See who opening the list,
 * and Not now putting it away until someone new knocks. The stage gives it
 * its height (onHeight), so it never covers a tile's name. Loaded with the
 * first knock.
 */

import * as React from "react"
import { useTellHeight } from "@/hooks/useTellHeight"
import { knockNotice, type Knock } from "@/lib/calls/lobby"
import { X } from "@/lib/icons"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { LOBBY_GHOST, LOBBY_PRIMARY, LOBBY_SECONDARY } from "./lobbyButtons"

export function KnockBar({
  waiting,
  onAdmit,
  onAdmitAll,
  onSeeWho,
  onHide,
  onHeight,
}: {
  waiting: readonly Knock[]
  onAdmit: (k: Knock) => Promise<unknown> | void
  onAdmitAll: () => Promise<unknown> | void
  onSeeWho: () => void
  onHide: () => void
  onHeight: (px: number) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [busy, setBusy] = React.useState(false)
  useTellHeight(ref, onHeight)

  const notice = knockNotice(waiting)
  if (!notice) return null
  const one = notice.one
  const admit = () => {
    setBusy(true)
    void Promise.resolve(one ? onAdmit(one) : onAdmitAll()).finally(() => setBusy(false))
  }
  return (
    <div
      ref={ref}
      data-knock-bar=""
      className="hub-pop-down flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[14px] bg-[#1F2024] p-1.5 pl-2.5 text-[#EEEEF0] shadow-e3 ring-1 ring-inset ring-white/[0.06]"
    >
      {one ? (
        <IdentityMark variant="avatar" size={28} id={avatarSeed(one.name)} label={one.name} />
      ) : (
        <span aria-hidden className="flex shrink-0 -space-x-2">
          {waiting.slice(0, 2).map((k) => (
            <IdentityMark key={k.ticket} variant="avatar" size={28} id={avatarSeed(k.name)} label={k.name} className="ring-2 ring-[#1F2024]" />
          ))}
        </span>
      )}
      <span className="min-w-[9rem] flex-1 text-ui-sm font-medium">{notice.title}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <button type="button" className={LOBBY_SECONDARY} onClick={onSeeWho}>
          See who
        </button>
        <button type="button" className={LOBBY_PRIMARY} onClick={admit} disabled={busy} aria-label={one ? `Admit ${one.name}` : "Admit everyone waiting"}>
          {one ? "Admit" : "Admit all"}
        </button>
        <button type="button" className={`${LOBBY_GHOST} px-2 [@media(pointer:coarse)]:px-3 [&_svg]:size-4`} onClick={onHide} aria-label="Not now">
          <X aria-hidden />
        </button>
      </span>
    </div>
  )
}
