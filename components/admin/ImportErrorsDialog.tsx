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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { CircleCheck } from "@/lib/icons"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
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

/** What an empty log says, for each choice. Shared by the Slack import's log. */
export const EMPTY_LOG: Record<SeverityChoice, { title: string; description?: string }> = {
  "": { title: "Nothing was logged", description: "The import brought everything across." },
  warning: { title: "No warnings" },
  error: { title: "No errors" },
  fatal: { title: "Nothing stopped this import" },
}

/**
 * An empty log, as an empty state with the workspace hue's tile. It was a line
 * in a bordered box, the same box the rows draw in.
 */
export function EmptyLog({ choice }: { choice: SeverityChoice }) {
  const e = EMPTY_LOG[choice]
  return <EmptyState icon={CircleCheck} hue={ADMIN_GROUP_HUE.workspace} title={e.title} description={e.description} />
}

/** The log while it loads, in its rows' own frame and shape. Shared by the Slack import's log. */
export function ErrorRowsSkeleton() {
  return (
    <ul role="status" aria-label="Loading the error log" className={LOG_LIST}>
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} aria-hidden="true" className="space-y-1.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
          <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/4" : "w-1/2")} />
        </li>
      ))}
    </ul>
  )
}

/** The log's rows between hairlines. */
export const LOG_LIST = "divide-y divide-border rounded-md border border-border"

/**
 * How serious, as a choice of one: the app's segmented control. It was four
 * buttons, the chosen one a filled orange, and then a hand-built copy of the
 * segmented look at its own height.
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
  // "All" is the empty choice, which a radio can't carry as its value.
  return (
    <SegmentedControl
      aria-label="Show"
      value={value || "all"}
      onValueChange={(v) => onChange(v === "all" ? "" : (v as SeverityChoice))}
      disabled={disabled}
      options={SEVERITIES.map((v) => ({ value: v || "all", label: CHOICE_LABEL[v] }))}
    />
  )
}

const SEVERITY: Record<string, { label: string; tone: StatusTone }> = {
  warning: { label: "Warning", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  fatal: { label: "Fatal", tone: "danger" },
}

/** How serious one row is: a dot and a word, as a status reads. It was a tinted pill. */
export function SeverityChip({ severity }: { severity: string }) {
  const c = SEVERITY[severity] ?? SEVERITY.error
  return (
    <StatusWord tone={c.tone} className="shrink-0 font-medium">
      {c.label}
    </StatusWord>
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
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import errors</DialogTitle>
          <DialogDescription>
            What the import left out or brought across only in part, and why. Most are minor and need no new import.
          </DialogDescription>
        </DialogHeader>

        <SeverityFilter value={severity} onChange={setSeverity} disabled={loading && rows.length === 0} />

        {/* The log scrolls inside the dialog, under the filter, and Show more
            sits in the footer beside Close: as the Slack import's log is laid
            out, where this one scrolled whole and put Show more under the list. */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && rows.length === 0 ? (
            <ErrorRowsSkeleton />
          ) : failed === "first" ? (
            <ErrorState compact subject="the error log" onRetry={() => void load(0)} retrying={loading} />
          ) : rows.length === 0 ? (
            <EmptyLog choice={severity} />
          ) : (
            <ul aria-label="Logged problems" className={LOG_LIST}>
              {rows.map((r) => (
                <ErrorRow key={r.id} row={{ ...r, source: r.source_id || r.slack_id }} />
              ))}
            </ul>
          )}
          {failed === "more" && (
            <p role="alert" className="mt-2 text-sm text-danger-ink">
              Couldn&apos;t load more. Try again.
            </p>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div>
            {hasMore && (
              <Button variant="outline" onClick={() => void load(rows.length)} disabled={loading}>
                {loading ? "Loading…" : "Show more"}
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
