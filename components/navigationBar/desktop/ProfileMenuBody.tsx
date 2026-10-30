"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useDispatch } from "react-redux"
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu"
import { displayNameOf } from "@/lib/personName"
import { BellOff, CircleUser, Focus, Keyboard, LogOut, Settings, X } from "@/lib/icons"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { useFocusTime } from "@/hooks/useFocusTime"
import { useLogout } from "@/hooks/useLogout"
import { usePost } from "@/hooks/usePost"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { pauseEndsLine, pauseLeftLabel, pausePresets } from "@/lib/notifications/pause"
import { openUI } from "@/store/slice/uiSlice"
import { clearUserEmojiStatus } from "@/store/slice/userSlice"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { AppearanceControl } from "@/components/navigationBar/appearanceControl"
import { openShortcuts } from "@/components/shortcuts/ShortcutsDialog"
import { returnFocusOnlyForKeys, watchInputModality } from "@/lib/ui/inputModality"
import { clockTime } from "@/lib/utils/date/clock"
import { FootAvatar, minutesLeft, useOwnStatus } from "@/components/navigationBar/desktop/SidebarFoot"

// The pause menu loads with its first open: the shell carried it on every page.
const PauseNotificationsDialog = dynamic(() => import("@/components/notifications/PauseNotificationsDialog").then((m) => m.PauseNotificationsDialog), { ssr: false })

/**
 * The profile menu (design v3, shell M2): 264px, r12, e3, rising from the
 * foot. Your face and email, your status as a field (a click edits it, × clears
 * it), focus, the pause presets as a submenu, profile, settings, the keyboard
 * list, Appearance (hub P2: mode and theme colour), and Sign out, in ink.
 *
 * A chunk of its own: SidebarFoot's ProfileMenu draws it from the first
 * open on, fetched when the trigger is pointed at or focused. A cold load ran
 * every hook of it once per trigger, for a menu nobody had opened (fluid-15:
 * 25-36 ms of self time).
 */
export function ProfileMenuBody() {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const profile = self.data?.data
  const dispatch = useDispatch()
  const router = useAppRouter()
  const { logout } = useLogout()
  const { pausedUntil, pause, resume } = usePauseNotifications()
  const focus = useFocusTime()
  const status = useOwnStatus(profile?.user_uuid)
  const post = usePost()
  const [pauseOpen, setPauseOpen] = useState(false)
  // Mounted from its first open on, so it can animate away.
  const [pauseUsed, setPauseUsed] = useState(false)
  if (pauseOpen && !pauseUsed) setPauseUsed(true)
  useEffect(() => watchInputModality(), [])

  const clearStatus = () => {
    if (!profile?.user_uuid) return
    dispatch(clearUserEmojiStatus({ userUUID: profile.user_uuid }))
    void post.makeRequest({ apiEndpoint: PostEndpointUrl.ClearEmojiStatus, showErrorToast: true })
  }

  const left = focus.focusUntil ? minutesLeft(focus.focusUntil, Date.now()) : ""

  return (
    <>
      <DropdownMenuContent side="top" align="start" sideOffset={6} aria-label="Profile and settings" onCloseAutoFocus={returnFocusOnlyForKeys} className="shell-menu shell-pop">
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
          <DropdownMenuItem
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm p-0 text-xs data-[highlighted]:text-ink"
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
          </DropdownMenuItem>
          {status && (
            <DropdownMenuItem asChild onSelect={(e) => { e.preventDefault(); clearStatus() }} className="grid size-6 place-items-center rounded-[6px] p-0 text-ink-3 data-[highlighted]:text-ink [&>svg]:size-3.5">
              <button type="button" aria-label="Clear status">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuItem>
          )}
        </div>
        <div className="shell-menu-sep" />
        {focus.focusUntil ? (
          <DropdownMenuItem className="shell-menu-item" onSelect={() => void focus.end()}>
            <Focus aria-hidden="true" />
            End focus time
            <span className="shell-menu-meta">{left} left</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="shell-menu-item" onSelect={() => void focus.start(60)}>
            <Focus aria-hidden="true" />
            Start focus time
            <span className="shell-menu-meta">1 h</span>
            <span data-kbd-hint="" className="kbd ml-1.5">F</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="shell-menu-item" textValue={pausedUntil ? "Notifications paused" : "Pause notifications"}>
            <BellOff aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{pausedUntil ? "Notifications paused" : "Pause notifications"}</span>
            {/* How long is left, as the hub's pill (pauseLeftLabel). */}
            {pausedUntil ? (
              <span data-pause-pill="" title={`Paused until ${formatSendAt(pausedUntil)}`} className="inline-flex h-5 items-center rounded-[10px] bg-camp-sun-tint px-2 text-micro font-medium tabular-nums text-camp-sun-ink">
                {pauseLeftLabel(pausedUntil).replace("Paused · ", "")} left
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent sideOffset={6} alignOffset={-4} className="shell-menu shell-pop">
            {pausedUntil && (
              <>
                <DropdownMenuItem className="shell-menu-item" onSelect={() => void resume()}>Resume notifications</DropdownMenuItem>
                <div className="shell-menu-sep" />
              </>
            )}
            {/* The pause dialog's own presets (lib/notifications/pause), each
                saying when it ends: "For 1 hour", until 8:10 PM. */}
            {pausePresets(new Date()).map((p) => (
              <DropdownMenuItem key={p.label} className="shell-menu-item" onSelect={() => void pause(p.at)}>
                {p.label}
                <span className="shell-menu-meta tabular-nums">{pauseEndsLine(p, clockTime)}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="shell-menu-item" onSelect={() => setPauseOpen(true)}>Custom…</DropdownMenuItem>
            <div className="shell-menu-sep" />
            <DropdownMenuItem className="shell-menu-item" onSelect={() => router.push("/app/settings/notifications")}>Notification schedule…</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <div className="shell-menu-sep" />
        <DropdownMenuItem className="shell-menu-item" onSelect={() => dispatch(openUI({ key: "selfUserProfile" }))}>
          <CircleUser aria-hidden="true" />
          Your profile
        </DropdownMenuItem>
        <DropdownMenuItem className="shell-menu-item" onSelect={() => router.push("/app/settings/profile")}>
          <Settings aria-hidden="true" />
          Settings
          <span data-kbd-hint="" className="kbd ml-auto">,</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="shell-menu-item" onSelect={() => openShortcuts()}>
          <Keyboard aria-hidden="true" />
          Keyboard shortcuts
          <span data-kbd-hint="" className="kbd ml-auto">?</span>
        </DropdownMenuItem>
        {/* Appearance (hub P2): Light, Dark and System as one sliding
            segmented control, and the six theme colours under it. */}
        <div className="shell-menu-sep" />
        <AppearanceControl
          more={
            <DropdownMenuItem asChild onSelect={() => router.push("/app/settings/profile#profile-appearance")} className="shrink-0 rounded-sm px-1 py-0 text-meta text-ink-3 hover:text-foreground data-[highlighted]:text-foreground">
              <button type="button" data-more-colours="">
                More colours
              </button>
            </DropdownMenuItem>
          }
        />
        <div className="shell-menu-sep" />
        {/* Sign out ends nothing and loses nothing: neutral ink, as Linear
            and Slack draw it. Danger ink is for what destroys (hub critic). */}
        <DropdownMenuItem className="shell-menu-item" onSelect={logout}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
      {pauseOpen || pauseUsed ? <PauseNotificationsDialog open={pauseOpen} onOpenChange={setPauseOpen} /> : null}
    </>
  )
}
