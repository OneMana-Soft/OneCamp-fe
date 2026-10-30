"use client"
import { lazyPart } from "@/lib/lazy/lazyPart"

import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { displayNameOf } from "@/lib/personName"
import { SlidersHorizontal } from "@/lib/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { useFocusTime, focusProgress } from "@/hooks/useFocusTime"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import type { RootState } from "@/store/store"
import { GetEndpointUrl } from "@/services/endPoints"
import { USER_STATUS_ONLINE, type UserProfileInterface } from "@/types/user"
import { pauseLeftLabel } from "@/lib/notifications/pause"
import { clockTime } from "@/lib/utils/date/clock"
import { ix } from "@/lib/ui/interactive"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { runWhenSettled } from "@/lib/ui/whenQuiet"
import { warmProfileSections } from "@/components/profile/profileSections"

/** The person's own status: the emoji and words, unless it has expired. */
export function useOwnStatus(userUUID: string | undefined) {
  const status = useSelector((s: RootState) => (userUUID ? s.users.usersStatus[userUUID]?.emojiStatus : undefined))
  const cached = status?.status_user_emoji_id ? status : null
  const expired = useStatusIsExpired(cached)
  const active = cached && !expired ? cached : null
  const emojiData = useEmojiMartData(!!active?.status_user_emoji_id)
  const emoji = findEmojiMartEmojiByEmojiID(emojiData.data, active?.status_user_emoji_id ?? "")
  const native = (emoji as { skins?: { native?: string }[] } | undefined)?.skins?.[0]?.native
  return active ? { emoji: native, text: active.status_user_emoji_desc || "" } : null
}

/** Minutes left as a person says it: "38 min", "1 h 20 min". Pure. */
export function minutesLeft(until: Date, now: number): string {
  const m = Math.max(0, Math.round((until.getTime() - now) / 60_000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}


/** A face with presence, and in focus the ring that closes as the block ends. */
export function FootAvatar({
  profile,
  size,
  focus,
  paused,
}: {
  profile?: UserProfileInterface["data"]
  size: 28 | 36
  focus?: { fraction: number; label: string; done: boolean } | null
  paused?: boolean
}) {
  const info = useUserInfoState(profile?.user_uuid)
  const { src } = useUserAvatar(profile?.user_profile_object_key)
  const name = displayNameOf(profile)
  const online = info?.status === USER_STATUS_ONLINE && (info?.deviceConnected || 0) > 0
  const face = (
    <span className="relative flex shrink-0">
      <Avatar className={size === 28 ? "h-7 w-7" : "h-9 w-9"}>
        <AvatarImage src={src} />
        <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(name))}>{getNameInitials(name)}</AvatarFallback>
      </Avatar>
      {paused ? (
        <span data-pause-badge="" className="absolute -bottom-0.5 -right-0.5 grid size-3 place-items-center rounded-full bg-sheet text-ink-3 shell-pause-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-[7px]"><path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="5" /></svg>
        </span>
      ) : online && !focus ? (
        <span data-presence="" className="presence-dot [--presence-ring:var(--frame)]" />
      ) : null}
    </span>
  )
  if (!focus) return face
  const r = 15.5
  return (
    <span className="shell-focus-ring" data-done={focus.done ? "true" : undefined} role="img" aria-label={focus.label}>
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--line-2)" strokeWidth="2" />
        <circle
          className="shell-focus-arc"
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={100 - Math.round(focus.fraction * 100)}
          transform="rotate(-90 17 17)"
        />
      </svg>
      {face}
    </span>
  )
}

/** Your own 28px face with presence, for the rail. */
export function SelfAvatar() {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  return <FootAvatar profile={self.data?.data} size={28} />
}

/**
 * The sidebar's foot (design v3, shell S12): your face with presence, your
 * name, a status line, and the profile menu, which rises from it. In focus
 * the face wears the ring that closes as the block ends, the line reads
 * "In focus until 4:00 PM" and End replaces the sliders; paused shows a
 * hollow pause badge and "Paused · 1 h left".
 */
