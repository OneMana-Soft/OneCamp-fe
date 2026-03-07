"use client"

import React, { useEffect, useRef } from "react"
import { getFCMToken, isFirebaseConfigured, messaging } from "@/lib/firebase"
import { onMessage } from "firebase/messaging"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { toast } from "@/hooks/use-toast"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { useRouter } from "next/navigation"

import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { setWorkerUserUUID } from "@/lib/workerCommunication"

export function FCMHandler() {
  const { makeRequest } = usePost()
  const router = useRouter()
  const hasSyncedRef = useRef(false)
  const retryTimeoutRef = useRef<number | null>(null)

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

  // Effect 1: Sync userUUID to IndexedDB for the service worker (re-runs when profile loads)
  useEffect(() => {
    const userUUID = selfProfile.data?.data?.user_uuid
    if (userUUID) {
      setWorkerUserUUID(userUUID)
    }
  }, [selfProfile.data])

  // Effect 2: FCM setup — register SW, get token, sync with backend (with retry)
  useEffect(() => {
    if (!isFirebaseConfigured) {
      console.log("[FCM] Skipped: Firebase not configured")
      return
    }

    let isCancelled = false
    const MAX_RETRIES = 3
    const BASE_DELAY = 3000 // 3s, 6s, 12s

    const setupFCM = async (attempt: number = 1): Promise<void> => {
      if (isCancelled || hasSyncedRef.current) return

      try {
        console.log(`[FCM] Setup attempt ${attempt}/${MAX_RETRIES}`)

        const token = await getFCMToken()
        if (!token) {
          console.warn("[FCM] Token was null — permission denied or config issue")
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
        console.log("[FCM] Token synced with backend ✓")
      } catch (e) {
        console.error(`[FCM] Setup attempt ${attempt} failed:`, e)

        if (!isCancelled && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) // 3s, 6s, 12s
          console.log(`[FCM] Retrying in ${delay / 1000}s...`)
          retryTimeoutRef.current = window.setTimeout(() => setupFCM(attempt + 1), delay)
        }
      }
    }

    // Initial setup after hydration delay
    const initialTimeout = window.setTimeout(() => setupFCM(1), BASE_DELAY)

    // Recovery: retry when app returns to foreground if setup hasn't completed
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !hasSyncedRef.current && !isCancelled) {
        console.log("[FCM] App foregrounded — retrying setup")
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
      console.log("[FCM] Foreground message received:", payload)
      
      const title = payload.notification?.title || payload.data?.title || "New Notification"
      const body = payload.notification?.body || payload.data?.body || ""
      const icon = payload.notification?.icon || payload.data?.icon
      const type = payload.data?.type
      const threadId = payload.data?.thread_id
      const typeId = payload.data?.type_id

      let redirectUrl = ""
      if (type === 'chat' ) {
        redirectUrl = `/app/chat/${threadId}`
      } else if(type === 'chat_reaction' || type === 'chat_comment') {
        redirectUrl = `/app/chat/${threadId}`
      } else if (type === 'task' || type === 'task_comment') {
        redirectUrl = `/app/tasks/${threadId}`
      } else if (type === 'channel' || type === 'post_comment') {
        redirectUrl = `/app/channel/${typeId}/${threadId}`
      }

      toast({
        variant: "notification" as any,
        duration: 4000,
        title: (
          <div 
            className="flex items-center gap-3 w-full cursor-pointer -m-1 p-1"
            onClick={() => {
              if (redirectUrl) router.push(redirectUrl)
            }}
            role="button"
            tabIndex={0}
          >
            <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border/50">
              {icon && <AvatarImage src={icon} alt={title} />}
              <AvatarFallback className="bg-muted">
                <img src="/icons/icon-circle-512.png" alt="OneCamp" className="h-full w-full object-contain" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{title}</p>
              {body && (
                <p className="text-xs text-muted-foreground leading-snug mt-0.5 truncate">{body}</p>
              )}
            </div>
            {redirectUrl && (
              <svg className="h-4 w-4 shrink-0 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </div>
        ) as any,
      })
    });

    return () => {
      unsubscribe()
    }
  }, [router])

  return null // Headless component
}
