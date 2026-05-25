"use client"

/**
 * ImportPlanDialog — runs the Plan stage and lets the operator confirm
 * the source-status → OneCamp-status (and priority) mappings before the
 * Run stage commits anything.
 *
 * Flow:
 *   1. On open, calls /admin/import/jobs/{id}/plan with the operator's
 *      current options to get counts + the unique status/priority values
 *      observed in the source.
 *   2. Pre-fills the mapping dropdowns from the provider's defaults.
 *   3. On "Start import", calls /admin/import/jobs/{id}/run with the
 *      confirmed mappings.
 */

import React, { useEffect, useMemo, useState } from "react"
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
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import {
  type ImportJob,
  type ImportPlan,
  type ProviderInfo,
  planImportJob,
  runImportJob,
} from "@/services/importService"
import { Loader2 } from "lucide-react"

const ONECAMP_STATUSES = ["todo", "inProgress", "backlog", "inReview", "canceled", "done"] as const
const ONECAMP_PRIORITIES = ["low", "medium", "high"] as const

interface Props {
  job: ImportJob
  providerInfo: ProviderInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: () => void
}

export const ImportPlanDialog: React.FC<Props> = ({
  job,
  providerInfo,
  open,
  onOpenChange,
  onStarted,
}) => {
  const { toast } = useToast()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [priorityMap, setPriorityMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const result = await planImportJob(job.id, {})
        if (cancelled) return
        setPlan(result)

        // Pre-fill mappings: prefer existing job mappings → provider defaults → heuristic.
        const defaults = providerInfo?.default_status_map ?? {}
        const initialStatus: Record<string, string> = {}
        for (const v of result.status_values ?? []) {
          const key = v.toLowerCase()
          initialStatus[key] = job.status_mappings?.[key] ?? defaults[key] ?? "todo"
        }
        setStatusMap(initialStatus)

        const pdef = providerInfo?.default_priority_map ?? {}
        const initialPriority: Record<string, string> = {}
        for (const v of result.priority_values ?? []) {
          const key = v.toLowerCase()
          initialPriority[key] = job.priority_mappings?.[key] ?? pdef[key] ?? "medium"
        }
        setPriorityMap(initialPriority)
      } catch (err: any) {
        toast({
          title: "Plan failed",
          description: err?.response?.data?.error || err?.message,
          variant: "destructive",
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, job.id])

  const summary = useMemo(() => {
    if (!plan) return []
    const out: { label: string; value: string }[] = []
    if (plan.user_count) out.push({ label: "Users", value: `${plan.user_count} (${plan.user_new} new, ${plan.user_merge} merged)` })
    if (plan.team_count) out.push({ label: "Teams", value: String(plan.team_count) })
    if (plan.project_count) out.push({ label: "Projects", value: String(plan.project_count) })
    if (plan.task_count) out.push({ label: "Tasks", value: String(plan.task_count) })
    if (plan.subtask_count) out.push({ label: "Subtasks", value: String(plan.subtask_count) })
    if (plan.comment_count) out.push({ label: "Comments", value: String(plan.comment_count) })
    if (plan.file_count) out.push({ label: "Files", value: `${plan.file_count} (${formatBytes(plan.file_bytes)})` })
    return out
  }, [plan])

  const handleStart = async () => {
    setSubmitting(true)
    try {
      await runImportJob(job.id, {
        status_mappings: statusMap,
        priority_mappings: priorityMap,
      })
      toast({ title: "Import started" })
      onStarted()
      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: "Could not start",
        description: err?.response?.data?.error || err?.message,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan: {job.source_workspace_name}</DialogTitle>
          <DialogDescription>
            Review what will be imported and confirm how source statuses and priorities
            map to OneCamp values.
          </DialogDescription>
        </DialogHeader>

        {loading || !plan ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Counts */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {summary.map((s) => (
                <div key={s.label} className="flex justify-between rounded border bg-muted/30 px-3 py-2">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Warnings */}
            {plan.warnings && plan.warnings.length > 0 && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <div className="mb-1 font-medium text-amber-600">Warnings</div>
                <ul className="list-disc space-y-1 pl-5 text-amber-600/90">
                  {plan.warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {plan.warnings.length > 8 && (
                    <li>… and {plan.warnings.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}

            {/* Status mapping */}
            {Object.keys(statusMap).length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="text-sm font-medium">
                  Status mapping
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Map source values to OneCamp task statuses.
                  </span>
                </div>
                <div className="grid gap-2">
                  {Object.entries(statusMap).map(([src, tgt]) => (
                    <div key={src} className="flex items-center gap-2">
                      <Badge variant="outline" className="min-w-[120px] justify-center">
                        {src}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <select
                        value={tgt}
                        onChange={(e) =>
                          setStatusMap((m) => ({ ...m, [src]: e.target.value }))
                        }
                        className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      >
                        {ONECAMP_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority mapping */}
            {Object.keys(priorityMap).length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="text-sm font-medium">
                  Priority mapping
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Map source priorities to OneCamp task priorities.
                  </span>
                </div>
                <div className="grid gap-2">
                  {Object.entries(priorityMap).map(([src, tgt]) => (
                    <div key={src} className="flex items-center gap-2">
                      <Badge variant="outline" className="min-w-[120px] justify-center">
                        {src}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <select
                        value={tgt}
                        onChange={(e) =>
                          setPriorityMap((m) => ({ ...m, [src]: e.target.value }))
                        }
                        className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm"
                      >
                        {ONECAMP_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
          <Button onClick={handleStart} disabled={loading || !plan || submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…
              </>
            ) : (
              "Start import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}
