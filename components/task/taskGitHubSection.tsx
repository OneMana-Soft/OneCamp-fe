"use client"

import { cn } from "@/lib/utils/helpers/cn"
import { Github, GitBranch, GitPullRequest, CircleDot, RefreshCw, Download, Copy, AlertCircle, CheckCircle2 } from "@/lib/icons";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button"
import type { TaskInfoInterface } from "@/types/task"
import PRStatusBadge from "@/components/task/PRStatusBadge"
import { useToast } from "@/hooks/use-toast"

/** "onemana/app#42" from a GitHub address, or "#42" when it names no repository. Pure. */
function refOf(url: string, n: number | undefined, kind: "pull" | "issues"): string {
  const m = url.match(new RegExp(`^https://github\\.com/([^/]+/[^/]+)/${kind}/\\d+`))
  return m ? `${m[1]}#${n ?? ""}` : `#${n ?? ""}`
}

/** A pull request's state in a word. Pure. */
function prStateWord(task: Pick<TaskInfoInterface, "task_github_pr_state" | "task_github_pr_is_draft">): string {
  const state = task.task_github_pr_state || (task.task_github_pr_is_draft ? "draft" : "open")
  return state === "draft" ? "Draft" : state === "merged" ? "Merged" : state === "closed" ? "Closed" : "Open"
}

export type ChecksTone = "ok" | "bad" | "busy" | "quiet"

/** What a pull request's checks are doing, in words and a tone; null with no checks. Pure. */
export function checksInWords(status?: string | null): { text: string; tone: ChecksTone } | null {
  switch (status) {
    case "success":
      return { text: "Checks passing", tone: "ok" }
    case "failure":
      return { text: "Checks failing", tone: "bad" }
    case "action_required":
      return { text: "Action required", tone: "bad" }
    case "timed_out":
      return { text: "Checks timed out", tone: "bad" }
    case "in_progress":
    case "queued":
    case "pending":
      return { text: "Checks running", tone: "busy" }
    case "cancelled":
      return { text: "Checks cancelled", tone: "quiet" }
    case "skipped":
      return { text: "Checks skipped", tone: "quiet" }
    case "neutral":
      return { text: "Checks neutral", tone: "quiet" }
    default:
      return null
  }
}

const CHECKS_INK: Record<ChecksTone, string> = { ok: "text-success-ink", bad: "text-danger-ink", busy: "text-warning-ink", quiet: "text-ink-3" }
const CHECKS_DOT: Record<ChecksTone, string> = { ok: "bg-success", bad: "bg-destructive", busy: "bg-warning", quiet: "bg-ink-4" }

/** The checks, as a dot and their words: on a phone too. */
function ChecksLine({ status }: { status?: string }) {
  const c = checksInWords(status)
  if (!c) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 rounded-full", CHECKS_DOT[c.tone], c.tone === "busy" && "motion-safe:animate-pulse")} />
      <span className={cn("text-2xs font-medium", CHECKS_INK[c.tone])}>{c.text}</span>
    </span>
  )
}

interface TaskGitHubSectionProps {
  task: TaskInfoInterface
  isAdmin: boolean
  taskUUID: string
  syncStatus?: {
    status: string
    error?: string
  }
  githubConnected: boolean
  onRetrySync: () => void
  onRefresh: () => void
  onBackfill: () => void
  onUnlink: () => void
  onCreatePR: () => void
  onLinkGitHub: () => void
}

