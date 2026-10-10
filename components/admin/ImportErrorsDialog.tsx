"use client"

/**
 * ImportErrorsDialog: what an import skipped or couldn't bring across, page by
 * page, filterable by how serious. Reads /admin/import/jobs/{id}/errors, whose
 * rows carry `source_id` (and `slack_id`, for older Slack rows).
 *
 * A failed load is said as one, with a way to try again: it used to read "No
 * errors recorded.", which is the one thing an admin checking a failed import
 * must not be told by mistake. And the log no longer stops at 200 rows without
 * a word: it shows a page at a time, with "Show more" while there is more.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { getImportErrors, type ImportError } from "@/services/importService"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE = 100

export const SEVERITIES = ["", "warning", "error", "fatal"] as const
export type SeverityChoice = (typeof SEVERITIES)[number]

const CHOICE_LABEL: Record<SeverityChoice, string> = { "": "All", warning: "Warnings", error: "Errors", fatal: "Fatal" }
const EMPTY_LINE: Record<SeverityChoice, string> = {
  "": "Nothing was logged: the import brought everything across.",
  warning: "No warnings.",
  error: "No errors.",
  fatal: "Nothing stopped this import.",
}

/**
 * How serious, as a choice of one: the segmented radio group the notification
 * digest uses. It was four buttons, the chosen one a filled orange, beside the
 * dialog's own actions.
 */
export function SeverityFilter({
  value,
  onChange,
  disabled,
}: {
  value: SeverityChoice
  onChange: (v: SeverityChoice) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Show" className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1">
      {SEVERITIES.map((v) => {
        const on = value === v
        return (
          <button
            key={v || "all"}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "h-7 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50",
              on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {CHOICE_LABEL[v]}
          </button>
        )
      })}
    </div>
  )
}

const CHIP: Record<string, { label: string; className: string }> = {
  warning: { label: "Warning", className: "border-warning/20 bg-warning/10 text-warning-ink" },
  error: { label: "Error", className: "border-destructive/20 bg-destructive/10 text-danger-ink" },
  fatal: { label: "Fatal", className: "border-destructive/30 bg-destructive/15 text-danger-ink" },
}

/** How serious one row is: a tinted word, no icon beside it. */
export function SeverityChip({ severity }: { severity: string }) {
  const c = CHIP[severity] ?? CHIP.error
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-2xs font-medium", c.className)}>
      {c.label}
    </span>
  )
}

/** One logged problem: how serious, where it came from and when, then what happened, in ink. */
export function ErrorRow({ row }: { row: Pick<ImportError, "severity" | "code" | "message" | "created_at" | "entity_type"> & { source?: string } }) {
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <SeverityChip severity={row.severity} />
        {row.entity_type && <span>{row.entity_type}</span>}
        {row.source && <span className="font-mono">{row.source}</span>}
        {row.code && <span className="font-mono">{row.code}</span>}
        <span className="ml-auto whitespace-nowrap">{shortDateTime(new Date(row.created_at))}</span>
      </div>
      <p className="break-words text-sm text-foreground">{row.message}</p>
    </li>
  )
}

export const ImportErrorsDialog: React.FC<Props> = ({ jobId, open, onOpenChange }) => {
  const [rows, setRows] = useState<ImportError[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<"first" | "more" | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [severity, setSeverity] = useState<SeverityChoice>("")
  // The newest request wins: switching the filter while a page is on its way
  // must not let the older answer land on the newer list.
  const latest = useRef(0)

  const load = useCallback(
    async (offset: number) => {
      const ask = ++latest.current
      setLoading(true)
      setFailed(null)
      try {
        const page = await getImportErrors(jobId, severity || undefined, PAGE, offset)
        if (ask !== latest.current) return
        setRows((prev) => (offset === 0 ? page : [...prev, ...page]))
        setHasMore(page.length === PAGE)
      } catch {
        if (ask !== latest.current) return
        if (offset === 0) setRows([])
        setFailed(offset === 0 ? "first" : "more")
      } finally {
        if (ask === latest.current) setLoading(false)
      }
    },
    [jobId, severity],
  )

  useEffect(() => {
    if (open) void load(0)
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import errors</DialogTitle>
          <DialogDescription>
            What the import left out or brought across only in part, and why. Most are minor and need no new import.
          </DialogDescription>
        </DialogHeader>

        <SeverityFilter value={severity} onChange={setSeverity} disabled={loading && rows.length === 0} />

        {loading && rows.length === 0 ? (
          <div role="status" aria-label="Loading the error log" className="rounded-md border border-border px-3 py-1">
            <SkeletonRows rows={4} avatar={false} />
          </div>
        ) : failed === "first" ? (
          <ErrorState subject="the error log" onRetry={() => void load(0)} retrying={loading} />
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-border px-3 py-8 text-center text-sm text-muted-foreground">{EMPTY_LINE[severity]}</p>
        ) : (
          <div className="space-y-2">
            <ul aria-label="Logged problems" className="divide-y divide-border rounded-md border border-border">
              {rows.map((r) => (
                <ErrorRow key={r.id} row={{ ...r, source: r.source_id || r.slack_id }} />
              ))}
            </ul>
            {failed === "more" && (
              <p role="alert" className="text-sm text-danger-ink">
                Couldn&apos;t load more. Try again.
              </p>
            )}
            {hasMore && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => void load(rows.length)} disabled={loading}>
                  {loading ? "Loading…" : "Show more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
