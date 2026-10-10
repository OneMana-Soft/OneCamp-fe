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
 *
 * The counts read like the task panel, quiet labels with their values in
 * ink. Each mapping is named for the source value it maps and offers
 * OneCamp's statuses by their names ("In progress"), where it offered the
 * raw keys ("inProgress") in a select no screen reader could name. Every
 * warning can be read: past the eighth they were "… and 4 more".
 */

import React, { useEffect, useId, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useToast } from "@/hooks/use-toast"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { readableBytes } from "@/lib/readableBytes"
import { taskPriorityOptions, taskStatusLabel } from "@/types/task"
import {
  type ImportJob,
  type ImportPlan,
  type ImportProblem,
  type ProviderInfo,
  importProblemOf,
  jobChanged,
  needsReconnect,
  planImportJob,
  runImportJob,
} from "@/services/importService"
import { Loader2 } from "lucide-react"

const ONECAMP_STATUSES = ["todo", "inProgress", "backlog", "inReview", "canceled", "done"] as const
const ONECAMP_PRIORITIES = ["low", "medium", "high"] as const
const priorityLabel = (p: string) => taskPriorityOptions.find((o) => o.id === p)?.label ?? p

/** Warnings shown before "Show N more". */
const FIRST_WARNINGS = 8

interface Props {
  job: ImportJob
  providerInfo: ProviderInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: () => void
  /** Opens the provider's connect dialog, for a plan refused over its token. */
  onReconnect?: () => void
  /** Loads the import again, when it moved on while it was being planned. */
  onChanged?: () => void
}

