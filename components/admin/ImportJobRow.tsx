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
 * Design v3 (§A14, mock M5): a row, not a block. The tool's mark, "Jira ·
 * Acme" and where it stands as a dot and a word, a tabular meta line, and on
 * the right the 160px bar while it runs, the next step while it waits, or a ⋯
 * once it is done (ImportJobFrame in importParts). A tool is a category, so
 * its mark is neutral ink on sunken: it was a camp-hued square per tool.
 */

import React, { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, RefreshCw, RotateCcw, Trash2, Users } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { StateWord, type RowMenuItem } from "@/components/admin/connectParts"
import { IMPORT_STATE, ImportJobFrame, useFinishCelebration } from "@/components/admin/importParts"
import { importProviderLabel, type ImportJob } from "@/services/importService"

/** A row's buttons: 44px touch targets on a phone, 28px from md up. */
export const ROW_ACTION = "h-11 md:h-7"

/**
 * A list of import rows: the settings card (raised at e1, r12, no border),
 * rows between hairlines inset 16px. It was a 1px grey box (§1.3).
 */
export const IMPORT_LIST = "set-card cx-imp-list"

/**
 * An import list while it loads, in its rows' own shape: the 28px mark, the
 * name and its state, the meta line, and the bar's place on the right.
 */
export function ImportRowsSkeleton({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <ul role="status" aria-label={label} className={IMPORT_LIST}>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} aria-hidden="true" className="cx-imp-job">
          <Skeleton className="size-7 rounded-lg" />
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-48" : "w-36")} />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-1.5 w-40 rounded-full sm:block" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Where an import stands, as a dot and a word. Running pulses (opacity only).
 * When a run turns Finished on screen it bursts from the dot, once per import
 * id when `jobId` is given (useFinishCelebration).
 */
export function ImportStatusChip({ status, jobId }: { status: string; jobId?: string }) {
  const s = IMPORT_STATE[status] ?? IMPORT_STATE.pending
  const dot = useRef<HTMLSpanElement>(null)
  useFinishCelebration(jobId, status, dot)
  return (
    <span data-import-status={status} className="inline-flex shrink-0">
      <StateWord tone={s.tone} pulse={s.pulse} dotRef={dot}>
        {s.label}
      </StateWord>
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
  const done = j.status === "completed" || j.status === "failed" || j.status === "cancelled" || j.status === "rolled_back"
  const label = importProviderLabel(j.provider)

  const meta = [`${j.started_at ? "Started" : "Created"} ${shortDateTime(new Date(j.started_at ?? j.created_at))}`]
  if (!isWaiting(j.status)) meta.push(count(j.items_imported, "item", "items"), partsLine(j.chunks_done, j.chunks_total))

  // Done: what's left behind ⋯, so a list of finished imports is quiet.
  const menu: RowMenuItem[] = []
  if (done) {
    if (j.status === "completed") menu.push({ label: "Invite the people who came across", icon: Users, onSelect: onInvite })
    if ((j.status === "failed" || j.status === "cancelled") && j.chunks_failed > 0)
      menu.push({ label: "Retry the failed parts", icon: RefreshCw, onSelect: onRetryFailed })
    if (j.errors_total > 0) menu.push({ label: `See ${count(j.errors_total, "error", "errors")}`, icon: AlertTriangle, onSelect: onShowErrors })
    if (j.status !== "rolled_back") menu.push({ label: "Roll back", icon: RotateCcw, onSelect: onRollback, destructive: true, separated: menu.length > 0 })
  }

  return (
    <ImportJobFrame
      jobId={j.id}
      vendor={j.provider}
      vendorName={label}
      showVendor={showProvider}
      name={j.source_workspace_name}
      status={j.status}
      stage={j.stage}
      meta={meta}
      pct={pct}
      errorsLabel={j.errors_total > 0 ? count(j.errors_total, "error", "errors") : undefined}
      onShowErrors={onShowErrors}
      menu={menu}
      actions={
        <>
          {(j.status === "validating" || j.status === "planned") && (
            <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onPlan}>
              <PlayCircle /> Plan
            </Button>
          )}
          {j.status === "failed" && (
            <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onPlan}>
              <PlayCircle /> Plan again
            </Button>
          )}
          {isWaiting(j.status) && (
            <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={onDiscard}>
              <Trash2 /> Discard
            </Button>
          )}
          {(j.status === "running" || j.status === "paused") && (
            <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </>
      }
      below={() =>
        pause || j.error_message ? (
          <>
            {pause && <p className="break-words text-xs text-warning-ink">{pause}</p>}
            {j.error_message && <p className="break-words text-xs text-danger-ink">{j.error_message}</p>}
          </>
        ) : null
      }
    />
  )
}