export function TaskGitHubSection({
  task,
  isAdmin,
  syncStatus,
  githubConnected,
  onRetrySync,
  onRefresh,
  onBackfill,
  onUnlink,
  onCreatePR,
  onLinkGitHub,
}: TaskGitHubSectionProps) {
  const { toast } = useToast()

  const hasAnyLink = task.task_github_issue_url || task.task_github_pr_url || task.task_github_branch
  const canCreatePR = isAdmin && githubConnected && task.task_github_branch && !task.task_github_pr_url
  const canLink = isAdmin && githubConnected && !hasAnyLink

  return (
    <div className="space-y-3">
      {hasAnyLink && (
        // The Development card (step 3, part 3): what is being built for
        // the task, in the order it happens (its branch, its pull request
        // with its state and checks in words, the issue it answers), on the
        // panel's raised card. The checks were a dot with a tooltip, hidden
        // on a phone.
        <section aria-labelledby={`dev-${task.task_uuid}`} className="rounded-lg bg-raised p-3 shadow-e1" data-dev-card="">
          <div className="mb-1.5 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 id={`dev-${task.task_uuid}`} className="text-ui-sm font-[590] text-foreground">
                Development
              </h3>
              {syncStatus?.status === "failed" && (
                <span className="flex items-center gap-1 text-2xs font-medium text-danger-ink" title={syncStatus.error || "Sync failed"}>
                  <AlertCircle className="size-3.5" />
                  Sync failed
                </span>
              )}
              {syncStatus?.status === "pending" && (
                <span className="flex items-center gap-1 text-2xs font-medium text-warning-ink">
                  <span aria-hidden className="size-2 rounded-full bg-warning motion-safe:animate-pulse" />
                  Syncing…
                </span>
              )}
              {syncStatus?.status === "synced" && (
                <span className="flex items-center gap-1 text-2xs font-medium text-success-ink" title="Synced with GitHub">
                  <CheckCircle2 className="size-3.5" />
                  Synced
                </span>
              )}
            </div>
            {isAdmin ? (
              <div className="-mx-1 flex flex-wrap items-center gap-1 sm:mx-0">
                {syncStatus?.status === "failed" && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onRetrySync}>
                    <RefreshCw className="size-3" /> Retry
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" title="Pull latest state from GitHub" onClick={onRefresh}>
                  <RefreshCw className="size-3" /> Refresh
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" title="Pull any GitHub comments that haven't been synced into OneCamp yet" onClick={onBackfill}>
                  <Download className="size-3" /> Backfill
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-danger-ink hover:text-danger-ink" onClick={onUnlink}>
                  Unlink
                </Button>
              </div>
            ) : null}
          </div>
          <dl className="space-y-0.5">
            {task.task_github_branch && (
              <div data-dev-row="branch" className="group flex min-h-9 min-w-0 items-center gap-3 rounded-md px-1">
                <dt className="flex w-28 shrink-0 items-center gap-2 text-ui-sm text-ink-3">
                  <GitBranch className="size-3.5 shrink-0" />
                  Branch
                </dt>
                <dd className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-foreground">{task.task_github_branch}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="pointer-events-none h-7 shrink-0 gap-1 text-2xs transition-opacity group-focus-within:pointer-events-auto group-hover:pointer-events-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                    onClick={(e) => {
                      e.preventDefault()
                      navigator.clipboard.writeText(task.task_github_branch || "")
                      toast({ title: "Copied branch name" })
                    }}
                  >
                    <Copy className="size-3" /> <span className="hidden sm:inline">Copy</span>
                  </Button>
                </dd>
              </div>
            )}
            {task.task_github_pr_url && (
              <div data-dev-row="pr" className="flex min-h-9 min-w-0 items-center gap-3 rounded-md px-1">
                <dt className="flex w-28 shrink-0 items-center gap-2 text-ui-sm text-ink-3">
                  <GitPullRequest className="size-3.5 shrink-0" />
                  Pull request
                </dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <a href={task.task_github_pr_url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-foreground underline-offset-2 hover:underline">
                    <span className="truncate">{refOf(task.task_github_pr_url, task.task_github_pr_number, "pull")}</span>
                    <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-3" />
                  </a>
                  <span className="text-2xs font-medium text-ink-2">{prStateWord(task)}</span>
                  <ChecksLine status={task.task_github_pr_check_status} />
                </dd>
              </div>
            )}
            {task.task_github_issue_url && (
              <div data-dev-row="issue" className="flex min-h-9 min-w-0 items-center gap-3 rounded-md px-1">
                <dt className="flex w-28 shrink-0 items-center gap-2 text-ui-sm text-ink-3">
                  <CircleDot className="size-3.5 shrink-0" />
                  Issue
                </dt>
                <dd className="min-w-0 flex-1">
                  <a href={task.task_github_issue_url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-foreground underline-offset-2 hover:underline">
                    <span className="truncate">{refOf(task.task_github_issue_url, task.task_github_issue_number, "issues")}</span>
                    <ExternalLink aria-hidden className="size-3 shrink-0 text-ink-3" />
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {canCreatePR && (
        <div
          className="p-3 border border-dashed border-border/60 rounded-lg bg-card/20 hover:bg-card/40 transition-colors cursor-pointer"
          onClick={onCreatePR}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>Create draft PR from branch</span>
          </div>
        </div>
      )}

      {canLink && (
        <div
          className="p-3 border border-dashed border-border/60 rounded-lg bg-card/20 hover:bg-card/40 transition-colors cursor-pointer"
          onClick={onLinkGitHub}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Github className="h-4 w-4" />
            <span>Link to GitHub issue or PR</span>
          </div>
        </div>
      )}
    </div>
  )
}


