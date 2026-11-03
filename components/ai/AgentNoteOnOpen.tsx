"use client"

/**
 * The first time a member opens OneCamp on a given day, OneCamp AI leaves a
 * note in their DM with what needs them (backend: business/AICoworker
 * agentNote.go). This asks for it once the first screen has settled, once per
 * tab per day, and says so with a toast that opens the DM. Renders nothing.
 *
 * The server decides whether there is a note and makes it once a day however
 * many tabs ask; the sessionStorage mark only saves the request on reloads.
 * The toast is news nobody asked for (lib/ui/news, fetched with the note): it
 * waits off open dialogs and work surfaces such as a board.
 */

import * as React from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useToast } from "@/hooks/use-toast"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { ToastAction } from "@/components/ui/toast"
import { app_chat_path } from "@/types/paths"
import { leaveDailyNote } from "@/services/agentNoteService"
import { localDay } from "@/lib/utils/timeZone"
import { runWhenSettled } from "@/lib/ui/whenQuiet"

const MARK = "oc.agentNote"

export function AgentNoteOnOpen() {
  const ai = useAIAvailable()
  const router = useAppRouter()
  const { toast } = useToast()
  const asked = React.useRef(false)
  const off = React.useRef(() => {})
  React.useEffect(
    () => () => {
      off.current()
      asked.current = false
    },
    [],
  )

  React.useEffect(() => {
    if (!ai || asked.current) return
    asked.current = true
    off.current = runWhenSettled([
      () => {
        const day = localDay()
        try {
          if (sessionStorage.getItem(MARK) === day) return
          sessionStorage.setItem(MARK, day)
        } catch {
          /* no storage: the server still sends at most one a day */
        }
        return leaveDailyNote(day)
          .then(async (res) => {
            if (!res?.posted || !res.bot_uuid) return
            const open = () => router.push(`${app_chat_path}/${res.bot_uuid}`)
            const { showNews } = await import("@/lib/ui/news")
            if (!asked.current) return
            off.current = showNews((mark) => {
              const news = { "data-news": mark }
              return toast({
                ...news,
                title: "OneCamp AI left you a note",
                description: res.items === 1 ? "One thing needs you today." : `${res.items} things need you today.`,
                action: (
                  <ToastAction altText="Open the note" onClick={open}>
                    Open
                  </ToastAction>
                ),
              }).dismiss
            })
          })
          .catch(() => {
            /* a note is a nicety; never an error the member has to see */
          })
      },
    ])
  }, [ai, router, toast])

  return null
}
