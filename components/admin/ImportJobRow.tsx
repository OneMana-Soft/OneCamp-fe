"use client"

/**
 * One import job in the import card: where it stands, and what can be done
 * with it from here. Every state has a way forward:
 *   waiting (uploading, to be planned, planned)  → Plan, and Discard
 *   running                                      → Cancel
 *   failed                                       → Plan again, Roll back
 *   finished                                     → Invite people, Roll back
 * A job waiting used to have no way out at all (Cancel only stopped a running
 * one), and it kept its workspace's label busy, so it blocked importing that
 * workspace again.
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, RotateCcw, Trash2, Users, XCircle } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { importProviderLabel, type ImportJob } from "@/services/importService"

const STATUS_BADGE: Record<string, { className: string; icon: React.ReactNode; label: string }> = {
  pending: { className: "bg-warning/10 text-warning-ink border-warning/20", icon: <Clock className="h-3.5 w-3.5" />, label: "Uploading" },
  validating: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <Clock className="h-3.5 w-3.5" />, label: "To plan" },
  planned: { className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Planned" },
  running: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />, label: "Running" },
  paused: { className: "bg-warning/10 text-warning-ink border-warning/20", icon: <Clock className="h-3.5 w-3.5" />, label: "Paused" },
  completed: { className: "bg-success/10 text-success-ink border-success/20", icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Finished" },
  failed: { className: "bg-destructive/10 text-danger-ink border-destructive/20", icon: <XCircle className="h-3.5 w-3.5" />, label: "Failed" },
  cancelled: { className: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Cancelled" },
  rolled_back: { className: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: <RotateCcw className="h-3.5 w-3.5" />, label: "Rolled back" },
}

/** Whether a job still waits for its admin: uploading, to be planned, or planned and not run. */
export function isWaiting(status: ImportJob["status"]): boolean {
  return status === "pending" || status === "validating" || status === "planned"
}

/**
 * Why a running import isn't moving, when a provider has paused it: monday.com's
 * daily API limit, say, with the local time it lifts. The import carries on by
 * itself; it used to sit "running" for hours without a word. Pure apart from
 * the clock.
 */
export function pauseLine(j: Pick<ImportJob, "progress">, now: number = Date.now()): string | null {
  const until = typeof j.progress?.paused_until === "string" ? Date.parse(j.progress.paused_until) : NaN
  if (!Number.isFinite(until) || until <= now) return null
  const reason = typeof j.progress?.pause_reason === "string" ? j.progress.pause_reason : ""
  const at = new Date(until).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
  return `Waiting${reason ? `: ${reason}` : ""}. It carries on by itself around ${at}.`
}

export interface ImportJobRowProps {
  job: ImportJob
  /** Shows which provider the job is from, for a list of every provider's jobs. */
  showProvider?: boolean
  onPlan: () => void
  onDiscard: () => void
  onCancel: () => void
  onRollback: () => void
  onRetryFailed: () => void
  onInvite: () => void
  onShowErrors: () => void
}

export function ImportJobRow({ job: j, showProvider, onPlan, onDiscard, onCancel, onRollback, onRetryFailed, onInvite, onShowErrors }: ImportJobRowProps) {
  const badge = STATUS_BADGE[j.status] ?? STATUS_BADGE.pending
  const totalChunks = j.chunks_total || 1
  const pct = j.status === "completed" ? 100 : Math.min(100, Math.round((j.chunks_done / totalChunks) * 100))
  return (
    <div className="rounded border bg-card p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-medium">
            {showProvider && <span className="text-muted-foreground">{importProviderLabel(j.provider)} · </span>}
            {j.source_workspace_name}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className={badge.className}>
              <span className="flex items-center gap-1">
                {badge.icon}
                {badge.label}
              </span>
            </Badge>
            {j.status === "running" && j.stage && <span>· {j.stage}</span>}
            <span>· {new Date(j.created_at).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {(j.status === "validating" || j.status === "planned") && (
            <Button size="sm" variant="default" onClick={onPlan}>
              <PlayCircle className="mr-1 h-4 w-4" /> Plan
            </Button>
          )}
          {j.status === "failed" && (
            <Button size="sm" variant="default" onClick={onPlan}>
              <PlayCircle className="mr-1 h-4 w-4" /> Plan again
            </Button>
          )}
          {isWaiting(j.status) && (
            <Button size="sm" variant="outline" onClick={onDiscard}>
              <Trash2 className="mr-1 h-4 w-4" /> Discard
            </Button>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {j.status === "completed" && (
            <Button size="sm" variant="default" onClick={onInvite}>
              <Users className="mr-1 h-4 w-4" /> Invite people
            </Button>
          )}
          {(j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
            <Button size="sm" variant="outline" onClick={onRollback}>
              <RotateCcw className="mr-1 h-4 w-4" /> Roll back
            </Button>
          )}
          {(j.status === "failed" || j.status === "cancelled") && j.chunks_failed > 0 && (
            <Button size="sm" variant="outline" onClick={onRetryFailed}>
              <RefreshCw className="mr-1 h-4 w-4" /> Retry failed
            </Button>
          )}
          {j.errors_total > 0 && (
            <Button size="sm" variant="ghost" onClick={onShowErrors}>
              <AlertTriangle className="mr-1 h-4 w-4 text-warning-ink" />
              {j.errors_total} errors
            </Button>
          )}
        </div>
      </div>
      {!isWaiting(j.status) && (
        <>
          <Progress value={pct} className="h-1.5" />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>
              {j.chunks_done}/{j.chunks_total} chunks
            </span>
            <span>{j.items_imported.toLocaleString()} items</span>
          </div>
        </>
      )}
      {j.status === "running" && pauseLine(j) && <p className="mt-1 break-words text-xs text-warning-ink">{pauseLine(j)}</p>}
      {j.error_message && <p className="mt-1 break-words text-xs text-danger-ink">{j.error_message}</p>}
    </div>
  )
}
