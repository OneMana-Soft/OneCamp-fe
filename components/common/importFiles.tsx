"use client"

/**
 * Each file's row in an import dialog (docs, calendars): its state, progress
 * and error. What a finished import made is the dialog's own (its children).
 * Where the files are dropped or chosen is ./importDropZone.
 */

import type * as React from "react"
import { CheckCircle2, FileUp, Loader2, TriangleAlert, X } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { jobIsOver } from "@/lib/export/contentIO"
import type { ImportRow } from "@/lib/export/useImportJobs"

/** One file of an import: its state, its progress while it runs, and what went wrong. */
export function ImportRowFrame({ row, onRemove, children }: { row: ImportRow; onRemove?: () => void; children?: React.ReactNode }) {
  const job = row.job
  const failed = !!row.error || job?.status === "failed"
  const done = job?.status === "done"
  return (
    <li className="rounded-md border border-border px-3 py-2 text-sm" data-import-row={job?.status || (row.error ? "invalid" : "ready")}>
      <div className="flex items-center gap-2">
        {failed ? (
          <TriangleAlert className="h-4 w-4 shrink-0 text-danger-ink" aria-hidden="true" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
        ) : job ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">{row.file.name}</span>
        {onRemove && !job && (
          <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-hover" onClick={onRemove} aria-label={`Remove ${row.file.name}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {job && !jobIsOver(job) && <Progress value={job.progress} className="mt-2 h-1.5" aria-label={`Importing ${row.file.name}`} />}
      {(row.error || job?.error) && <p className="mt-1 text-2xs text-danger-ink">{row.error || job?.error}</p>}
      {children}
    </li>
  )
}
