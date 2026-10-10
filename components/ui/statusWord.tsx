import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A state, said as a dot and a word: "On", "Connected", "Not set up", "Active".
 *
 * The task panel's status reads this way ("• In progress"), and the admin cards
 * each said theirs differently: a green word on its own, a word with a dot, a
 * tinted pill, "Set up, saved here" in two colours. The word carries the meaning
 * (colour is never the only cue); the dot, in the status colour, lets a list be
 * scanned. The word stays in ink, as the bar's status does, so it reads at AA in
 * every theme. It takes the size of the line it sits in.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-faint-foreground",
}

export function StatusWord({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span data-status-word={tone} className={cn("inline-flex items-center gap-1.5 text-foreground", className)}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  )
}
