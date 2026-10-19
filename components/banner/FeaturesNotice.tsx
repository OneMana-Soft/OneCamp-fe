"use client"

import { NoticeBar, noticeActionClass } from "@/components/banner/NoticeBar"
import { useClientConfigStatus } from "@/hooks/useClientConfig"

/**
 * Says so when this server hasn't said what it has, and asking failed: AI,
 * calls and the rest stay hidden until it answers (useFeature fails closed),
 * and a page that silently lost its Huddle button and AI spark read as a
 * product without them (17 Oct 2026). A last answer kept from an earlier load
 * stands in, so this shows only when nothing is known. It goes once the read
 * succeeds, by itself (it is asked again) or through Try again.
 */
export function FeaturesNotice() {
  const { known, failed, retry } = useClientConfigStatus()
  if (known || !failed) return null
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
