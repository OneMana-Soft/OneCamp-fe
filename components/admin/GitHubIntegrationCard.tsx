"use client"

import React, { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GitBranch, Link2, Unlink, RefreshCw, Download, CheckCircle2, Github, Search, Settings2, Copy, AlertTriangle, GitPullRequest } from "@/lib/icons";
import { ExternalLink, Plug, PlugZap, Workflow } from "lucide-react";
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { openUI } from "@/store/slice/uiSlice"
import type { ProjectInfoInterface } from "@/types/project"
import axiosInstance from "@/lib/axiosInstance"
import GitHubWebhookHealth from "@/components/admin/GitHubWebhookHealth"

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

const GitHubIntegrationCard = () => {
  const dispatch = useDispatch()
  const { data: statusData, isLoading, mutate } = useFetch<GitHubStatusResp>(GetEndpointUrl.GetGitHubStatus)
  const { data: rateLimitData } = useFetch<{ connected: boolean; remaining?: number; limit?: number; percent?: number }>(
    GetEndpointUrl.GetGitHubRateLimit
  )
  const { data: projectListData, isLoading: projectsLoading } = useFetch<{ data: { user_projects: ProjectInfoInterface[] } }>(GetEndpointUrl.GetUserProjectList)
  const post = usePost()
  const { toast } = useToast()

  const [showRepoDialog, setShowRepoDialog] = useState(false)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [importingIssuesLink, setImportingIssuesLink] = useState<string | null>(null)
  const [importingPRsLink, setImportingPRsLink] = useState<string | null>(null)
  const [linkingRepo, setLinkingRepo] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [syncIssues, setSyncIssues] = useState(true)
  const [syncPRs, setSyncPRs] = useState(true)
  const [autoCreateTasks, setAutoCreateTasks] = useState(false)
  const [repoSearch, setRepoSearch] = useState("")
  const [showSettingsLinkId, setShowSettingsLinkId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const statusOptions = [
    { id: "backlog", label: "Backlog" },
    { id: "todo", label: "To Do" },
    { id: "inProgress", label: "In Progress" },
    { id: "inReview", label: "In Review" },
    { id: "done", label: "Done" },
    { id: "canceled", label: "Canceled" },
  ]

  const status = statusData?.status
  const isConnected = status?.connected || false
  const linkedRepos = Array.isArray(status?.linked_repos) ? status.linked_repos : []
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

  const handleConnect = async () => {
    try {
      const res = await post.makeRequest<any, { auth_url: string }>({
        method: "GET",
        apiEndpoint: GetEndpointUrl.GetGitHubAuthUrl as any,
      })
      const authUrl = res?.auth_url
      if (authUrl) window.location.href = authUrl
      else toast({ title: "Not Configured", description: "GitHub integration is not configured. Please contact your system administrator.", variant: "destructive" })
    } catch {}
  }

  const handleFetchRepos = async () => {
    setShowRepoDialog(true)
    setReposLoading(true)
    setSelectedProjectId("")
    setRepoSearch("")
    setSyncIssues(true); setSyncPRs(true); setAutoCreateTasks(false)
    try {
      const res = await post.makeRequest<any, { repos: GitHubRepo[] }>({
        method: "GET",
        apiEndpoint: GetEndpointUrl.GetGitHubRepos as any,
      })
      setRepos(res?.repos || [])
    } catch { setRepos([]) }
    finally { setReposLoading(false) }
  }

  const handleLinkRepo = async (repo: GitHubRepo) => {
    if (!selectedProjectId) {
      toast({ title: "Project Required", description: "Please select a project to link this repository to.", variant: "destructive" })
      return
    }
    setLinkingRepo(repo.full_name)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.GitHubLinkRepo,
        payload: { project_id: selectedProjectId, repo_owner: repo.owner, repo_name: repo.name, sync_issues: syncIssues, sync_prs: syncPRs, auto_create_tasks: autoCreateTasks },
        showToast: true,
      })
      toast({ title: "Webhook Registered", description: `Webhook has been registered on ${repo.full_name}. Events will be delivered automatically.` })
      setShowRepoDialog(false)
      mutate()
    } catch {} finally { setLinkingRepo(null) }
  }

  // Polls a GitHub import job until it transitions out of running.
  // We use a fixed 1.5s cadence and cap the wait at ~3 minutes; the
  // background worker drains far quicker than that for typical
  // repositories. On a hard cap timeout we tell the user the job is
  // still running and surface the job id so they can check later.
  const pollImportJob = async (jobId: string, kind: "issues" | "PRs"): Promise<void> => {
    const maxAttempts = 120 // 120 * 1500ms = 3 minutes
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
          toast({ title: "Import complete", description: parts.join(" · ") })
          return
        }
        if (job?.Status === "failed" || job?.status === "failed") {
          const errMsg = job.ErrorMessage ?? job.error_message ?? "import failed"
          toast({ title: "Import failed", description: errMsg, variant: "destructive" })
          return
        }
      } catch {
        // transient error; let the loop retry
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    toast({
      title: "Import still running",
      description: "The import is taking longer than expected. It will continue in the background.",
    })
  }

  const handleImportIssues = async (linkId: string) => {
    setImportingIssuesLink(linkId)
    try {
      const res = await post.makeRequest<any, { job_id: string }>({
        apiEndpoint: PostEndpointUrl.GitHubImportIssues,
        appendToUrl: `/${linkId}`,
        showErrorToast: true,
      })
      const jobId = res?.job_id
      if (!jobId) {
        toast({ title: "Import scheduled", description: "Import will run in the background." })
        return
      }
      toast({ title: "Import scheduled", description: "Importing issues — this may take a moment." })
      await pollImportJob(jobId, "issues")
    } catch {} finally { setImportingIssuesLink(null) }
  }

  const handleImportPRs = async (linkId: string) => {
    setImportingPRsLink(linkId)
    try {
      const res = await post.makeRequest<any, { job_id: string }>({
        apiEndpoint: PostEndpointUrl.GitHubImportPRs,
        appendToUrl: `/${linkId}`,
        showErrorToast: true,
      })
      const jobId = res?.job_id
      if (!jobId) {
        toast({ title: "Import scheduled", description: "Import will run in the background." })
        return
      }
      toast({ title: "Import scheduled", description: "Importing PRs — this may take a moment." })
      await pollImportJob(jobId, "PRs")
    } catch {} finally { setImportingPRsLink(null) }
  }

  const getProjectName = (projectId: string) => projectNameMap.get(projectId) || "Unknown Project"

  const safeParseAutomationRules = (rules?: AutomationRules | string): AutomationRules | undefined => {
    if (!rules) return undefined
    if (typeof rules === 'string') {
      try {
        return JSON.parse(rules) as AutomationRules
      } catch {
        return undefined
      }
    }
    return rules
  }

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const lowerSearch = repoSearch.toLowerCase();
    return repos.filter(repo => 
      repo.full_name.toLowerCase().includes(lowerSearch) || 
      (repo.description && repo.description.toLowerCase().includes(lowerSearch))
    );
  }, [repos, repoSearch]);

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md"><GitBranch className="h-4 w-4 text-primary" /></div>
          <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">Integrations</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">Connect external services for bidirectional sync. Link GitHub repositories to sync issues, PRs, and branches with your tasks.</CardDescription>
      </CardHeader>

      <CardContent className="px-0 flex-1 overflow-y-auto pr-4 custom-scrollbar pb-10 min-h-0">
        {isLoading ? (
          <div className="text-sm text-muted-foreground animate-pulse">Loading integration status...</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-gray-900 dark:bg-gray-100 p-2.5 rounded-xl shrink-0"><Github className="h-5 w-5 text-white dark:text-gray-900" /></div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm">GitHub</h3>
                  <p className="text-xs text-muted-foreground truncate">Sync issues, PRs, and branches with OneCamp tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {isConnected ? (
                  <>
                    <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"><CheckCircle2 className="h-3 w-3" />Connected</Badge>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleFetchRepos}><Link2 className="h-3.5 w-3.5" />Link Repo</Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => dispatch(openUI({ key: "githubDisconnect", data: { repoCount: linkedRepos.length } }))}>
                      <Unlink className="h-3.5 w-3.5" />Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="gap-1.5" onClick={handleConnect}><Plug className="h-3.5 w-3.5" />Connect GitHub</Button>
                )}
              </div>
            </div>

            {isConnected && rateLimitData?.connected && (rateLimitData.percent || 100) < 20 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div className="text-xs">
                  <span className="font-medium">GitHub API rate limit low:</span> {rateLimitData.remaining} / {rateLimitData.limit} requests remaining. Sync operations may fail until the limit resets.
                </div>
              </div>
            )}

            {isConnected && linkedRepos.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Linked Repositories</h4>
                  <div className="space-y-3">
                    {linkedRepos.map(link => (
                      <div key={link.id} className="border border-border/50 rounded-lg bg-card/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={`https://github.com/${link.repo_owner}/${link.repo_name}`} target="_blank" rel="noopener noreferrer" className="font-medium text-sm hover:underline flex items-center gap-1 truncate">{link.repo_owner}/{link.repo_name}<ExternalLink className="h-3 w-3 shrink-0" /></a>
                              <Badge variant="outline" className="text-[10px]">{getProjectName(link.project_id)}</Badge>
                            </div>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {link.sync_issues && <Badge variant="outline" className="text-[10px]">Issues</Badge>}
                              {link.sync_prs && <Badge variant="outline" className="text-[10px]">PRs</Badge>}
                              {link.auto_create_tasks && <Badge variant="secondary" className="text-[10px]">Auto-create tasks</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap shrink-0">
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => handleImportIssues(link.id)} disabled={importingIssuesLink === link.id || importingPRsLink === link.id}>
                            {importingIssuesLink === link.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Import Issues
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => handleImportPRs(link.id)} disabled={importingIssuesLink === link.id || importingPRsLink === link.id}>
                            {importingPRsLink === link.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}Import PRs
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettingsLinkId(link.id)}>
                            <Settings2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => dispatch(openUI({ key: "githubUnlink", data: { id: link.id, repo_owner: link.repo_owner, repo_name: link.repo_name } }))}>
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Webhook delivery health — only meaningful once we're
                 connected and have at least one linked repo (no repos
                 means no webhooks were registered). */}
            {isConnected && linkedRepos.length > 0 && (
              <>
                <Separator />
                <GitHubWebhookHealth />
              </>
            )}

            {isConnected && linkedRepos.length === 0 && (
              <>
                <Separator />
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <PlugZap className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No repositories linked yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Link a GitHub repository to start syncing issues and PRs.</p>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleFetchRepos}><Link2 className="h-3.5 w-3.5" />Link Repository</Button>
                </div>
              </>
            )}

            {!isConnected && (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border/50 rounded-lg">
                <Github className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground font-medium">GitHub not connected</p>
                <p className="text-sm text-muted-foreground/70 mt-1 mb-4 max-w-md">Connect your GitHub account to enable bidirectional sync between issues, pull requests, and OneCamp tasks.</p>
                <Button className="gap-2" onClick={handleConnect}><Github className="h-4 w-4" />Connect GitHub</Button>
              </div>
            )}
          </div>
        )}

        <Dialog open={showRepoDialog} onOpenChange={setShowRepoDialog}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 bg-background">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle>Link a Repository</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 custom-scrollbar">
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Project *</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={projectsLoading}>
                  <SelectTrigger>
                    {projectsLoading ? <span className="text-muted-foreground animate-pulse">Loading projects...</span> : <SelectValue placeholder="Select a project..." />}
                  </SelectTrigger>
                  <SelectContent>
                    {projects.length === 0 && !projectsLoading ? (
                      <div className="text-sm text-muted-foreground px-2 py-4 text-center">No projects available</div>
                    ) : (
                      projects.map(p => <SelectItem key={p.project_uuid} value={p.project_uuid}>{p.project_name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">GitHub issues and PRs will create tasks in this project.</p>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Sync Issue Updates</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Keep linked tasks up-to-date with GitHub issue changes (status, assignees, labels).</p>
                  </div>
                  <Switch 
                    checked={syncIssues} 
                    onCheckedChange={(checked) => {
                      setSyncIssues(checked);
                      if (!checked && !syncPRs) setAutoCreateTasks(false);
                    }} 
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Sync PR Updates</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Keep linked tasks up-to-date with GitHub pull request changes (merges, closures).</p>
                  </div>
                  <Switch 
                    checked={syncPRs} 
                    onCheckedChange={(checked) => {
                      setSyncPRs(checked);
                      if (!checked && !syncIssues) setAutoCreateTasks(false);
                    }} 
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div className={(!syncIssues && !syncPRs) ? "opacity-50" : ""}>
                    <Label className="text-sm font-semibold">Auto-create Tasks</Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Automatically create a new OneCamp task when a new issue or PR is opened in GitHub.</p>
                  </div>
                  <Switch 
                    checked={autoCreateTasks} 
                    onCheckedChange={setAutoCreateTasks} 
                    disabled={!syncIssues && !syncPRs}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    disabled={!selectedProjectId || reposLoading || repos.length === 0}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9"
                  />
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-1">
                  {!selectedProjectId ? <div className="text-sm text-muted-foreground text-center py-8">Select a project above first.</div> :
                  reposLoading ? (
                    <div className="space-y-3 py-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border/50 animate-pulse bg-muted/20">
                          <div className="space-y-2 flex-1 pr-4">
                            <div className="h-4 bg-muted rounded w-3/4"></div>
                            <div className="h-3 bg-muted rounded w-1/2"></div>
                          </div>
                          <div className="h-8 w-16 bg-muted rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) :
                  repos.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">No repositories found.</div> :
                  filteredRepos.length === 0 ? <div className="text-sm text-muted-foreground text-center py-8">No repositories match your search.</div> :
                  filteredRepos.map(repo => {
                    const alreadyLinked = linkedRepos.some(l => l.repo_owner === repo.owner && l.repo_name === repo.name)
                    return (
                      <div key={repo.full_name} className={`flex items-center justify-between p-3 rounded-lg border border-border/50 transition-colors ${alreadyLinked ? "opacity-50" : "hover:bg-muted/30"}`}>
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{repo.full_name}</span>
                            {repo.private && <Badge variant="secondary" className="text-[10px] shrink-0">Private</Badge>}
                            {alreadyLinked && <Badge variant="outline" className="text-[10px] shrink-0">Already linked</Badge>}
                          </div>
                          {repo.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{repo.description}</p>}
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => handleLinkRepo(repo)} disabled={alreadyLinked || linkingRepo === repo.full_name}>
                          {linkingRepo === repo.full_name ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                          {alreadyLinked ? "Linked" : "Link"}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!showSettingsLinkId} onOpenChange={() => setShowSettingsLinkId(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0 bg-background">
            {(() => {
              const link = linkedRepos.find(l => l.id === showSettingsLinkId)
              if (!link) return null

              const currentRules = safeParseAutomationRules(link.automation_rules) || {}

              const allRules = [
                { section: "Issues", items: [
                  { key: "issue_opened", label: "Issue opened", desc: "When an issue is opened" },
                  { key: "issue_closed", label: "Issue closed", desc: "When an issue is closed" },
                  { key: "issue_reopened", label: "Issue reopened", desc: "When an issue is reopened" },
                ]},
                { section: "Pull Requests", items: [
                  { key: "pr_drafted", label: "PR drafted", desc: "When a PR is converted to draft" },
                  { key: "pr_opened", label: "PR opened", desc: "When a PR is opened (not draft)" },
                  { key: "review_requested", label: "Review requested", desc: "When a review is requested" },
                  { key: "changes_requested", label: "Changes requested", desc: "When a reviewer requests changes" },
                  { key: "approved", label: "PR approved", desc: "When a PR is approved" },
                  { key: "pr_merged", label: "PR merged", desc: "When a PR is merged" },
                  { key: "pr_closed_without_merge", label: "PR closed (not merged)", desc: "When a PR is closed without merging" },
                ]},
                { section: "Commits", items: [
                  { key: "commit_linked", label: "Commit linked", desc: "When a commit message contains fix/close keywords" },
                ]},
              ]

              return (
                <>
                  <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                      <Workflow className="h-4 w-4" /> Automation Rules
                    </DialogTitle>
                  </DialogHeader>
                  <div className="px-6 pb-2 shrink-0">
                    <p className="text-sm text-muted-foreground">
                      Configure automatic status transitions for <span className="font-medium text-foreground">{link.repo_owner}/{link.repo_name}</span>.
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4 custom-scrollbar">
                    {allRules.map((group, gIdx) => (
                      <div key={group.section} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background py-1 z-10">{group.section}</p>
                        <div className="space-y-1">
                          {group.items.map(rule => (
                            <div key={rule.key} className="flex items-center justify-between gap-3 py-1.5">
                              <div className="min-w-0">
                                <Label className="text-sm font-medium">{rule.label}</Label>
                                <p className="text-[11px] text-muted-foreground leading-tight">{rule.desc}</p>
                              </div>
                              <Select
                                value={currentRules[rule.key as keyof AutomationRules] || ""}
                                onValueChange={async (val) => {
                                  setSavingSettings(true)
                                  try {
                                    const updated = { ...currentRules, [rule.key]: val }
                                    await post.makeRequest({
                                      apiEndpoint: PostEndpointUrl.GitHubUpdateAutomationRules,
                                      url: `/admin/github/links/${link.id}/automation-rules`,
                                      payload: { automation_rules: updated },
                                      showToast: true,
                                    })
                                    mutate()
                                  } catch {
                                    // Error toast handled by usePost
                                  } finally {
                                    setSavingSettings(false)
                                  }
                                }}
                              >
                                <SelectTrigger className="w-[130px] h-7 text-xs">
                                  <SelectValue placeholder="No change" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">No change</SelectItem>
                                  {statusOptions.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                        {gIdx < allRules.length - 1 && <div className="border-t mt-3" />}
                      </div>
                    ))}
                  </div>
                  <div className="px-6 pb-6 pt-2 border-t space-y-2 shrink-0">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5" /> Branch name format
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Default format for copying branch names. Variables: {"{taskId}"}, {"{slug}"}, {"{user}"}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        defaultValue={link.branch_format || "feature/{taskId}-{slug}"}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onBlur={async (e) => {
                          setSavingSettings(true)
                          try {
                            await post.makeRequest({
                              apiEndpoint: PostEndpointUrl.GitHubUpdateBranchFormat,
                              url: `/admin/github/links/${link.id}/branch-format`,
                              payload: { branch_format: e.target.value },
                              showToast: true,
                            })
                            mutate()
                          } catch {
                            // Error toast handled by usePost
                          } finally {
                            setSavingSettings(false)
                          }
                        }}
                      />
                    </div>
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export default GitHubIntegrationCard
