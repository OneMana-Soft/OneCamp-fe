"use client"

import { displayNameOf } from "@/lib/personName"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import { USER_STATUS_ONLINE, type UserProfileDataInterface } from "@/types/user"

/**
 * You, as the phone draws you (design v3, Ph1 and the More sheet's You row):
 * the avatar with its presence dot, and your state on its ring. In focus time
 * a brand ring closes round it; with notifications paused a hollow pause badge
 * sits on its corner and the presence dot steps aside. Offline draws no dot,
 * never a grey one.
 */
export function PhoneSelfAvatar({
  profile,
  size = 28,
  focus = false,
  paused = false,
  ring = "var(--sheet)",
}: {
  profile?: UserProfileDataInterface
  size?: 28 | 32 | 36
  focus?: boolean
  paused?: boolean
  /** The surface under it, for the dot's and the badge's ring. */
  ring?: string
}) {
  const name = displayNameOf(profile)
  const { src } = useUserAvatar(profile?.user_profile_object_key)
  const state = useUserInfoState(profile?.user_uuid)
  const online = state?.status === USER_STATUS_ONLINE && (state?.deviceConnected || 0) > 0
  const dim = { 28: "size-7", 32: "size-8", 36: "size-9" }[size]

  return (
    <span
      data-phone-self=""
      data-focus={focus || undefined}
      data-paused={paused || undefined}
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", focus && "phone-focus-ring")}
      style={{ ["--presence-ring" as string]: ring }}
    >
      <Avatar className={dim}>
        <AvatarImage src={src} alt="" />
        <AvatarFallback className={cn("text-2xs font-semibold", getAvatarFallbackClass(name))}>{getNameInitials(name)}</AvatarFallback>
      </Avatar>
      {paused ? (
        <span data-pause-badge="" aria-hidden="true" className="phone-pause-badge">
          <svg viewBox="0 0 24 24" width="8" height="8">
            <path d="M9 6v12M15 6v12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
      ) : online ? (
        <span data-presence="" className="presence-dot" />
      ) : null}
    </span>
  )
}
