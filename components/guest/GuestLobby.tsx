"use client"

import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A guest waiting in a meeting's lobby (calls CALLS-2): the people running
 * the call know they're here and let them in or not. The page asks the
 * server meanwhile; Leave gives up.
 *
 * On a phone it is the page itself, not a box over a blurred one: who they
 * are, that they're waiting, a quiet spinner, and Leave pinned at the foot
 * (DESIGN-BUILD-2, 20 Oct). On a computer it is a card over the green room.
 *
 * It fills the screen, not the page under it: the green room can be taller
 * than a phone's screen (HU13's "Join as yourself" line made it so), and a
 * wait as tall as that page put Leave below the screen (DESIGN-BUILD-12,
 * 24 Oct).
 */
export function GuestLobby({ name, title, onLeave }: { name: string; title?: string; onLeave: () => void }) {
  return (
    <div
      data-guest-lobby=""
      className="fixed inset-0 z-10 flex flex-col bg-background sm:items-center sm:justify-center sm:bg-background/80 sm:px-4 sm:backdrop-blur-sm"
    >
      <div className="flex flex-1 flex-col px-6 pt-16 pb-[max(16px,env(safe-area-inset-bottom))] text-center sm:w-full sm:max-w-sm sm:flex-none sm:rounded-[16px] sm:bg-surface sm:p-6 sm:shadow-e3">
        <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center sm:flex-none">
          {name ? (
            <>
              {/* Their face: 56px on a phone, 44 from sm up. */}
              <IdentityMark variant="avatar" size={56} id={avatarSeed(name)} label={name} className="sm:hidden" />
              <IdentityMark variant="avatar" size={44} id={avatarSeed(name)} label={name} className="hidden sm:flex" />
              <p className="mt-3 text-ui font-medium text-ink" data-guest-lobby-name="">
                {name}
              </p>
            </>
          ) : null}
          {title ? (
            <p className="mt-4 max-w-xs truncate text-ui-sm text-ink-3" data-guest-lobby-title="">
              {title}
            </p>
          ) : null}
          <h2 className={cn("flex items-center gap-2 text-heading text-ink", title ? "mt-1" : "mt-4")}>
            <Loader2 aria-hidden className="size-4 text-ink-3 motion-safe:animate-spin" />
            Waiting to be let in
          </h2>
          <p className="mt-1.5 max-w-xs text-pretty text-ui text-ink-2">
            The people running the meeting can see you&apos;re here. You&apos;ll join as soon as one of them lets you in.
          </p>
        </div>
        <Button variant="outline" className="mt-6 h-11 w-full sm:mt-5 sm:h-9 sm:w-auto sm:self-center" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  )
}
