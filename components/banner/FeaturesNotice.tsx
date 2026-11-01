"use client"

import { useSyncExternalStore } from "react"
import { NoticeBar, noticeActionClass } from "@/components/banner/NoticeBar"
import { useClientConfigStatus } from "@/hooks/useClientConfig"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"

const onlineOnServer = () => false

/**
 * Says so when this server hasn't said what it has, and asking failed: AI,
 * calls and the rest stay hidden until it answers (useFeature fails closed),
 * and a page that silently lost its Huddle button and AI spark read as a
 * product without them (17 Oct 2026). A last answer kept from an earlier load
 * stands in, so this shows only when nothing is known. It goes once the read
 * succeeds, by itself (it is asked again) or through Try again.
 * Offline (lib/connectivity isAppOffline) it stays quiet: the pill already
 * says why nothing answers, and one cause is said once (DESIGN-BUILD-58).
 */
export function FeaturesNotice() {
  const { known, failed, retry } = useClientConfigStatus()
  const offline = useSyncExternalStore(subscribeConnectivity, isAppOffline, onlineOnServer)
  if (known || !failed || offline) return null
  return (
    <NoticeBar
      tone="warning"
      lead="Couldn't check what this workspace has."
      action={
        <button type="button" className={noticeActionClass} onClick={retry}>
          Try again
        </button>
      }
    >
      Some features may be missing until it answers.
    </NoticeBar>
  )
}
