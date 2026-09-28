"use client"

/**
 * When something saved for later comes due while the app is open, say so,
 * with a way straight to it, and refresh Later so it moves to the top and the
 * sidebar count goes up. The server sends the event (business/SavedItem);
 * useMqttMessageHandler turns it into a window event this listens for.
 * Renders nothing.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSWRConfig } from "swr"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { GetEndpointUrl } from "@/services/endPoints"

export const LATER_DUE_EVENT = "later-due"

interface LaterDueDetail {
  id: string
  title: string
  link: string
}

export function LaterDueHost() {
  const router = useRouter()
  const { toast } = useToast()
  const { mutate } = useSWRConfig()

  useEffect(() => {
    const onDue = (e: Event) => {
      const d = (e as CustomEvent<LaterDueDetail>).detail
      if (!d?.id) return
      void mutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.Later))
      // Only an in-app path; anything else would be a way out of the app.
      const link = typeof d.link === "string" && d.link.startsWith("/app/") ? d.link : "/app/later"
      toast({
        // Long enough to be seen by someone who glanced away; it also waits
        // at the top of Later, so it is never lost when the toast goes.
        duration: 20_000,
        title: "Reminder",
        description: d.title || "Something you saved for later",
        action: (
          <ToastAction altText="Open it" onClick={() => router.push(link)}>
            Open
          </ToastAction>
        ),
      })
    }
    window.addEventListener(LATER_DUE_EVENT, onDue)
    return () => window.removeEventListener(LATER_DUE_EVENT, onDue)
  }, [mutate, router, toast])

  return null
}
