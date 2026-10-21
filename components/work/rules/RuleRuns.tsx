"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StateWord, type StateTone } from "@/components/admin/connectParts"
import { History, Undo2 } from "@/lib/icons"
import { relativeTime } from "@/lib/utils/relativeTime"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useRuleRuns } from "@/hooks/useProjectRules"
import type { RuleRun } from "@/lib/rules/types"

const TONE: Record<RuleRun["status"], [StateTone, string]> = {
  ok: ["success", "Done"],
  failed: ["danger", "Went wrong"],
  skipped: ["neutral", "Skipped"],
  undone: ["info", "Undone"],
  running: ["warning", "Running"],
}

/** What a run did, in a line: its steps' words, or why it didn't run. */
export function runSummary(run: RuleRun): string {
  if (run.status === "skipped") return run.error || "Skipped"
  const said = run.steps.map((s) => (s.status === "failed" ? `couldn't ${s.type.replace(/_/g, " ")}: ${s.detail ?? ""}` : s.detail || s.type.replace(/_/g, " ")))
  return said.join(" · ") || "Nothing to do"
}

/** Whether a run can be undone: it finished and changed something. */
export function undoable(run: RuleRun): boolean {
  return (run.status === "ok" || run.status === "failed") && run.steps.some((s) => s.status === "ok" && (s.field || s.type === "add_subtask"))
}

/**
 * A project's run history (or one rule's), newest first: what each run did
 * to which task, and Undo for those that changed something. Undo puts back
 * what the task still holds of the rule's change, as the person undoing.
 */
export function RuleRuns({ projectId, ruleId, ruleName, canUndo }: { projectId: string; ruleId?: string; ruleName: (id: string) => string; canUndo: boolean }) {
  const { runs, error, isLoading, undo, refresh } = useRuleRuns(projectId, ruleId)
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()
  if (error) return <ErrorState compact subject="the rules' history" onRetry={() => void refresh()} />
  if (isLoading || !runs) {
    return (
      <div role="status" aria-label="Loading the history" className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    )
  }
  if (runs.length === 0) {
    return <EmptyState icon={History} hue="sky" title="Nothing has run yet" description="Each time a rule acts, it's listed here with what it changed, and you can undo it." />
  }
  const doUndo = async (run: RuleRun) => {
    setBusy(run.id)
    try {
      await undo(run.id)
      toast({ title: "Undone", description: "What the rule changed is back as it was, unless someone changed it since." })
    } catch (e) {
      toast({ title: "Couldn't undo it", description: apiErrorMessage(e), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }
  return (
    <ul className="space-y-1.5" aria-label="Runs">
      {runs.map((run) => {
        const [tone, word] = TONE[run.status] ?? TONE.skipped
        return (
          <li key={run.id} data-rule-run={run.status} className="flex items-start gap-3 rounded-lg bg-sunken px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <StateWord tone={tone}>{word}</StateWord>
                {!ruleId && <span className="truncate text-xs font-medium text-ink-2">{ruleName(run.workflow_id)}</span>}
                <span className="text-meta tabular-nums text-ink-3">{relativeTime(run.started_at)}</span>
                {run.branch === "else" && <span className="text-meta text-ink-3">otherwise</span>}
              </div>
              {run.subject && (
                run.subject_id ? (
                  <Link href={`/app/task/${run.subject_id}`} className="mt-0.5 block truncate text-sm text-ink hover:underline">{run.subject}</Link>
                ) : (
                  <p className="mt-0.5 truncate text-sm text-ink">{run.subject}</p>
                )
              )}
              <p className="mt-0.5 line-clamp-2 text-meta text-ink-3">{runSummary(run)}</p>
            </div>
            {canUndo && undoable(run) && (
              <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 gap-1.5 md:h-8" disabled={busy === run.id} onClick={() => void doUndo(run)}>
                <Undo2 className="size-3.5" /> Undo
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
