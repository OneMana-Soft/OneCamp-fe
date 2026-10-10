"use client"

/**
 * GitHubIntegrationCard: connect GitHub, link repositories to projects, and
 * choose what their events do to tasks.
 *
 * A settings section like its neighbours on the Integrations tab; it used to
 * be a full-height scroll box between two sections that aren't. Not
 * connected, it shows the connections plug with one way to connect, and when
 * the server has no GitHub app yet, Connect opens the credentials instead of
 * telling the administrator to ask their system administrator.
 *
 * An import's progress is followed only while the section is on screen: the
 * poll used to run on for up to three minutes after it was gone.
 */

import { eyebrowClass } from "@/components/ui/eyebrow"
import { useEffect, useMemo, useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SpotPlug } from "@/components/ui/graphics"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import {
  AlertTriangle,
  Download,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Github,
  Link2,
  RefreshCw,
  Search,
  Settings2,
  Unlink,
  Workflow,
} from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { cn } from "@/lib/utils/helpers/cn"
import { openUI } from "@/store/slice/uiSlice"
import type { ProjectInfoInterface } from "@/types/project"
import axiosInstance from "@/lib/axiosInstance"
import GitHubWebhookHealth from "@/components/admin/GitHubWebhookHealth"
import GitHubConfigDialog from "@/components/admin/GitHubConfigDialog"

interface AutomationRules {
  // Issue rules
  issue_opened?: string
  issue_closed?: string
  issue_reopened?: string
  // PR rules
  pr_drafted?: string
  pr_opened?: string
  review_requested?: string
  changes_requested?: string
  approved?: string
  pr_merged?: string
  pr_closed_without_merge?: string
  // Commit rules
  commit_linked?: string
}

interface GitHubLink {
  id: string
  project_id: string
  repo_owner: string
  repo_name: string
  sync_issues: boolean
  sync_prs: boolean
  auto_create_tasks: boolean
  default_task_status: string
  automation_rules?: AutomationRules
  branch_format?: string
  created_at: string
}

interface GitHubStatusResp {
  status: { connected: boolean; linked_repos?: GitHubLink[] }
}

interface GitHubRepo {
  full_name: string; owner: string; name: string; description: string; private: boolean; html_url: string
}

const DEFAULT_BRANCH_FORMAT = "feature/{taskId}-{slug}"

const RULE_GROUPS: { section: string; items: { key: keyof AutomationRules; label: string; desc: string }[] }[] = [
  { section: "Issues", items: [
    { key: "issue_opened", label: "Issue opened", desc: "When an issue is opened" },
    { key: "issue_closed", label: "Issue closed", desc: "When an issue is closed" },
    { key: "issue_reopened", label: "Issue reopened", desc: "When an issue is reopened" },
  ]},
  { section: "Pull requests", items: [
    { key: "pr_drafted", label: "PR drafted", desc: "When a PR is converted to a draft" },
    { key: "pr_opened", label: "PR opened", desc: "When a PR is opened, not as a draft" },
    { key: "review_requested", label: "Review requested", desc: "When a review is requested" },
    { key: "changes_requested", label: "Changes requested", desc: "When a reviewer asks for changes" },
    { key: "approved", label: "PR approved", desc: "When a PR is approved" },
    { key: "pr_merged", label: "PR merged", desc: "When a PR is merged" },
    { key: "pr_closed_without_merge", label: "PR closed, not merged", desc: "When a PR is closed without merging" },
  ]},
  { section: "Commits", items: [
    { key: "commit_linked", label: "Commit linked", desc: "When a commit message says it fixes or closes a task" },
  ]},
]

/** What a linked repository does, as one quiet line. Pure. */
export function linkSummary(link: Pick<GitHubLink, "sync_issues" | "sync_prs" | "auto_create_tasks">, projectName: string): string {
  const syncs =
    link.sync_issues && link.sync_prs
      ? "Issues and PRs sync"
      : link.sync_issues
        ? "Issues sync"
        : link.sync_prs
          ? "PRs sync"
          : "Nothing syncs"
  return [projectName, syncs, link.auto_create_tasks ? "New ones become tasks" : ""].filter(Boolean).join(" · ")
}

