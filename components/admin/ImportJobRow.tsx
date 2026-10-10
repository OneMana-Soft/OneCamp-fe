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
 *
 * It reads like the task panel: the name and where it stands, then quiet labels
 * with their values in ink at one x (fieldRow). Each row's next step is an
 * outline button, because a list of three imports used to draw three filled
 * orange ones against the page's one primary action.
 */

import React from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, RefreshCw, RotateCcw, Trash2, Users } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { importProviderLabel, type ImportJob } from "@/services/importService"

/**
 * Status in the status tokens. These were raw blue, indigo, purple and grey,
 * which measure 2.3 to 3.5:1 in dark mode, below AA, and each carried an icon
 * beside its word (a spinning one for running).
 */
const TONE = {
  info: "border-info/20 bg-info/10 text-info-ink",
  success: "border-success/20 bg-success/10 text-success-ink",
  warning: "border-warning/20 bg-warning/10 text-warning-ink",
  danger: "border-destructive/20 bg-destructive/10 text-danger-ink",
  neutral: "border-border bg-muted text-muted-foreground",
} as const

const STATUS: Record<string, { label: string; tone: keyof typeof TONE }> = {
  pending: { label: "Uploading", tone: "warning" },
  validating: { label: "To plan", tone: "info" },
  planned: { label: "Planned", tone: "info" },
  running: { label: "Running", tone: "info" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Finished", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rolled_back: { label: "Rolled back", tone: "neutral" },
}

/** Where an import stands, as a tinted word. Shared by the Slack import card. */
export function ImportStatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-2xs font-medium", TONE[s.tone])}>
      {s.label}
    </span>
  )
}

/** "1 error", "3 errors". */
export function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`
}

/** How far a run has got, in the parts it is split into: "4 of 10 parts". */
export function partsLine(done: number, total: number): string {
  return `${done.toLocaleString("en")} of ${count(total, "part", "parts")}`
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
  const totalChunks = j.chunks_total || 1
  const pct = j.status === "completed" ? 100 : Math.min(100, Math.round((j.chunks_done / totalChunks) * 100))
  const pause = j.status === "running" ? pauseLine(j) : null
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">
            {showProvider && <span className="font-normal text-muted-foreground">{importProviderLabel(j.provider)} · </span>}
            {j.source_workspace_name}
          </span>
          <ImportStatusChip status={j.status} />
          {j.status === "running" && j.stage && <span className="text-xs text-muted-foreground">{j.stage}</span>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(j.status === "validating" || j.status === "planned") && (
            <Button size="sm" variant="outline" className="h-8" onClick={onPlan}>
              <PlayCircle className="mr-1 h-4 w-4" /> Plan
            </Button>
          )}
          {j.status === "failed" && (
            <Button size="sm" variant="outline" className="h-8" onClick={onPlan}>
              <PlayCircle className="mr-1 h-4 w-4" /> Plan again
            </Button>
          )}
          {isWaiting(j.status) && (
            <Button size="sm" variant="outline" className="h-8" onClick={onDiscard}>
              <Trash2 className="mr-1 h-4 w-4" /> Discard
            </Button>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Button size="sm" variant="outline" className="h-8" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {j.status === "completed" && (
            <Button size="sm" variant="outline" className="h-8" onClick={onInvite}>
              <Users className="mr-1 h-4 w-4" /> Invite people
            </Button>
          )}
          {(j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
            <Button size="sm" variant="outline" className="h-8" onClick={onRollback}>
              <RotateCcw className="mr-1 h-4 w-4" /> Roll back
            </Button>
          )}
          {(j.status === "failed" || j.status === "cancelled") && j.chunks_failed > 0 && (
            <Button size="sm" variant="outline" className="h-8" onClick={onRetryFailed}>
              <RefreshCw className="mr-1 h-4 w-4" /> Retry failed
            </Button>
          )}
          {j.errors_total > 0 && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onShowErrors}>
              <AlertTriangle className="mr-1 h-4 w-4 text-warning-ink" />
              {count(j.errors_total, "error", "errors")}
            </Button>
          )}
        </div>
      </div>

      <dl className="space-y-1">
        <div className={fieldRow("center", "mb-0")}>
          <dt className={fieldLabel}>{j.started_at ? "Started" : "Created"}</dt>
          <dd className="text-sm">{shortDateTime(new Date(j.started_at ?? j.created_at))}</dd>
        </div>
        {!isWaiting(j.status) && (
          <>
            <div className={fieldRow("center", "mb-0")}>
              <dt className={fieldLabel}>Progress</dt>
              <dd className="flex min-w-0 items-center gap-3 text-sm">
                <Progress value={pct} className="h-1.5 w-28 shrink-0" aria-label={`${pct}% done`} />
                <span>{partsLine(j.chunks_done, j.chunks_total)}</span>
              </dd>
            </div>
            <div className={fieldRow("center", "mb-0")}>
              <dt className={fieldLabel}>Brought in</dt>
              <dd className="text-sm">{count(j.items_imported, "item", "items")}</dd>
            </div>
          </>
        )}
      </dl>
      {pause && <p className="break-words text-xs text-warning-ink">{pause}</p>}
      {j.error_message && <p className="break-words text-xs text-danger-ink">{j.error_message}</p>}
    </div>
  )
}
