"use client"

// A running timer follows the person around the app: its task, its clock, and
// a stop button, so a timer is never forgotten in a task they closed.

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { serverMessage } from "@/lib/http/serverMessage"
import { CircleStop } from "@/lib/icons"
import { formatClock } from "@/lib/tasks/time"
import { stopTimer, useElapsed, useRunningTimer } from "@/hooks/useTaskTime"

export function RunningTimerChip({ className = "" }: { className?: string }) {
  const { running } = useRunningTimer()
  const elapsed = useElapsed(running?.entry.started_at)
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  if (!running) return null

  return (
    <div role="status" aria-label={`Timer running on ${running.task_name}`} className={`fixed z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 shadow-lg backdrop-blur ${className}`}>
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden />
      <button type="button" onClick={() => router.push(`/app/task/${running.entry.task_uuid}`)} className="min-w-0 truncate text-sm hover:underline">
        {running.task_name}
      </button>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatClock(elapsed)}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 rounded-full"
        aria-label="Stop the timer"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await stopTimer(running.entry.task_uuid)
          } catch (e) {
            toast({ title: "Couldn't stop the timer", description: serverMessage(e), variant: "destructive" })
          } finally {
            setBusy(false)
          }
        }}
      >
        <CircleStop className="h-4 w-4" />
      </Button>
    </div>
  )
}
