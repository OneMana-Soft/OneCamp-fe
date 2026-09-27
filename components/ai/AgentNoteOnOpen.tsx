"use client"

/**
 * The first time a member opens OneCamp on a given day, OneCamp AI leaves a
 * note in their DM with what needs them (backend: business/AICoworker
 * agentNote.go). This asks for it, once per tab per day, and says so with a
 * toast that opens the DM. Renders nothing.
 *
 * The server decides whether there is a note and makes it once a day however
 * many tabs ask; the sessionStorage mark only saves the request on reloads.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { ToastAction } from "@/components/ui/toast"
import { app_chat_path } from "@/types/paths"
import { leaveDailyNote, localDay } from "@/services/agentNoteService"

const MARK = "oc.agentNote"

export function AgentNoteOnOpen() {
  const ai = useAIAvailable()
  const router = useRouter()
  const { toast } = useToast()
  const asked = React.useRef(false)

  React.useEffect(() => {
    if (!ai || asked.current) return
    asked.current = true
    const day = localDay()
    try {
      if (sessionStorage.getItem(MARK) === day) return
      sessionStorage.setItem(MARK, day)
    } catch {
      /* no storage: the server still sends at most one a day */
    }
    leaveDailyNote(day)
      .then((res) => {
        if (!res?.posted || !res.bot_uuid) return
        const open = () => router.push(`${app_chat_path}/${res.bot_uuid}`)
        toast({
          title: "OneCamp AI left you a note",
          description: res.items === 1 ? "One thing needs you today." : `${res.items} things need you today.`,
          action: (
            <ToastAction altText="Open the note" onClick={open}>
              Open
            </ToastAction>
          ),
        })
      })
      .catch(() => {
        /* a note is a nicety; never an error the member has to see */
      })
  }, [ai, router, toast])

  return null
}
