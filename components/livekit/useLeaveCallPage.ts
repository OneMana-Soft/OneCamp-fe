"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

/** Leaving a call page: back where the person came from, or close a tab opened just for the call. */
export function useLeaveCallPage() {
  const router = useRouter()
  return useCallback(() => {
    if (window.history.length > 1) router.back()
    else window.close()
  }, [router])
}
