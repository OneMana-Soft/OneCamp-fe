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
 * It reads like the task panel: the name and where it stands (a dot and a
 * word), then quiet labels with their values in ink at one x (fieldRow). Each
 * row's next step is an outline button, because a list of three imports used
 * to draw three filled orange ones against the page's one primary action.
 */

import React, { useEffect, useRef } from "react"
import { celebrate, springPop } from "@/lib/celebrate"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { AlertTriangle, RefreshCw, RotateCcw, Trash2, Users } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import type { CampHue } from "@/lib/campHue"
import { importProviderLabel, type ImportJob } from "@/services/importService"

/**
 * Status in the status colours, as a dot and a word (StatusWord), the way the
 * task panel says a status. These were raw blue, indigo, purple and grey,
 * which measure 2.3 to 3.5:1 in dark mode, below AA, each with an icon beside
 * its word (a spinning one for running), and then tinted pills.
 */
const STATUS: Record<string, { label: string; tone: StatusTone }> = {
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

/**
 * Each tool's colour, one map: where the history lists every provider's
 * imports, a small square in it marks which tool each came from. Eight tools,
 * six hues, so two pairs share one; the name always sits beside it.
 */
export const PROVIDER_HUE: Record<string, CampHue> = {
  asana: "berry",
  clickup: "dusk",
  jira: "sky",
  linear: "lake",
  monday: "sun",
  notion: "moss",
  todoist: "berry",
  trello: "sky",
}

/** A row's buttons: 44px touch targets on a phone, 32px from md up. */
export const ROW_ACTION = "h-11 md:h-8"

/** A list of rows between hairlines, as every list on the admin page is drawn. */
export const IMPORT_LIST = "divide-y divide-border rounded-lg border border-border"

/**
 * An import list while it loads, in its rows' own shape: the name and where it
 * stands, then two label rows at the fieldRow's columns. It was the generic
 * avatar rows, which the import rows then replaced at another height.
 */
export function ImportRowsSkeleton({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <ul role="status" aria-label={label} className={IMPORT_LIST}>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} aria-hidden="true" className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className={cn("h-4", i % 2 === 0 ? "w-40" : "w-32")} />
            <Skeleton className="h-3 w-16" />
          </div>
          {["w-24", "w-36"].map((w) => (
            <div key={w} className={fieldRow("center", "mb-0")}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className={cn("h-3.5", w)} />
            </div>
          ))}
        </li>
      ))}
    </ul>
  )
}

/** Where an import stands, as a dot and a word. Shared by the Slack import card. */
export function ImportStatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending
  const chip = useRef<HTMLSpanElement>(null)
  // The status this chip last showed. A run that turns Finished while it is
  // on screen is one of the playful layer's moments: a burst of camp sparks
  // from the chip and a small pop (nothing under reduced motion). An import
  // that loads finished (a reload, another visit) has no last status, and
  // stays quiet: its news was told already.
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (status === "completed" && last.current !== null && last.current !== "completed") {
      celebrate(chip.current)
      springPop(chip.current)
    }
    last.current = status
  }, [status])
  // The span is what bursts: StatusWord takes no ref.
  return (
    <span ref={chip} data-import-status={status} className="inline-flex shrink-0">
      <StatusWord tone={s.tone} className="text-xs">
        {s.label}
      </StatusWord>
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
          {showProvider && <IdentityMark hue={PROVIDER_HUE[j.provider] ?? "sun"} variant="square" size={10} />}
          <span className="truncate text-sm font-medium">
            {showProvider && <span className="font-normal text-muted-foreground">{importProviderLabel(j.provider)} · </span>}
            {j.source_workspace_name}
          </span>
          <ImportStatusChip status={j.status} />
          {j.status === "running" && j.stage && <span className="text-xs text-muted-foreground">{j.stage}</span>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(j.status === "validating" || j.status === "planned") && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onPlan}>
              <PlayCircle /> Plan
            </Button>
          )}
          {j.status === "failed" && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onPlan}>
              <PlayCircle /> Plan again
            </Button>
          )}
          {isWaiting(j.status) && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onDiscard}>
              <Trash2 /> Discard
            </Button>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onCancel}>
              Cancel
            </Button>
          )}
          {j.status === "completed" && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onInvite}>
              <Users /> Invite people
            </Button>
          )}
          {(j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onRollback}>
              <RotateCcw /> Roll back
            </Button>
          )}
          {(j.status === "failed" || j.status === "cancelled") && j.chunks_failed > 0 && (
            <Button size="sm" variant="outline" className={ROW_ACTION} onClick={onRetryFailed}>
              <RefreshCw /> Retry failed
            </Button>
          )}
          {j.errors_total > 0 && (
            <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={onShowErrors}>
              <AlertTriangle className="text-warning-ink" />
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
