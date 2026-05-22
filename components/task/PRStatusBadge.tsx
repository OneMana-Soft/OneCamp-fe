"use client"

import React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { GitBranch, GitPullRequest, GitPullRequestDraft, GitMerge, GitPullRequestClosed, CheckCircle2, XCircle, Clock, AlertCircle, CircleDot } from "@/lib/icons";
import type { TaskInfoInterface } from "@/types/task"

interface PRStatusBadgeProps {
  task: TaskInfoInterface
  size?: "sm" | "md"
}

function extractGitHubRepo(url?: string): string {
  if (!url) return ""
  const match = url.match(/^https:\/\/github\.com\/([^\/]+\/[^\/]+)/)
  return match ? match[1] : ""
}

const stateConfig: Record<string, { label: string; icon: React.ReactNode; className: string; dotClass?: string }> = {
  draft: {
    label: "Draft",
    icon: <GitPullRequestDraft className="h-3 w-3" />,
    className: "bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400",
  },
  open: {
    label: "Open",
    icon: <GitPullRequest className="h-3 w-3" />,
    className: "bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/10 dark:text-green-400",
  },
  merged: {
    label: "Merged",
    icon: <GitMerge className="h-3 w-3" />,
    className: "bg-gray-500/10 text-gray-600 border-gray-500/20 dark:bg-gray-500/10 dark:text-gray-400 line-through",
  },
  closed: {
    label: "Closed",
    icon: <GitPullRequestClosed className="h-3 w-3" />,
    className: "bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  },
}

const checkStatusConfig: Record<string, { dotClass: string; tooltip: string }> = {
  success: { dotClass: "bg-green-500", tooltip: "Checks passing" },
  failure: { dotClass: "bg-red-500", tooltip: "Checks failing" },
  neutral: { dotClass: "bg-gray-500", tooltip: "Checks neutral" },
  cancelled: { dotClass: "bg-gray-400", tooltip: "Checks cancelled" },
  timed_out: { dotClass: "bg-amber-500", tooltip: "Checks timed out" },
  action_required: { dotClass: "bg-red-600", tooltip: "Action required" },
  skipped: { dotClass: "bg-gray-400", tooltip: "Checks skipped" },
  in_progress: { dotClass: "bg-amber-400 animate-pulse", tooltip: "Checks running" },
  queued: { dotClass: "bg-yellow-400 animate-pulse", tooltip: "Checks queued" },
  pending: { dotClass: "bg-yellow-400 animate-pulse", tooltip: "Checks pending" },
}

export default function PRStatusBadge({ task, size = "sm" }: PRStatusBadgeProps) {
  if (!task.task_github_pr_url) return null

  const state = task.task_github_pr_state || (task.task_github_pr_is_draft ? "draft" : "open")
  const config = stateConfig[state] || stateConfig.open
  const checkStatus = task.task_github_pr_check_status
  const checkConfig = checkStatus ? checkStatusConfig[checkStatus] : null
  const repo = extractGitHubRepo(task.task_github_pr_url)

  const isSmall = size === "sm"
  const labelText = repo
    ? (isSmall ? `${repo}#${task.task_github_pr_number}` : `${config.label} ${repo}#${task.task_github_pr_number}`)
    : (isSmall ? `PR #${task.task_github_pr_number}` : `${config.label} #${task.task_github_pr_number}`)

  return (
    <a
      href={task.task_github_pr_url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium transition-colors hover:opacity-80",
        isSmall ? "px-1.5 py-0 h-5 text-[10px]" : "px-2 py-0.5 h-6 text-xs",
        config.className
      )}
      title={`${config.label}${checkConfig ? ` • ${checkConfig.tooltip}` : ""}`}
    >
      {config.icon}
      <span className={cn(isSmall && "hidden sm:inline")}>{labelText}</span>
      {checkConfig && (
        <span className={cn("relative ml-0.5 flex h-2 w-2", isSmall && "hidden sm:flex")}>
          <span className={cn("inline-flex h-2 w-2 rounded-full", checkConfig.dotClass)} />
        </span>
      )}
    </a>
  )
}

export function IssueStatusBadge({ task, size = "sm" }: PRStatusBadgeProps) {
  if (!task.task_github_issue_url) return null

  const isSmall = size === "sm"
  const repo = extractGitHubRepo(task.task_github_issue_url)

  return (
    <a
      href={task.task_github_issue_url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/50 text-muted-foreground font-medium transition-colors hover:bg-muted hover:text-foreground",
        isSmall ? "px-1.5 py-0 h-5 text-[10px]" : "px-2 py-0.5 h-6 text-xs"
      )}
      title={`${repo}#${task.task_github_issue_number}`}
    >
      <CircleDot className="h-3 w-3" />
      <span className={cn(isSmall && "hidden sm:inline")}>{repo ? `${repo}#${task.task_github_issue_number}` : `#${task.task_github_issue_number}`}</span>
    </a>
  )
}

export function GitHubBadgeGroup({ task, size = "sm" }: PRStatusBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <PRStatusBadge task={task} size={size} />
      <IssueStatusBadge task={task} size={size} />
    </div>
  )
}
