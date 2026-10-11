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
import { getFCMToken, isFirebaseConfigured, messaging } from "@/lib/firebase"
import { onMessage } from "firebase/messaging"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useRouter } from "next/navigation"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { setWorkerUserUUID } from "@/lib/workerCommunication"
import { isDndActive } from "@/components/command/CommandActionBridge"
import { notificationRoute, NOTIFICATION_FALLBACK_ROUTE } from "@/lib/utils/notificationRoute"

export function FCMHandler() {
  const { makeRequest } = usePost()
  const router = useRouter()
  const hasSyncedRef = useRef(false)
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
    if (!isFirebaseConfigured) {
      return
    }

    let isCancelled = false
    const MAX_RETRIES = 3
    const BASE_DELAY = 3000 // 3s, 6s, 12s

    const setupFCM = async (attempt: number = 1): Promise<void> => {
      if (isCancelled || hasSyncedRef.current) return

      try {
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

        hasSyncedRef.current = true
      } catch (e) {
        console.error(`[FCM] Setup attempt ${attempt} failed:`, e)

        if (!isCancelled && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) // 3s, 6s, 12s
          retryTimeoutRef.current = window.setTimeout(() => setupFCM(attempt + 1), delay)
        }
      }
    }

    // Initial setup after hydration delay
    const initialTimeout = window.setTimeout(() => setupFCM(1), BASE_DELAY)

    // Recovery: retry when app returns to foreground if setup hasn't completed
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !hasSyncedRef.current && !isCancelled) {
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

  // Effect 3: Foreground message listener (runs once when messaging is available)
  useEffect(() => {
    if (!messaging) return

    const unsubscribe = onMessage(messaging, (payload: any) => {
      // Do Not Disturb: suppress the in-app notification toast entirely while
      // a DND window is active (set via /dnd). The push itself is still
      // recorded server-side; we just don't interrupt the user.
      if (isDndActive()) return

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
      // only cover something.
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
    });

    return () => {
      unsubscribe()
    }
  }, [router])

  return null // Headless component
}
