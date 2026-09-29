"use client"

import { useEffect, useState } from "react"

import { withAI } from "@/components/common/withFeature"
import { Sparkles } from "@/lib/icons"
import { extractTasks } from "@/services/taskExtractService"

interface TaskNameSuggestionProps {
  /** Plain text of the message the task is being made from. */
  text: string
  /** The name currently in the field; no suggestion is shown once they match. */
  current: string
  onUse: (name: string) => void
}

/**
 * Under the name of a task being made from a message: the assistant's reading
 * of what the message asks for, as a short imperative title the person can take
 * with one click. It never writes into the field by itself, so nothing typed is
 * overwritten, and it stays silent when it has nothing or the request fails.
 */
function TaskNameSuggestionInner({ text, current, onUse }: TaskNameSuggestionProps) {
  const [suggestion, setSuggestion] = useState("")

  useEffect(() => {
    let live = true
    extractTasks({ source_type: "text", text }, { quiet: true })
      .then((res) => {
        const title = res.tasks?.[0]?.title?.trim()
        if (live && title) setSuggestion(title)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [text])

  if (!suggestion || suggestion === current.trim()) return null
  return (
    <button
      type="button"
      onClick={() => onUse(suggestion)}
      className="flex w-fit max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="truncate">
        Use “{suggestion}”
      </span>
    </button>
  )
}

export const TaskNameSuggestion = withAI(TaskNameSuggestionInner)
