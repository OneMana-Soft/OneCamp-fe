"use client"

/**
 * ImportErrorsDialog — paginated view of import_errors rows, filterable
 * by severity. Uses the new generic /admin/import/jobs/{id}/errors
 * endpoint which returns rows with both `source_id` and `slack_id` for
 * backward compatibility.
 */

import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, AlertTriangle, XCircle } from "lucide-react"
import { getImportErrors, type ImportError } from "@/services/importService"

interface Props {
  jobId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  fatal: <XCircle className="h-4 w-4 text-red-700" />,
}

export const ImportErrorsDialog: React.FC<Props> = ({ jobId, open, onOpenChange }) => {
  const [rows, setRows] = useState<ImportError[]>([])
  const [loading, setLoading] = useState(false)
  const [severity, setSeverity] = useState<"" | "warning" | "error" | "fatal">("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const result = await getImportErrors(jobId, severity || undefined, 200, 0)
        if (!cancelled) setRows(result)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, jobId, severity])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import errors</DialogTitle>
          <DialogDescription>
            Skipped or partially-failed items. Most are non-fatal and can be reviewed
            without re-running the import.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex items-center gap-2">
          {(["", "warning", "error", "fatal"] as const).map((s) => (
            <Button
              key={s || "all"}
              size="sm"
              variant={severity === s ? "default" : "outline"}
              onClick={() => setSeverity(s)}
            >
              {s === "" ? "All" : s}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
            No errors recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded border bg-card px-3 py-2 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  {SEVERITY_ICON[row.severity]}
                  <Badge variant="outline">{row.severity}</Badge>
                  {row.code && <Badge variant="secondary">{row.code}</Badge>}
                  {(row.source_id || row.slack_id) && (
                    <code className="rounded bg-muted px-1 text-xs">
                      {row.source_id || row.slack_id}
                    </code>
                  )}
                  {row.entity_type && (
                    <span className="text-xs text-muted-foreground">{row.entity_type}</span>
                  )}
                </div>
                <div>{row.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
