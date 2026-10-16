"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useDispatch, useSelector } from "react-redux"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { displayNameOf } from "@/lib/personName"
import { BellOff, ChevronRight, CircleUser, Focus, Keyboard, LogOut, Settings, SlidersHorizontal, X } from "@/lib/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { useFocusTime, focusProgress } from "@/hooks/useFocusTime"
import { useLogout } from "@/hooks/useLogout"
import { usePost } from "@/hooks/usePost"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { pauseEndsLine, pausePresets } from "@/lib/notifications/pause"
import { cn } from "@/lib/utils/helpers/cn"
import { openUI } from "@/store/slice/uiSlice"
import { clearUserEmojiStatus } from "@/store/slice/userSlice"
import type { RootState } from "@/store/store"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { USER_STATUS_ONLINE, type UserProfileInterface } from "@/types/user"
import { PauseNotificationsDialog, pauseLeftLabel } from "@/components/notifications/PauseNotificationsDialog"
import { AppearanceControl } from "@/components/navigationBar/appearanceControl"
import { openShortcuts } from "@/components/shortcuts/ShortcutsDialog"
import { returnFocusOnlyForKeys, watchInputModality } from "@/lib/ui/inputModality"
import { clockTime } from "@/lib/utils/date/clock"

/** The person's own status: the emoji and words, unless it has expired. */
function useOwnStatus(userUUID: string | undefined) {
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
function FootAvatar({
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
          <button type="button" aria-label="Open the profile menu" className="shell-icon-btn">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </ProfileMenu>
      )}
    </div>
  )
}


/**
 * The profile menu (design v3, shell M2): 264px, r12, e3, rising from the
 * foot. Your face and email, your status as a field (a click edits it, × clears
 * it), focus, the pause presets as a submenu, profile, settings, the keyboard
 * list, Appearance (hub P2: mode and theme colour), and Sign out, in ink.
 */
