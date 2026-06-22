"use client"

import { useState } from "react"
import { Github, GitBranch, Link2, RefreshCw, Download, Copy, AlertCircle, CheckCircle2, Sparkles, Loader2 } from "@/lib/icons";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button"
import type { TaskInfoInterface } from "@/types/task"
import PRStatusBadge from "@/components/task/PRStatusBadge"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { analyzeCodeIssue, type CodeAnalysisResult } from "@/services/aiModelService"
import { useToast } from "@/hooks/use-toast"

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
        <div className="p-3 border border-border/50 rounded-lg bg-card/30">
          {/*
            Header row. On phones the status cluster on the left and the
            action buttons on the right do not fit on one line, so we
            stack them vertically below `sm` and let the action buttons
            wrap. Above `sm` we keep the single-row Notion-style layout.
          */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2 px-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Github className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">GitHub</span>
              <PRStatusBadge task={task} size="sm" />
              {syncStatus?.status === "failed" && (
                <div className="flex items-center gap-1 text-destructive" title={syncStatus.error || "Sync failed"}>
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium">Sync failed</span>
                </div>
              )}
              {syncStatus?.status === "pending" && (
                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-amber-600" />
                  <span className="text-[10px] font-medium">Syncing...</span>
                </div>
              )}
              {syncStatus?.status === "synced" && (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400" title="Synced with GitHub">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium">Synced</span>
                </div>
              )}
            </div>
            {/*
              Action cluster. flex-wrap so individual buttons drop to a
              new line on phones rather than running off the right edge.
              -mx-1 lets the buttons sit flush with the card edge once
              they wrap.
            */}
            <div className="flex flex-wrap items-center gap-1 -mx-1 sm:mx-0">
              {isAdmin && syncStatus?.status === "failed" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onRetrySync}>
                  <RefreshCw className="h-3 w-3" /> Retry
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" title="Pull latest state from GitHub" onClick={onRefresh}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" title="Pull any GitHub comments that haven't been synced into OneCamp yet" onClick={onBackfill}>
                  <Download className="h-3 w-3" /> Backfill
                </Button>
              )}
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onUnlink}>
                  Unlink
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            {task.task_github_issue_url && (
              <a
                href={task.task_github_issue_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group min-w-0"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors min-w-0 flex-1">
                  <Github className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono truncate">
                    {(() => {
                      const m = task.task_github_issue_url.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)\/issues\/\d+$/)
                      return m ? `${m[1]}#${task.task_github_issue_number}` : `#${task.task_github_issue_number}`
                    })()}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground/0 group-hover:text-muted-foreground flex items-center gap-1 transition-all shrink-0 hidden sm:flex">
                  View Issue <ExternalLink className="h-3 w-3" />
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 sm:hidden" />
              </a>
            )}
            {task.task_github_pr_url && (
              <a
                href={task.task_github_pr_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group min-w-0"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors min-w-0 flex-1">
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono truncate">
                    {(() => {
                      const m = task.task_github_pr_url.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)\/pull\/\d+$/)
                      return m ? `${m[1]}#${task.task_github_pr_number}` : `PR #${task.task_github_pr_number}`
                    })()}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-medium tracking-wider text-muted-foreground/0 group-hover:text-muted-foreground flex items-center gap-1 transition-all shrink-0 hidden sm:flex">
                  View PR <ExternalLink className="h-3 w-3" />
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 sm:hidden" />
              </a>
            )}
            {task.task_github_branch && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 flex-1">
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono text-xs truncate">{task.task_github_branch}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault()
                    navigator.clipboard.writeText(task.task_github_branch || "")
                    toast({ title: "Copied branch name" })
                  }}
                >
                  <Copy className="h-3 w-3" /> <span className="hidden sm:inline">Copy</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {task.task_github_issue_url && githubConnected && (
        <CodeAnalysisPanel issueUrl={task.task_github_issue_url} title={task.task_name} body={task.task_description} />
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

// CodeAnalysisPanel lets a member run the code-aware bug agent on the linked
// GitHub issue: it retrieves the relevant repo files and shows a proposed
// root-cause + fix (a diff) for review. Read-only against GitHub. When the
// repo was too large to see fully, it offers a one-click "Analyze deeper".
function parseOwnerRepo(issueUrl: string): { owner: string; repo: string } | null {
  const m = issueUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

const CodeAnalysisPanel: React.FC<{ issueUrl: string; title: string; body: string }> = ({
  issueUrl,
  title,
  body,
}) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CodeAnalysisResult | null>(null)

  const run = async (deep: boolean) => {
    const or = parseOwnerRepo(issueUrl)
    if (!or) {
      toast({ title: "Could not read the repo from this issue link", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await analyzeCodeIssue({ owner: or.owner, repo: or.repo, title, body, deep })
      setResult(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed"
      toast({ title: "Couldn't analyze", description: msg, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">AI bug analysis</span>
        </div>
        {!result && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 shrink-0" disabled={loading} onClick={() => run(false)}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? "Analyzing…" : "Analyze with AI"}
          </Button>
        )}
      </div>

      {!result && !loading && (
        <p className="text-xs text-muted-foreground">
          Review the linked issue against the repo code and propose a root cause and a fix to review. Read-only:
          nothing is pushed to GitHub.
        </p>
      )}

      {result && (
        <div className="space-y-2 min-w-0">
          <div className="rounded-md bg-background/60 p-2 max-h-[28rem] overflow-y-auto overflow-x-hidden custom-scrollbar min-w-0">
            <MarkdownMessage content={result.answer} />
          </div>

          {result.files_considered?.length > 0 && (
            <p className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
              Looked at: {result.files_considered.join(", ")}
            </p>
          )}

          {result.partial && (
            <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                This is a large repo, so the agent could only see part of it. The fix may be incomplete.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs self-start"
                disabled={loading}
                onClick={() => run(true)}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Analyze deeper
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={loading} onClick={() => run(false)}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Re-run
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
