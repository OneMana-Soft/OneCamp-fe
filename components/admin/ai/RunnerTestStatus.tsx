"use client"

import React from "react"

import { CheckCircle2, XCircle } from "@/lib/icons"

/**
 * The outcome of the last runner probe, shown inline and kept on screen.
 *
 * WHY THIS EXISTS. Both runner sections — the analysis sandbox and the coding runner — reported their
 * test result as a toast and nothing else. A toast is right for "saved"; it is wrong here. Whether a
 * sidecar is reachable is the single fact an admin is on this screen to establish, and four seconds
 * later the page showed no trace of it. Come back tomorrow and the section looks identical whether the
 * runner is healthy or was never deployed.
 *
 * IT STATES WHEN IT WAS CHECKED, which is the part that keeps it honest. A green tick with no
 * timestamp is a claim about the present, and this is a point-in-time probe: the container can die a
 * second after it passes. "Reachable · checked 14:32" is true indefinitely; "Reachable" is not. That
 * distinction is the difference between a useful status line and one that misleads exactly when
 * something has broken.
 *
 * Deliberately NOT persisted across reloads. Doing that would need the server to store and re-serve a
 * probe result, and a remembered green tick from yesterday is worse than no tick at all — it answers
 * the question the admin is asking with information that cannot support it.
 */
export interface RunnerProbe {
  ok: boolean
  /** Short machine status, e.g. "unconfigured", "unreachable". Rendered only when it adds detail. */
  status?: string
  message: string
  /** Round trip in milliseconds, when the probe got far enough to measure one. */
  ms?: number
  /** When the probe ran. */
  at: Date
}

export function RunnerTestStatus({ probe }: { probe: RunnerProbe | null }) {
  if (!probe) return null

  const time = probe.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-2xs ${
        probe.ok
          ? "border-success/30 bg-success/5 text-success"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      }`}
    >
      {probe.ok ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <div className="min-w-0">
        <span className="font-medium">{probe.ok ? "Reachable" : "Not reachable"}</span>
        {typeof probe.ms === "number" && probe.ms > 0 && <span> · {probe.ms} ms</span>}
        <span className="text-muted-foreground"> · checked {time}</span>
        {/*
          The message carries the actionable part on failure ("Could not reach the code-runner:
          dial tcp ..."), which is the whole reason the probe exists. On success it is a fixed
          confirmation the line above already gives, so it is only rendered when it adds something.
        */}
        {!probe.ok && probe.message && <div className="mt-0.5 break-words">{probe.message}</div>}
      </div>
    </div>
  )
}