export function SidebarFoot() {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const profile = self.data?.data
  const status = useOwnStatus(profile?.user_uuid)
  const info = useUserInfoState(profile?.user_uuid)
  const { pausedUntil } = usePauseNotifications()
  const focus = useFocusTime()
  const [now, setNow] = useState(() => Date.now())
  // The ring steps each minute.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  // Read again when the block or the pause changes. Their moments as numbers:
  // a Date is a new value to an effect on every render.
  const focusUntilMs = focus.focusUntil?.getTime() ?? 0
  const pausedUntilMs = pausedUntil?.getTime() ?? 0
  useEffect(() => setNow(Date.now()), [focusUntilMs, pausedUntilMs])

  const inFocus = !!focus.focusUntil
  const fraction = focusProgress(focus.focusStart, focus.focusUntil, now)
  const left = focus.focusUntil ? minutesLeft(focus.focusUntil, now) : ""
  const pctLeft = Math.round((1 - fraction) * 100)
  const away = info?.status === "away"

  let line: React.ReactNode
  if (inFocus && focus.focusUntil) {
    line = (
      <span className="shell-status-in" key="focus">
        <b className="font-medium text-brand-text">In focus</b> until {clockTime(focus.focusUntil)}
      </span>
    )
  } else if (pausedUntil) {
    // Short enough for the foot's column: "Notifications paused · 1 h" lost
    // its "1 h" to the ellipsis, the one part that changes. The pause badge on
    // the face says what is paused, and the time is written as the profile
    // menu's pill writes it ("Paused · 1 h 20 m left").
    line = `${pauseLeftLabel(pausedUntil, new Date(now))} left`
  } else if (away) {
    line = "Away"
  } else if (status) {
    line = `${status.emoji ? status.emoji + " " : ""}${status.text}`.trim() || "Active"
  } else {
    line = "Active"
  }

  const avatarFocus = inFocus
    ? { fraction, done: fraction >= 1, label: `In focus until ${focus.focusUntil ? clockTime(focus.focusUntil) : ""}, ${pctLeft} % left` }
    : null

  return (
    <div className="shell-foot" data-sidebar-foot="">
      <ProfileMenu>
        <button type="button" aria-label="Profile and settings" className="shell-foot-btn">
          <FootAvatar profile={profile} size={28} focus={avatarFocus} paused={!inFocus && !!pausedUntil} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-[18px] text-ink">{displayNameOf(profile) || " "}</span>
            <span className="block truncate text-2xs leading-[14px] text-ink-3">{line}</span>
          </span>
        </button>
      </ProfileMenu>
      {inFocus ? (
        <button
          type="button"
          onClick={() => void focus.end()}
          disabled={focus.busy}
          aria-label={`End focus time, ${left} left`}
          className="h-6 shrink-0 rounded-[6px] bg-raised px-2 text-2xs font-medium text-ink shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          End
        </button>
      ) : (
        <ProfileMenu>
          <button type="button" aria-label="Open the profile menu" {...ix("icon")} className="shell-icon-btn">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </ProfileMenu>
      )}
    </div>
  )
}


/**
 * The profile menu: its trigger, and its body (ProfileMenuBody) from the first
 * open on. The body is a chunk of its own, fetched when the trigger is pointed
 * at or focused, so a cold load runs none of its hooks (fluid-15).
 */
const profileMenu = lazyPart(() => import("@/components/navigationBar/desktop/ProfileMenuBody").then((m) => m.ProfileMenuBody), {
  placeholder: MenuComing,
  failed: MenuFailed,
})
/** Fetches the menu's code ahead of its first open: for the shell when the page is quiet, and for tests. */
export const warmProfileMenu = profileMenu.warm

export function ProfileMenu({ children }: { children: React.ReactNode }) {
  const [used, setUsed] = useState(false)
  const warm = () => void profileMenu.warm()
  // Settings opens from here, and its code came at the press (fluid-14): the
  // menu's body and Your profile's sections come once the first screen has
  // settled. Their route's payload is the right panel's preload (PRELOAD_ROUTES).
  useEffect(() => runWhenSettled([() => profileMenu.warm(), () => warmProfileSections()]), [])
  return (
    <DropdownMenu onOpenChange={(open) => open && setUsed(true)}>
      <DropdownMenuTrigger asChild onPointerEnter={warm} onFocus={warm}>
        {children}
      </DropdownMenuTrigger>
      {used ? <profileMenu.Part /> : null}
    </DropdownMenu>
  )
}

/** The menu's room while its code comes, in its rows' shape: it opens at once, and fills in without a jump. */
function MenuComing() {
  return (
    <DropdownMenuContent side="top" align="start" sideOffset={6} aria-label="Profile and settings" aria-busy="true" className="shell-menu shell-pop">
      <div role="status" aria-label="Loading the menu" className="h-[264px] overflow-hidden px-2 pt-2">
        <SkeletonRows rows={7} lines={1} />
      </div>
    </DropdownMenuContent>
  )
}

/**
 * The menu's code couldn't come: it says so, as the invite form does (no read
 * of the app's failed, so it doesn't say one did), and tries again.
 */
function MenuFailed({ retry }: { retry: () => void }) {
  return (
    <DropdownMenuContent side="top" align="start" sideOffset={6} aria-label="Profile and settings" className="shell-menu shell-pop">
      <p role="alert" className="px-2 pb-1 pt-2 text-ui-sm text-ink-2">
        Couldn&apos;t open the menu. Check your connection.
      </p>
      <DropdownMenuItem
        className="shell-menu-item"
        onSelect={(e) => {
          e.preventDefault()
          retry()
        }}
      >
        Try again
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
