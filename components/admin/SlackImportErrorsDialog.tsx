"use client"

/**
 * SlackImportErrorsDialog: what a Slack import skipped or couldn't bring
 * across, a page at a time, filterable by how serious. Reads
 * /admin/import/slack/jobs/{id}/errors.
 *
 * A failed load is said in the dialog, with a way to try again. It used to
 * raise a toast and then say "No matching entries.", so the dialog claimed a
 * clean import behind the toast that contradicted it.
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
import { getSlackImportErrors, type SlackImportError } from "@/services/slackImportService"
import { EmptyLog, ErrorRow, ErrorRowsSkeleton, LOG_LIST, SeverityFilter, type SeverityChoice } from "@/components/admin/ImportErrorsDialog"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE_SIZE = 100


export const SlackImportErrorsDialog: React.FC<Props> = ({ jobId, open, onOpenChange }) => {
  const [filter, setFilter] = useState<SeverityChoice>("")
  const [items, setItems] = useState<SlackImportError[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<"first" | "more" | null>(null)
  // The newest request wins when the filter changes while a page is on its way.
  const latest = useRef(0)

  const fetchPage = useCallback(
    async (offset: number) => {
      const ask = ++latest.current
      setLoading(true)
      setFailed(null)
      try {
        const page = await getSlackImportErrors(jobId, filter || undefined, PAGE_SIZE, offset)
        if (ask !== latest.current) return
        setItems((prev) => (offset === 0 ? page : [...prev, ...page]))
        setDone(page.length < PAGE_SIZE)
      } catch {
        if (ask !== latest.current) return
        if (offset === 0) setItems([])
        setFailed(offset === 0 ? "first" : "more")
      } finally {
        if (ask === latest.current) setLoading(false)
      }
    },
    [jobId, filter],
  )

  useEffect(() => {
    if (!open) return
    setDone(false)
    void fetchPage(0)
  }, [open, fetchPage])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import errors</DialogTitle>
          <DialogDescription>
            What the import left out or couldn&apos;t bring across from Slack, and why.
          </DialogDescription>
        </DialogHeader>

        <SeverityFilter value={filter} onChange={setFilter} disabled={loading && items.length === 0} />

        <div className="min-h-0 flex-1 overflow-auto">
          {loading && items.length === 0 ? (
            <ErrorRowsSkeleton />
          ) : failed === "first" ? (
            <ErrorState compact subject="the error log" onRetry={() => void fetchPage(0)} retrying={loading} />
          ) : items.length === 0 ? (
            <EmptyLog choice={filter} />
          ) : (
            <ul aria-label="Logged problems" className={LOG_LIST}>
              {items.map((r) => (
                <ErrorRow key={r.id} row={{ ...r, source: r.slack_id }} />
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
            {!done && items.length > 0 && (
              <Button variant="outline" onClick={() => void fetchPage(items.length)} disabled={loading}>
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