const safeParseAutomationRules = (rules?: AutomationRules | string): AutomationRules | undefined => {
  if (!rules) return undefined
  if (typeof rules === "string") {
    try {
      return JSON.parse(rules) as AutomationRules
    } catch {
      return undefined
    }
  }
  return rules
}

const GitHubIntegrationCard = () => {
  const dispatch = useDispatch()
  const { data: statusData, isLoading, isError, mutate } = useFetch<GitHubStatusResp>(GetEndpointUrl.GetGitHubStatus)
  const { data: rateLimitData } = useFetch<{ connected: boolean; remaining?: number; limit?: number; percent?: number }>(
    GetEndpointUrl.GetGitHubRateLimit
  )
  const { data: projectListData, isLoading: projectsLoading } = useFetch<{ data: { user_projects: ProjectInfoInterface[] } }>(GetEndpointUrl.GetUserProjectList)
  const post = usePost()
  const { toast } = useToast()

  const [showRepoDialog, setShowRepoDialog] = useState(false)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposFailed, setReposFailed] = useState(false)
  const [importingIssuesLink, setImportingIssuesLink] = useState<string | null>(null)
  const [importingPRsLink, setImportingPRsLink] = useState<string | null>(null)
  const [linkingRepo, setLinkingRepo] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [projectError, setProjectError] = useState("")
  const projectRef = useRef<HTMLButtonElement>(null)
  const [syncIssues, setSyncIssues] = useState(true)
  const [syncPRs, setSyncPRs] = useState(true)
  const [autoCreateTasks, setAutoCreateTasks] = useState(false)
  const [repoSearch, setRepoSearch] = useState("")
  const [showSettingsLinkId, setShowSettingsLinkId] = useState<string | null>(null)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [configReason, setConfigReason] = useState<string | undefined>()

  // False once the section is gone, so an import's poll stops with it.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const status = statusData?.status
  const isConnected = status?.connected || false
  const linkedRepos = Array.isArray(status?.linked_repos) ? status.linked_repos : []
  // The rules dialog offers the linked project's own statuses beside the
  // built-in ones; a rule stores a built-in key or a custom status's id.
  const rulesProjectId = linkedRepos.find((l) => l.id === showSettingsLinkId)?.project_id
  const { options: ruleStatusOptions } = useProjectStatuses(rulesProjectId)
  const projects = useMemo(() => {
    const raw = Array.isArray(projectListData?.data?.user_projects) ? projectListData.data.user_projects : []
    return raw.filter(p => {
      if (!p.project_deleted_at) return true
      try {
        const t = new Date(p.project_deleted_at).getTime()
        return t <= 0 || t < 1e12
      } catch { return true }
    })
  }, [projectListData])

  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>()
    projects.forEach(p => map.set(p.project_uuid, p.project_name))
    return map
  }, [projects])

  const openCredentials = (reason?: string) => {
    setConfigReason(reason)
    setShowConfigDialog(true)
  }

  const handleConnect = async () => {
    try {
      const res = await post.makeRequest<any, { auth_url: string }>({
        method: "GET",
        apiEndpoint: GetEndpointUrl.GetGitHubAuthUrl as any,
      })
      const authUrl = res?.auth_url
      if (authUrl) window.location.href = authUrl
      // No GitHub app on this server yet. The credentials are one dialog
      // away, so open it rather than send the admin to "your administrator".
      else openCredentials("GitHub needs an OAuth app before it can connect. Add its client ID and secret, then connect.")
    } catch {}
  }

  const loadRepos = async () => {
    setReposLoading(true)
    setReposFailed(false)
    try {
      const res = await post.makeRequest<any, { repos: GitHubRepo[] }>({
        method: "GET",
        apiEndpoint: GetEndpointUrl.GetGitHubRepos as any,
      })
      setRepos(res?.repos || [])
    } catch {
      // Not "No repositories found": the list is unknown, not empty.
      setRepos([])
      setReposFailed(true)
    } finally {
      setReposLoading(false)
    }
  }

  const handleFetchRepos = () => {
    setShowRepoDialog(true)
    setSelectedProjectId("")
    setProjectError("")
    setRepoSearch("")
    setSyncIssues(true); setSyncPRs(true); setAutoCreateTasks(false)
    void loadRepos()
  }

  const handleLinkRepo = async (repo: GitHubRepo) => {
    if (!selectedProjectId) {
      setProjectError("Choose the project first.")
      projectRef.current?.focus()
      return
    }
    setLinkingRepo(repo.full_name)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.GitHubLinkRepo,
        payload: { project_id: selectedProjectId, repo_owner: repo.owner, repo_name: repo.name, sync_issues: syncIssues, sync_prs: syncPRs, auto_create_tasks: autoCreateTasks },
        showToast: true,
      })
      toast({ title: "Repository linked", description: `GitHub now sends ${repo.full_name}'s events here.` })
      setShowRepoDialog(false)
      mutate()
    } catch {} finally { setLinkingRepo(null) }
  }

  // Polls a GitHub import job until it transitions out of running.
  // We use a fixed 1.5s cadence and cap the wait at ~3 minutes; the
  // background worker drains far quicker than that for typical
  // repositories. On a hard cap timeout we tell the user the job is
  // still running. Stops at once when the section goes away.
  const pollImportJob = async (jobId: string, kind: "issues" | "PRs"): Promise<void> => {
    const maxAttempts = 120 // 120 * 1500ms = 3 minutes
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!alive.current) return
      try {
        const res = await axiosInstance.get(`${GetEndpointUrl.GetGitHubImportJob}/${jobId}`)
        const job = res.data?.job
        if (job?.Status === "completed" || job?.status === "completed") {
          const imported = job.ItemsImported ?? job.items_imported ?? 0
          const skipped = job.ItemsSkipped ?? job.items_skipped ?? 0
          const failed = job.ItemsFailed ?? job.items_failed ?? 0
          const parts = [`${imported} ${kind} imported`]
          if (skipped > 0) parts.push(`${skipped} skipped`)
          if (failed > 0) parts.push(`${failed} failed`)
          toast({ title: "Import finished", description: parts.join(" · ") })
          return
        }
        if (job?.Status === "failed" || job?.status === "failed") {
          const errMsg = job.ErrorMessage ?? job.error_message ?? "Try again in a moment."
          toast({ title: `Couldn't import the ${kind}`, description: errMsg, variant: "destructive" })
          return
        }
      } catch {
        // transient error; let the loop retry
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    if (!alive.current) return
    toast({
      title: "Import still running",
      description: "It is taking longer than usual and carries on in the background.",
    })
  }

  const handleImport = async (link: GitHubLink, kind: "issues" | "PRs") => {
    const setBusy = kind === "issues" ? setImportingIssuesLink : setImportingPRsLink
    setBusy(link.id)
    try {
      const res = await post.makeRequest<any, { job_id: string }>({
        apiEndpoint: kind === "issues" ? PostEndpointUrl.GitHubImportIssues : PostEndpointUrl.GitHubImportPRs,
        appendToUrl: `/${link.id}`,
        showErrorToast: true,
      })
      const jobId = res?.job_id
      toast({
        title: `Importing ${kind} from ${link.repo_owner}/${link.repo_name}`,
        description: jobId ? "This can take a moment." : "It runs in the background.",
      })
      if (jobId) await pollImportJob(jobId, kind)
    } catch {} finally {
      if (alive.current) setBusy(null)
    }
  }

  const getProjectName = (projectId: string) => projectNameMap.get(projectId) || "Unknown project"

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const lowerSearch = repoSearch.toLowerCase();
    return repos.filter(repo =>
      repo.full_name.toLowerCase().includes(lowerSearch) ||
      (repo.description && repo.description.toLowerCase().includes(lowerSearch))
    );
  }, [repos, repoSearch]);

  const linkRepoButton = (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleFetchRepos}>
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />Link a repository
    </Button>
  )

  const settingsLink = linkedRepos.find(l => l.id === showSettingsLinkId)

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2.5">
          <Tile hue={ADMIN_GROUP_HUE.connections} size="md"><Github /></Tile>
          GitHub
        </span>
      }
      description="Link repositories to projects, so issues and pull requests stay in step with their tasks and branches."
    >
      {isLoading ? (
        <div role="status" aria-label="Loading the GitHub connection" className="rounded-lg border border-border px-4 py-3">
          <SkeletonRows rows={2} avatar={false} />
        </div>
      ) : isError ? (
        <ErrorState subject="the GitHub connection status" onRetry={() => void mutate()} />
      ) : !isConnected ? (
        // After the failure branch: isConnected is `status?.connected || false`,
        // so a failed fetch would otherwise read as "not connected" and offer a
        // Connect that starts a redundant OAuth flow.
        <EmptyState
          illustration={<SpotPlug hue={ADMIN_GROUP_HUE.connections} />}
          title="GitHub isn't connected"
          description="Connect it to keep issues and pull requests in step with tasks, both ways."
          className="py-6"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void handleConnect()}>
                <Github className="h-3.5 w-3.5" aria-hidden="true" />Connect GitHub
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openCredentials()}>
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />Credentials
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Words, like the sign-in providers on this tab. */}
            <p className="text-sm font-medium text-success-ink">Connected</p>
            <div className="flex flex-wrap items-center gap-2">
              {linkedRepos.length > 0 && linkRepoButton}
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openCredentials()}>
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />Credentials
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-danger-ink hover:text-danger-ink" onClick={() => dispatch(openUI({ key: "githubDisconnect", data: { repoCount: linkedRepos.length } }))}>
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" />Disconnect
              </Button>
            </div>
          </div>

          {rateLimitData?.connected && (rateLimitData.percent || 100) < 20 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-warning-ink" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-xs">
                <span className="font-medium">GitHub&apos;s request limit is nearly used up:</span>{" "}
                {rateLimitData.remaining} of {rateLimitData.limit} left. Syncing may fail until it resets.
              </p>
            </div>
          )}

          {linkedRepos.length === 0 ? (
            <EmptyState
              icon={Link2}
              hue={ADMIN_GROUP_HUE.connections}
              title="No repositories linked yet"
              description="Link one to a project to start syncing its issues and pull requests."
              className="py-6"
              action={linkRepoButton}
            />
          ) : (
            <>
              <div className="space-y-2">
                <h3 id="github-linked-repos" className="text-sm font-medium">Linked repositories</h3>
                <ul aria-labelledby="github-linked-repos" className="divide-y divide-border rounded-lg border border-border">
                  {linkedRepos.map(link => {
                    const full = `${link.repo_owner}/${link.repo_name}`
                    const importing = importingIssuesLink === link.id || importingPRsLink === link.id
                    return (
                      <li key={link.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0 space-y-0.5">
                          <a
                            href={`https://github.com/${full}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                          >
                            <span className="truncate">{full}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="sr-only"> (opens GitHub)</span>
                          </a>
                          <p className="truncate text-xs text-muted-foreground">{linkSummary(link, getProjectName(link.project_id))}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label={`Import issues from ${full}`} onClick={() => void handleImport(link, "issues")} disabled={importing}>
                            {importingIssuesLink === link.id ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Download className="h-3 w-3" aria-hidden="true" />}Import issues
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label={`Import PRs from ${full}`} onClick={() => void handleImport(link, "PRs")} disabled={importing}>
                            {importingPRsLink === link.id ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : <GitPullRequest className="h-3 w-3" aria-hidden="true" />}Import PRs
                          </Button>
                          <Button aria-label={`Automation rules for ${full}`} variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSettingsLinkId(link.id)}>
                            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button aria-label={`Unlink ${full}`} variant="ghost" size="icon" className="h-8 w-8 text-danger-ink hover:text-danger-ink"
                            onClick={() => dispatch(openUI({ key: "githubUnlink", data: { id: link.id, repo_owner: link.repo_owner, repo_name: link.repo_name } }))}>
                            <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {/* Webhook delivery health: only meaningful with a linked repo,
                  since no repos means no webhooks were registered. */}
              <GitHubWebhookHealth />
            </>
          )}
        </>
      )}

      <Dialog open={showRepoDialog} onOpenChange={setShowRepoDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 bg-background">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Link a repository</DialogTitle>
            <DialogDescription>Its issues and pull requests stay in step with tasks in the project you choose.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 custom-scrollbar">
            <div className="space-y-1.5">
              <Label htmlFor="github-link-project" className="text-sm font-medium">Project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={(v) => { setSelectedProjectId(v); setProjectError("") }}
                disabled={projectsLoading}
              >
                <SelectTrigger
                  id="github-link-project"
                  ref={projectRef}
                  aria-invalid={projectError ? true : undefined}
                  aria-describedby={projectError ? "github-link-project-error" : "github-link-project-help"}
                >
                  <SelectValue placeholder={projectsLoading ? "Loading projects…" : "Choose a project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 && !projectsLoading ? (
                    <div className="text-sm text-muted-foreground px-2 py-4 text-center">No projects yet</div>
                  ) : (
                    projects.map(p => <SelectItem key={p.project_uuid} value={p.project_uuid}>{p.project_name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
              {projectError ? (
                <p id="github-link-project-error" role="alert" className="text-xs text-danger-ink">{projectError}</p>
              ) : (
                <p id="github-link-project-help" className="text-xs text-muted-foreground">Issues and pull requests from GitHub become tasks in this project.</p>
              )}
            </div>
            <SettingsList>
              <SwitchRow
                label="Sync issue updates"
                description="Keep linked tasks up to date with changes to issues: status, assignees and labels."
                checked={syncIssues}
                onChange={(checked) => {
                  setSyncIssues(checked)
                  if (!checked && !syncPRs) setAutoCreateTasks(false)
                }}
              />
              <SwitchRow
                label="Sync pull request updates"
                description="Keep linked tasks up to date with merges and closures."
                checked={syncPRs}
                onChange={(checked) => {
                  setSyncPRs(checked)
                  if (!checked && !syncIssues) setAutoCreateTasks(false)
                }}
              />
              <SwitchRow
                label="Create tasks automatically"
                description="A new issue or pull request in GitHub becomes a new task."
                checked={autoCreateTasks}
                disabled={!syncIssues && !syncPRs}
                onChange={setAutoCreateTasks}
              />
            </SettingsList>
            <div className="space-y-3">
              <div className="relative">
                <Label htmlFor="github-repo-search" className="sr-only">Search repositories</Label>
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="github-repo-search"
                  type="search"
                  placeholder="Search repositories…"
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  disabled={reposLoading || repos.length === 0}
                  className="pl-9"
                />
              </div>
              {reposLoading ? (
                <div role="status" aria-label="Loading your repositories" className="rounded-lg border border-border px-3 py-2">
                  <SkeletonRows rows={3} avatar={false} />
                </div>
              ) : reposFailed ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                  <p className="text-sm text-muted-foreground">Couldn&apos;t load your repositories.</p>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => void loadRepos()}>Try again</Button>
                </div>
              ) : repos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">GitHub has no repositories for this account.</p>
              ) : filteredRepos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No repositories match “{repoSearch.trim()}”.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {filteredRepos.map(repo => {
                    const alreadyLinked = linkedRepos.some(l => l.repo_owner === repo.owner && l.repo_name === repo.name)
                    return (
                      <li key={repo.full_name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className={cn("min-w-0 flex-1", alreadyLinked && "opacity-60")}>
                          <p className="flex items-center gap-2 text-sm">
                            <span className="truncate font-medium">{repo.full_name}</span>
                            {repo.private && <span className="shrink-0 text-xs text-muted-foreground">Private</span>}
                          </p>
                          {repo.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{repo.description}</p>}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1.5"
                          aria-label={alreadyLinked ? `${repo.full_name} is already linked` : `Link ${repo.full_name}`}
                          onClick={() => void handleLinkRepo(repo)}
                          disabled={alreadyLinked || linkingRepo === repo.full_name}
                        >
                          {linkingRepo === repo.full_name ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Link2 className="h-3 w-3" aria-hidden="true" />}
                          {alreadyLinked ? "Linked" : "Link"}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settingsLink} onOpenChange={() => setShowSettingsLinkId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0 bg-background">
          {settingsLink && (
            <AutomationRulesBody
              link={settingsLink}
              ruleStatusOptions={ruleStatusOptions}
              onSaved={() => mutate()}
            />
          )}
        </DialogContent>
      </Dialog>

      <GitHubConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        onSaved={() => mutate()}
        reason={configReason}
      />
    </SettingsSection>
  )
}

/**
 * The rules for one linked repository. Each pick saves at once, and the
 * branch format when you leave its field, so the dialog says so.
 */
function AutomationRulesBody({
  link,
  ruleStatusOptions,
  onSaved,
}: {
  link: GitHubLink
  ruleStatusOptions: { value: string; label: string; custom?: boolean }[]
  onSaved: () => void
}) {
  const post = usePost()
  const currentRules = safeParseAutomationRules(link.automation_rules) || {}
  const savedFormat = link.branch_format || DEFAULT_BRANCH_FORMAT

  const saveRule = async (key: keyof AutomationRules, val: string) => {
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.GitHubUpdateAutomationRules,
        url: `/admin/github/links/${link.id}/automation-rules`,
        payload: { automation_rules: { ...currentRules, [key]: val } },
        showToast: true,
      })
      onSaved()
    } catch {
      // usePost shows the error, in the server's words.
    }
  }

  const saveFormat = async (value: string) => {
    if (value === savedFormat) return
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.GitHubUpdateBranchFormat,
        url: `/admin/github/links/${link.id}/branch-format`,
        payload: { branch_format: value },
        showToast: true,
      })
      onSaved()
    } catch {
      // usePost shows the error, in the server's words.
    }
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <Tile hue={ADMIN_GROUP_HUE.connections} size="sm"><Workflow /></Tile>
          Automation rules
        </DialogTitle>
        <DialogDescription>
          What GitHub events do to tasks linked from{" "}
          <span className="font-medium text-foreground">{link.repo_owner}/{link.repo_name}</span>. Changes save as you make them.
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4 custom-scrollbar">
        {RULE_GROUPS.map((group, gIdx) => (
          <div key={group.section} className="space-y-2">
            <p className={cn(eyebrowClass, "sticky top-0 bg-background py-1 z-10")}>{group.section}</p>
            <div className="space-y-1">
              {group.items.map(rule => {
                const id = `github-rule-${rule.key}`
                const v = currentRules[rule.key]
                return (
                  <div key={rule.key} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <Label htmlFor={id} className="text-sm font-medium">{rule.label}</Label>
                      <p id={`${id}-desc`} className="text-xs text-muted-foreground leading-tight">{rule.desc}</p>
                    </div>
                    <Select value={v || ""} onValueChange={(val) => void saveRule(rule.key, val)}>
                      <SelectTrigger id={id} aria-describedby={`${id}-desc`} className="h-8 w-40 shrink-0 text-xs">
                        <SelectValue placeholder="No change" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No change</SelectItem>
                        {ruleStatusOptions.map(s => (
                          <SelectItem key={s.value} value={s.value} className={cn(s.custom && "pl-6")}>{s.label}</SelectItem>
                        ))}
                        {/* A value saved before statuses were checked, which this
                            project no longer has: shown, so the rule is not silently blank. */}
                        {v && v !== "_none" && !ruleStatusOptions.some(o => o.value === v) ? (
                          <SelectItem value={v}>{v} (not a status here)</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
            {gIdx < RULE_GROUPS.length - 1 && <div className="border-t mt-3" />}
          </div>
        ))}
      </div>
      <div className="px-6 pb-6 pt-3 border-t space-y-1.5 shrink-0">
        <Label htmlFor="github-branch-format" className="text-sm font-medium flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Branch name format
        </Label>
        <p id="github-branch-format-help" className="text-xs text-muted-foreground">
          Used when someone copies a branch name from a task. You can use {"{taskId}"}, {"{slug}"} and {"{user}"}.
        </p>
        <Input
          id="github-branch-format"
          aria-describedby="github-branch-format-help"
          type="text"
          defaultValue={savedFormat}
          spellCheck={false}
          autoComplete="off"
          className="h-8"
          onBlur={(e) => void saveFormat(e.target.value)}
        />
      </div>
    </>
  )
}

export default GitHubIntegrationCard