export const ImportPlanDialog: React.FC<Props> = ({
  job,
  providerInfo,
  open,
  onOpenChange,
  onStarted,
  onReconnect,
  onChanged,
}) => {
  const { toast } = useToast()
  const ids = useId()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [priorityMap, setPriorityMap] = useState<Record<string, string>>({})
  // The source's values as it wrote them, for the names of the mappings.
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [allWarnings, setAllWarnings] = useState(false)
  // Why planning failed, shown in the dialog. A failure used to leave the
  // dialog spinning for good behind a toast.
  const [problem, setProblem] = useState<ImportProblem | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setProblem(null)
      try {
        const result = await planImportJob(job.id, {})
        if (cancelled) return
        setPlan(result)
        setAllWarnings(false)

        // Pre-fill mappings: prefer existing job mappings → provider defaults → heuristic.
        const names: Record<string, string> = {}
        const defaults = providerInfo?.default_status_map ?? {}
        const initialStatus: Record<string, string> = {}
        for (const v of result.status_values ?? []) {
          const key = v.toLowerCase()
          names[`status:${key}`] = v
          initialStatus[key] = job.status_mappings?.[key] ?? defaults[key] ?? "todo"
        }
        setStatusMap(initialStatus)

        const pdef = providerInfo?.default_priority_map ?? {}
        const initialPriority: Record<string, string> = {}
        for (const v of result.priority_values ?? []) {
          const key = v.toLowerCase()
          names[`priority:${key}`] = v
          initialPriority[key] = job.priority_mappings?.[key] ?? pdef[key] ?? "medium"
        }
        setPriorityMap(initialPriority)
        setSourceNames(names)
      } catch (err: unknown) {
        if (cancelled) return
        const p = importProblemOf(err, "Couldn't plan this import. Try again.")
        setProblem(p)
        // Run started it from another tab, say: the import is loaded again
        // behind the dialog, to show what it is now.
        if (jobChanged(p)) onChanged?.()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job.id, attempt])

  const summary = useMemo(() => {
    if (!plan) return []
    const out: { label: string; value: string }[] = []
    const n = (v: number) => v.toLocaleString("en")
    if (plan.user_count) out.push({ label: "People", value: peopleLine(plan) })
    if (plan.team_count) out.push({ label: "Teams", value: n(plan.team_count) })
    if (plan.project_count) out.push({ label: "Projects", value: n(plan.project_count) })
    if (plan.task_count) out.push({ label: "Tasks", value: n(plan.task_count) })
    if (plan.subtask_count) out.push({ label: "Subtasks", value: n(plan.subtask_count) })
    if (plan.comment_count) out.push({ label: "Comments", value: n(plan.comment_count) })
    if (plan.file_count) out.push({ label: "Files", value: `${n(plan.file_count)} (${readableBytes(plan.file_bytes)})` })
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
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({
        title: "Couldn't start the import",
        description: importProblemOf(err).message,
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const warnings = plan?.warnings ?? []
  const shownWarnings = allWarnings ? warnings : warnings.slice(0, FIRST_WARNINGS)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plan the import of {job.source_workspace_name}</DialogTitle>
          <DialogDescription>
            What will come across, and how the source&apos;s statuses and priorities become OneCamp&apos;s. Nothing
            is imported until you start it.
          </DialogDescription>
        </DialogHeader>

        {problem && !loading ? (
          <div role="alert" className="space-y-3 py-4">
            <p className="break-words text-sm text-danger-ink">{problem.message}</p>
            <div className="flex flex-wrap gap-2">
              {needsReconnect(problem) && onReconnect && (
                <Button size="sm" onClick={onReconnect}>Reconnect</Button>
              )}
              {!jobChanged(problem) && (
                <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
              )}
            </div>
          </div>
        ) : loading || !plan ? (
          <div role="status" aria-label="Planning the import" className="py-2">
            <SkeletonRows rows={5} avatar={false} lines={1} />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Counts */}
            <dl className="space-y-1.5">
              {summary.map((s) => (
                <div key={s.label} className={fieldRow("center", "mb-0")}>
                  <dt className={fieldLabel}>{s.label}</dt>
                  <dd className="text-sm">{s.value}</dd>
                </div>
              ))}
            </dl>

            {/* Warnings, every one of them on request */}
            {warnings.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                <div className="mb-1 font-medium text-warning-ink">
                  {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-warning-ink">
                  {shownWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                {warnings.length > FIRST_WARNINGS && (
                  <Button variant="link" className="mt-1 h-auto p-0 text-sm" onClick={() => setAllWarnings((v) => !v)}>
                    {allWarnings ? "Show fewer" : `Show ${warnings.length - FIRST_WARNINGS} more`}
                  </Button>
                )}
              </div>
            )}

            {/* Status mapping */}
            {Object.keys(statusMap).length > 0 && (
              <section aria-labelledby={`${ids}-status`} className="space-y-2 border-t border-border pt-4">
                <div>
                  <h3 id={`${ids}-status`} className="text-sm font-medium">Statuses</h3>
                  <p className="text-xs text-muted-foreground">Which OneCamp status each of the source&apos;s statuses becomes.</p>
                </div>
                <div className="grid gap-2">
                  {Object.entries(statusMap).map(([src, tgt]) => {
                    const name = sourceNames[`status:${src}`] ?? src
                    return (
                      <MappingRow key={src} name={name}>
                        <select
                          aria-label={`OneCamp status for ${name}`}
                          value={tgt}
                          onChange={(e) => setStatusMap((m) => ({ ...m, [src]: e.target.value }))}
                          className="flex h-8 w-44 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {ONECAMP_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {taskStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      </MappingRow>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Priority mapping */}
            {Object.keys(priorityMap).length > 0 && (
              <section aria-labelledby={`${ids}-priority`} className="space-y-2 border-t border-border pt-4">
                <div>
                  <h3 id={`${ids}-priority`} className="text-sm font-medium">Priorities</h3>
                  <p className="text-xs text-muted-foreground">Which OneCamp priority each of the source&apos;s priorities becomes.</p>
                </div>
                <div className="grid gap-2">
                  {Object.entries(priorityMap).map(([src, tgt]) => {
                    const name = sourceNames[`priority:${src}`] ?? src
                    return (
                      <MappingRow key={src} name={name}>
                        <select
                          aria-label={`OneCamp priority for ${name}`}
                          value={tgt}
                          onChange={(e) => setPriorityMap((m) => ({ ...m, [src]: e.target.value }))}
                          className="flex h-8 w-44 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          {ONECAMP_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {priorityLabel(p)}
                            </option>
                          ))}
                        </select>
                      </MappingRow>
                    )
                  })}
                </div>
              </section>
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

/** A source value, an arrow, and the OneCamp value it becomes, at one x down the list. */
function MappingRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_auto_auto] items-center gap-2">
      <span className="truncate text-sm" title={name}>
        {name}
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        →
      </span>
      {children}
    </div>
  )
}

/**
 * The people line of a plan. Only an import that counts who is new and who
 * is already here says so; the others said "(0 new, 0 merged)" about every
 * person they found. Pure.
 */
export function peopleLine(plan: Pick<ImportPlan, "user_count" | "user_new" | "user_merge">): string {
  if (!plan.user_new && !plan.user_merge) return String(plan.user_count)
  return `${plan.user_count} (${plan.user_new} new, ${plan.user_merge} already here)`
}
