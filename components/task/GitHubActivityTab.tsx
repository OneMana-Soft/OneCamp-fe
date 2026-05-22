"use client"

import React from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Github, GitBranch, MessageSquare, Smile, GitCommit, AlertCircle, CheckCircle2, RotateCcw, Tag, User, GitPullRequest, GitPullRequestDraft, GitMerge } from "@/lib/icons";
import { CopyCheck, FileDiff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatDistanceToNow } from "date-fns"

interface GitHubTaskActivity {
  id: string
  task_id: string
  activity_type: string
  github_login?: string
  github_avatar_url?: string
  github_html_url?: string
  title?: string
  body?: string
  payload?: string
  created_at: string
}

interface Props {
  taskUUID: string
}

const activityIcon = (type: string) => {
  switch (type) {
    case "comment": return <MessageSquare className="h-4 w-4 text-blue-400" />
    case "reaction": return <Smile className="h-4 w-4 text-yellow-400" />
    case "pr_opened": return <GitPullRequest className="h-4 w-4 text-green-400" />
    case "pr_drafted": return <GitPullRequestDraft className="h-4 w-4 text-purple-400" />
    case "pr_ready_for_review": return <GitPullRequest className="h-4 w-4 text-green-400" />
    case "pr_closed": return <AlertCircle className="h-4 w-4 text-red-400" />
    case "pr_merged": return <GitMerge className="h-4 w-4 text-gray-400" />
    case "pr_reopened": return <RotateCcw className="h-4 w-4 text-orange-400" />
    case "pr_edited": return <FileDiff className="h-4 w-4 text-blue-400" />
    case "pr_review_approved": return <CopyCheck className="h-4 w-4 text-green-400" />
    case "pr_review_changes_requested": return <FileDiff className="h-4 w-4 text-red-400" />
    case "pr_review_commented": return <MessageSquare className="h-4 w-4 text-blue-400" />
    case "review_requested": return <User className="h-4 w-4 text-amber-400" />
    case "issue_opened": return <Github className="h-4 w-4 text-blue-400" />
    case "issue_closed": return <CheckCircle2 className="h-4 w-4 text-green-400" />
    case "issue_reopened": return <RotateCcw className="h-4 w-4 text-orange-400" />
    case "issue_edited": return <FileDiff className="h-4 w-4 text-blue-400" />
    case "branch_created": return <GitBranch className="h-4 w-4 text-cyan-400" />
    case "commit_pushed": return <GitCommit className="h-4 w-4 text-gray-400" />
    case "commit_linked": return <GitCommit className="h-4 w-4 text-emerald-400" />
    case "status_synced": return <CheckCircle2 className="h-4 w-4 text-green-400" />
    case "assignee_synced": return <User className="h-4 w-4 text-pink-400" />
    case "label_synced": return <Tag className="h-4 w-4 text-indigo-400" />
    default: return <Github className="h-4 w-4 text-muted-foreground" />
  }
}

const activityLabel = (type: string) => {
  switch (type) {
    case "comment": return "commented"
    case "reaction": return "reacted"
    case "pr_opened": return "opened a pull request"
    case "pr_drafted": return "converted PR to draft"
    case "pr_ready_for_review": return "marked PR ready for review"
    case "pr_closed": return "closed a pull request"
    case "pr_reopened": return "reopened a pull request"
    case "pr_merged": return "merged a pull request"
    case "pr_edited": return "edited a pull request"
    case "pr_review_approved": return "approved the pull request"
    case "pr_review_changes_requested": return "requested changes"
    case "pr_review_commented": return "reviewed the pull request"
    case "review_requested": return "requested a review"
    case "issue_opened": return "opened an issue"
    case "issue_closed": return "closed an issue"
    case "issue_reopened": return "reopened an issue"
    case "issue_edited": return "edited an issue"
    case "branch_created": return "created a branch"
    case "commit_pushed": return "pushed a commit"
    case "commit_linked": return "linked a commit"
    case "status_synced": return "synced status"
    case "assignee_synced": return "synced assignee"
    case "label_synced": return "synced label"
    default: return type.replace(/_/g, " ")
  }
}

export default function GitHubActivityTab({ taskUUID }: Props) {
  const activitiesRes = useFetch<{ activities: GitHubTaskActivity[] }>(
    taskUUID ? `${GetEndpointUrl.GetGitHubTaskActivity}/${taskUUID}` : ""
  )

  const activities = activitiesRes.data?.activities || []

  if (activitiesRes.isLoading) {
    return <div className="text-xs text-muted-foreground py-4">Loading GitHub activity...</div>
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Github className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No GitHub activity yet</p>
        <p className="text-xs opacity-60">Activity from linked issues, PRs, and branches will appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-2 pr-2">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3 items-start p-2 rounded-lg hover:bg-muted/40 transition-colors">
          <div className="mt-0.5">{activityIcon(activity.activity_type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {activity.github_avatar_url ? (
                <Avatar className="h-5 w-5">
                  <AvatarImage src={activity.github_avatar_url} className="rounded-full" />
                  <AvatarFallback className="text-[10px]">{activity.github_login?.[0]}</AvatarFallback>
                </Avatar>
              ) : (
                <Github className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs font-medium truncate">
                {activity.github_login ? (
                  <a href={activity.github_html_url || `https://github.com/${activity.github_login}`} target="_blank" rel="noreferrer" className="hover:underline">
                    @{activity.github_login}
                  </a>
                ) : "GitHub"}
                {" "}{activityLabel(activity.activity_type)}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {activity.created_at ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }) : ""}
              </span>
            </div>
            {activity.title && (
              <p className="text-xs font-medium text-foreground truncate">{activity.title}</p>
            )}
            {activity.body && (
              <p className="text-xs text-muted-foreground line-clamp-3 mt-0.5">{activity.body}</p>
            )}
            {activity.activity_type === "reaction" && activity.payload && (
              <span className="text-sm mt-1 inline-block">{activity.payload}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
