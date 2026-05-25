"use client"

/**
 * SlackImportErrorsDialog — paginated error log for a single import job.
 *
 * The backend exposes /admin/import/slack/jobs/{id}/errors with optional
 * severity filter. We render in batches of 100 with a "load more" button.
 */

import React, { useEffect, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { LoaderCircle, AlertTriangle, AlertCircle, X } from "@/lib/icons"
import { getSlackImportErrors, type SlackImportError } from "@/services/slackImportService"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PAGE_SIZE = 100

const SEVERITY_BADGE: Record<string, { className: string; icon: React.ReactNode }> = {
  warning: {
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  error: {
    className: "bg-red-500/10 text-red-600 border-red-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  fatal: {
    className: "bg-red-700/15 text-red-700 border-red-700/30",
    icon: <X className="h-3 w-3" />,
  },
}

export const SlackImportErrorsDialog: React.FC<Props> = ({ jobId, open, onOpenChange }) => {
  const { toast } = useToast()
  const [filter, setFilter] = useState<"" | "warning" | "error" | "fatal">("")
  const [items, setItems] = useState<SlackImportError[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const reset = useCallback(() => {
    setItems([])
    setDone(false)
  }, [])

  const fetchPage = useCallback(
    async (offset: number, severity: typeof filter) => {
      setLoading(true)
      try {
        const page = await getSlackImportErrors(
          jobId,
          severity || undefined,
          PAGE_SIZE,
          offset,
        )
        if (offset === 0) setItems(page)
        else setItems((prev) => [...prev, ...page])
        if (page.length < PAGE_SIZE) setDone(true)
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any
        toast({
          title: "Could not load errors",
          description: e?.response?.data?.error || e?.message,
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    },
    [jobId, toast],
  )

  useEffect(() => {
    if (!open) return
    reset()
    fetchPage(0, filter)
  }, [open, filter, fetchPage, reset])

  const onChangeFilter = (v: typeof filter) => {
    setFilter(v)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import errors</DialogTitle>
          <DialogDescription>
            Skipped items, unsupported features, and infra failures for this import.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          {(["", "warning", "error", "fatal"] as const).map((v) => (
            <Button
              key={v || "all"}
              variant={filter === v ? "default" : "outline"}
              size="sm"
              onClick={() => onChangeFilter(v)}
            >
              {v ? v.charAt(0).toUpperCase() + v.slice(1) : "All"}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-auto border border-border/40 rounded-md">
          {items.length === 0 && !loading && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No matching entries.
            </div>
          )}
          <ul className="divide-y divide-border/40 text-xs">
            {items.map((row) => {
              const sev = SEVERITY_BADGE[row.severity] || SEVERITY_BADGE.error
              return (
                <li key={row.id} className="p-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`gap-1 ${sev.className}`}>
                      {sev.icon}
                      {row.severity}
                    </Badge>
                    {row.code && <Badge variant="outline">{row.code}</Badge>}
                    {row.entity_type && (
                      <Badge variant="outline">{row.entity_type}</Badge>
                    )}
                    {row.slack_id && (
                      <span className="text-muted-foreground font-mono">
                        {row.slack_id}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-foreground/90">{row.message}</div>
                </li>
              )
            })}
          </ul>
          {loading && (
            <div className="py-4 flex justify-center text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {!done && !loading && items.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => fetchPage(items.length, filter)}>
                Load more
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
