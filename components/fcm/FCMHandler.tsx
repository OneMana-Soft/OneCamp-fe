"use client"

import { useEffect, useRef } from "react"

/** Up to two initials from a preview's title ("Jonas Weber in #engineering"). */
function initialsOf(title: string): string {
  const who = title.split(" in ")[0] ?? ""
  return who
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}
// The Firebase SDK (lib/firebase) is fetched by the effects below, never with
// the first screen: the config check needs none of it.
import { isFirebaseConfigured } from "@/lib/push/firebaseConfig"
import { whenIdle } from "@/lib/whenIdle"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useRouter } from "next/navigation"
import { DESKTOP_OPEN_ROUTE_EVENT, isDesktopApp } from "@/lib/desktopApp"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { setWorkerUserUUID } from "@/lib/workerCommunication"
import { isDndActive } from "@/components/command/CommandActionBridge"
import { notificationRoute, NOTIFICATION_FALLBACK_ROUTE } from "@/lib/utils/notificationRoute"
import { onScreenFrom, pushIsOnScreen } from "@/lib/utils/notificationOnScreen"
import { useStore } from "react-redux"
import type { RootState } from "@/store/store"

/**
 * How long a registered push token is trusted before the app, coming back into
 * view, registers it again. The server once dropped tokens on any push error,
 * and a tab or the desktop app open all day then went without push until it was
 * reloaded (TN-BUG-14); registering is an upsert, so doing it again is harmless.
 */
export const FCM_RESYNC_MS = 15 * 60_000