export function ProfileMenu({ children }: { children: React.ReactNode }) {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const profile = self.data?.data
  const dispatch = useDispatch()
  const router = useRouter()
  const { logout } = useLogout()
  const { pausedUntil, pause, resume } = usePauseNotifications()
  const focus = useFocusTime()
  const status = useOwnStatus(profile?.user_uuid)
  const post = usePost()
  const [pauseOpen, setPauseOpen] = useState(false)
  useEffect(() => watchInputModality(), [])

  const clearStatus = () => {
    if (!profile?.user_uuid) return
    dispatch(clearUserEmojiStatus({ userUUID: profile.user_uuid }))
    void post.makeRequest({ apiEndpoint: PostEndpointUrl.ClearEmojiStatus, showErrorToast: true })
  }

  const left = focus.focusUntil ? minutesLeft(focus.focusUntil, Date.now()) : ""

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>{children}</Menu.Trigger>
        <Menu.Portal>
          <Menu.Content side="top" align="start" sideOffset={6} aria-label="Profile and settings" onCloseAutoFocus={returnFocusOnlyForKeys} className="shell-menu shell-pop z-[var(--z-dropdown)]">
            <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-2">
              <FootAvatar profile={profile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{displayNameOf(profile)}</div>
                <div className="truncate text-2xs text-ink-3">{profile?.user_email_id}</div>
                {/* Your status as a chip under your name (hub P2); the field
                    below edits or clears it. */}
                {status?.text ? (
                  <span data-account-status="" className="hub-chip-rest mt-1 inline-flex h-[22px] max-w-full items-center gap-1 rounded-[11px] px-2 text-meta text-ink-2">
                    {status.emoji ? <span aria-hidden>{status.emoji}</span> : null}
                    <span className="truncate">{status.text}</span>
                  </span>
                ) : null}
              </div>
            </div>
            {/* The status as a field: a click opens it to edit, × clears it. */}
            <div className="mx-1 mb-1.5 flex h-8 items-center gap-2 rounded-md bg-sunken pl-2 pr-1 shell-field-ring [@media(pointer:coarse)]:h-11">
              <Menu.Item
                className="flex min-w-0 flex-1 cursor-default items-center gap-2 rounded-sm text-xs outline-none data-[highlighted]:text-ink"
                onSelect={() => dispatch(openUI({ key: "userStatusUpdate", data: { userUUID: "" } }))}
              >
                {status ? (
                  <>
                    {status.emoji && <span className="text-sm leading-none">{status.emoji}</span>}
                    <span className="truncate text-ink">{status.text || "Status set"}</span>
                  </>
                ) : (
                  <span className="truncate text-ink-3">Set a status</span>
                )}
              </Menu.Item>
              {status && (
                <Menu.Item asChild onSelect={(e) => { e.preventDefault(); clearStatus() }}>
                  <button type="button" aria-label="Clear status" className="grid size-6 place-items-center rounded-[6px] text-ink-3 outline-none data-[highlighted]:bg-press data-[highlighted]:text-ink">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </Menu.Item>
              )}
            </div>
            <div className="shell-menu-sep" />
            {focus.focusUntil ? (
              <Menu.Item className="shell-menu-item" onSelect={() => void focus.end()}>
                <Focus aria-hidden="true" />
                End focus time
                <span className="shell-menu-meta">{left} left</span>
              </Menu.Item>
            ) : (
              <Menu.Item className="shell-menu-item" onSelect={() => void focus.start(60)}>
                <Focus aria-hidden="true" />
                Start focus time
                <span className="shell-menu-meta">1 h</span>
                <span data-kbd-hint="" className="kbd ml-1.5">F</span>
              </Menu.Item>
            )}
            <Menu.Sub>
              <Menu.SubTrigger className="shell-menu-item">
                <BellOff aria-hidden="true" />
                {pausedUntil ? "Notifications paused" : "Pause notifications"}
                {/* How long is left, as the hub's pill (pauseLeftLabel). */}
                {pausedUntil ? (
                  <span data-pause-pill="" title={`Paused until ${formatSendAt(pausedUntil)}`} className="ml-auto inline-flex h-5 items-center rounded-[10px] bg-camp-sun-tint px-2 text-micro font-medium tabular-nums text-camp-sun-ink">
                    {pauseLeftLabel(pausedUntil).replace("Paused · ", "")} left
                  </span>
                ) : null}
                <ChevronRight className={cn("!h-3.5 !w-3.5", pausedUntil ? "!ml-1" : "!ml-auto")} aria-hidden="true" />
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent sideOffset={6} alignOffset={-4} collisionPadding={8} className="shell-menu shell-pop z-[var(--z-dropdown)] !w-[264px]">
                  {pausedUntil && (
                    <>
                      <Menu.Item className="shell-menu-item" onSelect={() => void resume()}>Resume notifications</Menu.Item>
                      <div className="shell-menu-sep" />
                    </>
                  )}
                  {/* The pause dialog's own presets (lib/notifications/pause), each
                      saying when it ends: "For 1 hour", until 8:10 PM. */}
                  {pausePresets(new Date()).map((p) => (
                    <Menu.Item key={p.label} className="shell-menu-item" onSelect={() => void pause(p.at)}>
                      {p.label}
                      <span className="shell-menu-meta tabular-nums">{pauseEndsLine(p, clockTime)}</span>
                    </Menu.Item>
                  ))}
                  <Menu.Item className="shell-menu-item" onSelect={() => setPauseOpen(true)}>Custom…</Menu.Item>
                  <div className="shell-menu-sep" />
                  <Menu.Item className="shell-menu-item" onSelect={() => router.push("/app/settings/notifications")}>Notification schedule…</Menu.Item>
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
            <div className="shell-menu-sep" />
            <Menu.Item className="shell-menu-item" onSelect={() => dispatch(openUI({ key: "selfUserProfile" }))}>
              <CircleUser aria-hidden="true" />
              Your profile
            </Menu.Item>
            <Menu.Item className="shell-menu-item" onSelect={() => router.push("/app/settings")}>
              <Settings aria-hidden="true" />
              Settings
              <span data-kbd-hint="" className="kbd ml-auto">,</span>
            </Menu.Item>
            <Menu.Item className="shell-menu-item" onSelect={() => openShortcuts()}>
              <Keyboard aria-hidden="true" />
              Keyboard shortcuts
              <span data-kbd-hint="" className="kbd ml-auto">?</span>
            </Menu.Item>
            {/* Appearance (hub P2): Light, Dark and System as one sliding
                segmented control, and the six theme colours under it. */}
            <div className="shell-menu-sep" />
            <AppearanceControl
              more={
                <Menu.Item asChild onSelect={() => router.push("/app/settings/profile#profile-appearance")}>
                  <button type="button" data-more-colours="" className="shrink-0 rounded-sm text-meta text-ink-3 outline-none hover:text-foreground focus-visible:text-foreground data-[highlighted]:text-foreground">
                    More colours
                  </button>
                </Menu.Item>
              }
            />
            <div className="shell-menu-sep" />
            {/* Sign out ends nothing and loses nothing: neutral ink, as Linear
                and Slack draw it. Danger ink is for what destroys (hub critic). */}
            <Menu.Item className="shell-menu-item" onSelect={logout}>
              <LogOut aria-hidden="true" />
              Sign out
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <PauseNotificationsDialog open={pauseOpen} onOpenChange={setPauseOpen} />
    </>
  )
}