export function FCMHandler() {
  const { makeRequest } = usePost()
  const router = useRouter()
  const store = useStore<RootState>()
  // When this tab last registered its token with the server (ms; 0: not yet).
  const syncedAtRef = useRef(0)
  const retryTimeoutRef = useRef<number | null>(null)

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

  // Held in a ref because the foreground listener below subscribes once and must
  // not capture the profile before it loads. A DM's route is named after the OTHER
  // participant, so resolving one needs to know who "I" am.
  const selfUUIDRef = useRef<string>("")
  // The live preview on screen, so a newer one replaces it (shell N2).
  const lastPreviewRef = useRef<{ dismiss: () => void } | null>(null)

  // Effect 1: Sync userUUID to IndexedDB for the service worker (re-runs when profile loads)
  useEffect(() => {
    const userUUID = selfProfile.data?.data?.user_uuid
    if (userUUID) {
      selfUUIDRef.current = userUUID
      setWorkerUserUUID(userUUID)
    }
  }, [selfProfile.data])

  // Effect 2: FCM setup — register SW, get token, sync with backend (with retry)
  useEffect(() => {
    // Not in the desktop app: it is told by desktop notices (Effect 4), and a
    // webview that one day offered push would notify twice.
    if (!isFirebaseConfigured || isDesktopApp()) {
      return
    }

    let isCancelled = false
    let inFlight = false
    const MAX_RETRIES = 3
    const BASE_DELAY = 3000 // 3s, 6s, 12s

    const setupFCM = async (attempt: number = 1): Promise<void> => {
      if (isCancelled || inFlight) return
      inFlight = true

      try {
        const { getFCMToken } = await import("@/lib/firebase")
        if (isCancelled) return
        const token = await getFCMToken()
        if (!token) {
          console.warn("[FCM] Token was null: permission denied or config issue")
          return // Don't retry if token is null (likely a permanent issue like permission denied or missing VAPID key)
        }

        if (isCancelled) return

        await makeRequest({
          payload: { fcm_token: token },
          apiEndpoint: PostEndpointUrl.UpdateFCMToken,
          showToast: false,
          showErrorToast: false
        })

        syncedAtRef.current = Date.now()
      } catch (e) {
        console.error(`[FCM] Setup attempt ${attempt} failed:`, e)

        if (!isCancelled && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) // 3s, 6s, 12s
          retryTimeoutRef.current = window.setTimeout(() => setupFCM(attempt + 1), delay)
        }
      } finally {
        inFlight = false
      }
    }

    // Initial setup after hydration delay: on every start of the app.
    const initialTimeout = window.setTimeout(() => setupFCM(1), BASE_DELAY)

    // And again when the app comes back into view, once the last registration is
    // older than FCM_RESYNC_MS (or never happened): a token the server dropped
    // comes back without a reload (TN-BUG-14).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isCancelled && Date.now() - syncedAtRef.current > FCM_RESYNC_MS) {
        setupFCM(1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isCancelled = true
      clearTimeout(initialTimeout)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [makeRequest])

  // Effect 3: Foreground message listener, subscribed once the page is idle
  // and the SDK has come (it is not on the first screen; a push in the first
  // moments of a visit still shows in the Inbox).
  useEffect(() => {
    if (!isFirebaseConfigured || isDesktopApp()) return

    let cancelled = false
    let unsubscribe: (() => void) | undefined
    const onPush = (payload: any) => {
      // Do Not Disturb: suppress the in-app notification toast entirely while
      // a DND window is active (set via /dnd). The push itself is still
      // recorded server-side; we just don't interrupt the user.
      if (isDndActive()) return
      // A calendar reminder shows as its own toast, with Join or Snooze,
      // from the live notice the server raises beside the push (calendar A5).
      if (payload.data?.type === "calendar" && String(payload.data?.tag ?? "").startsWith("reminder:")) return

      const title = payload.notification?.title || payload.data?.title || "New Notification"
      const body = payload.notification?.body || payload.data?.body || ""
      const icon = payload.notification?.icon || payload.data?.icon


      // One shared mapping with the service worker, so a foreground toast and a
      // background tap on the same notification can never disagree about where
      // it goes. The ref (not selfProfile directly) because this listener
      // subscribes once and would otherwise close over an unloaded profile.
      const route = notificationRoute(payload.data, selfUUIDRef.current)
      const redirectUrl = route === NOTIFICATION_FALLBACK_ROUTE ? "" : route

      // Already looking at it: the message is on screen, so a preview would
      // only cover something. By conversation and thread, never by path: a
      // channel push routes to its post, and the channel being read was
      // previewed message by message (TN-BUG-9). A page of its own (a task, a
      // doc) still matches by its path.
      const state = store.getState()
      const panel = state.rightPanel.rightPanelState
      const screen = onScreenFrom(window.location.pathname, {
        panes: state.split?.panes ?? [],
        openThread: panel.isOpen ? panel.data.postUUID || panel.data.chatMessageUUID || null : null,
      })
      if (pushIsOnScreen(payload.data, screen, selfUUIDRef.current)) return
      if (redirectUrl && window.location.pathname === redirectUrl.split("?")[0]) return

      // The live preview (design v3, shell N2): the person's avatar, who and
      // where, one line of what they said, and Reply. At most one at a time;
      // a newer one replaces it in the stack. Off while notifications are
      // paused or in focus time (isDndActive, above): the Inbox still counts.
      lastPreviewRef.current?.dismiss()
      lastPreviewRef.current = toast({
        tone: "person",
        duration: 6000,
        icon: (
          <Avatar className="size-6">
            {icon && <AvatarImage src={icon} alt="" />}
            <AvatarFallback className="bg-press text-3xs font-semibold text-ink-2">{initialsOf(title)}</AvatarFallback>
          </Avatar>
        ),
        title: <span className="block truncate">{title}</span>,
        description: body ? <span className="block truncate">{body}</span> : undefined,
        action: redirectUrl ? (
          <ToastAction altText={`Reply to ${title}`} onClick={() => router.push(redirectUrl)}>
            Reply
          </ToastAction>
        ) : undefined,
      })
    }
    const cancelIdle = whenIdle(() => {
      void import("@/lib/firebase")
        .then(({ onForegroundMessage }) => {
          if (!cancelled) unsubscribe = onForegroundMessage(onPush)
        })
        .catch((e) => console.warn("[FCM] Web push's SDK never arrived; previews stay off this visit:", e))
    }, 2000)

    return () => {
      cancelled = true
      cancelIdle()
      unsubscribe?.()
    }
  }, [router, store])

  // Effect 4: the desktop app. Its webview has no web push (Effects 2 and 3
  // stand down there): it raises native notifications from desktop notices
  // (lib/desktopNotices), and this opens the one the person came back to the
  // window for. Asking once lets the notification plugin answer for the system.
  useEffect(() => {
    if (!isDesktopApp()) return
    if (typeof Notification !== "undefined") {
      void Promise.resolve()
        .then(() => Notification.requestPermission())
        .catch(() => {})
    }
    const open = (e: Event) => {
      const route = (e as CustomEvent<unknown>).detail
      if (typeof route === "string" && route.startsWith("/app")) router.push(route)
    }
    window.addEventListener(DESKTOP_OPEN_ROUTE_EVENT, open)
    return () => window.removeEventListener(DESKTOP_OPEN_ROUTE_EVENT, open)
  }, [router])

  return null // Headless component
}
