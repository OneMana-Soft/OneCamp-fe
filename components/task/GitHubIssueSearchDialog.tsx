"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefreshCw, Github, Link2, Search, AlertCircle, GitPullRequest, CircleDot, User, Calendar, Check } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast"
import { useDebounce } from "@/hooks/useDebounce"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

type SearchType = "issues" | "prs" | "all"

interface GitHubIssue {
  number: number
  title: string
  html_url: string
  state: string
  created_at: string
  user: {
    login: string
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  taskId?: string
  taskIds?: string[]
}

export default function GitHubIssueSearchDialog({ open, onOpenChange, onSuccess, taskId, taskIds }: Props) {
  const isBulk = !!taskIds && taskIds.length > 0
  const searchTaskId = taskId || taskIds?.[0] || ""
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("search")

  // Search state
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query, 350)
  const [results, setResults] = useState<GitHubIssue[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null)
  const [searchType, setSearchType] = useState<SearchType>("issues")

  // Manual link state
  const [manualUrl, setManualUrl] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setSelectedIssue(null)
      setSearchError(null)
      setManualUrl("")
      setManualError(null)
      setActiveTab("search")
      setSearchType("issues")
    }
  }, [open])

  const post = usePost()

  const performSearch = useCallback(async (q: string, type: SearchType) => {
    if (!q || q.trim().length < 2 || !searchTaskId) {
      setResults([])
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      let issues: GitHubIssue[] = []
      let prs: GitHubIssue[] = []

      if (type === "issues" || type === "all") {
        const res = await post.makeRequest<any, { issues: GitHubIssue[] }>({
          method: "GET",
          apiEndpoint: GetEndpointUrl.GetGitHubSearchIssues as any,
          appendToUrl: `/${searchTaskId}?q=${encodeURIComponent(q.trim())}`,
        })
        issues = res?.issues || []
      }
      if (type === "prs" || type === "all") {
        const res = await post.makeRequest<any, { prs: GitHubIssue[] }>({
          method: "GET",
          apiEndpoint: GetEndpointUrl.GetGitHubSearchPRs as any,
          appendToUrl: `/${searchTaskId}?q=${encodeURIComponent(q.trim())}`,
        })
        prs = res?.prs || []
      }

      // Merge and deduplicate by number + html_url
      const map = new Map<string, GitHubIssue>()
      issues.forEach(i => map.set(`${i.number}-${i.html_url}`, i))
      prs.forEach(p => map.set(`${p.number}-${p.html_url}`, p))
      setResults(Array.from(map.values()))
    } catch (e: any) {
      const msg = e.response?.data?.msg || e.response?.data?.error || "Failed to search"
      setSearchError(msg)
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [searchTaskId, post])

  useEffect(() => {
    if (activeTab === "search") {
      performSearch(debouncedQuery, searchType)
    }
  }, [debouncedQuery, activeTab, searchType, performSearch])

  const handleSelectIssue = (issue: GitHubIssue) => {
    setSelectedIssue(prev => prev?.number === issue.number ? null : issue)
  }

  const handleLinkSelected = async () => {
    if (!selectedIssue) return
    setLinking(true)
    try {
      if (isBulk && taskIds) {
        const links = taskIds.map(id => ({
          task_uuid: id,
          issue_number: selectedIssue.number,
          issue_url: selectedIssue.html_url,
        }))
        const res = await post.makeRequest<{ links: any[] }, { success_count: number }>({
          apiEndpoint: PostEndpointUrl.GitHubBulkLink,
          payload: { links },
          showErrorToast: true,
        })
        toast({
          title: "Linked Successfully",
          description: `Connected ${res?.success_count || taskIds.length} tasks to #${selectedIssue.number}.`,
        })
      } else if (taskId) {
        await post.makeRequest({
          apiEndpoint: PostEndpointUrl.GitHubLinkTask,
          appendToUrl: `/${taskId}`,
          payload: { url: selectedIssue.html_url },
          showErrorToast: true,
        })
        toast({ title: "Linked Successfully", description: `Connected to #${selectedIssue.number}: ${selectedIssue.title}` })
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      // Error toast handled by usePost showErrorToast
    } finally {
      setLinking(false)
    }
  }

  const handleManualLink = async () => {
    setManualError(null)
    const trimmed = manualUrl.trim()
    if (!trimmed) {
      setManualError("Please enter a GitHub issue or PR URL.")
      return
    }
    const match = trimmed.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/\d+$/)
    if (!match) {
      setManualError("Invalid format. Must be a valid GitHub issue or pull request URL.")
      return
    }
    setLinking(true)
    try {
      if (isBulk && taskIds) {
        // For manual URL in bulk mode, we need to extract issue number
        const urlMatch = trimmed.match(/\/(issues|pull)\/(\d+)$/)
        const issueNumber = urlMatch ? parseInt(urlMatch[2], 10) : 0
        const links = taskIds.map(id => ({
          task_uuid: id,
          issue_number: issueNumber,
          issue_url: trimmed,
        }))
        const res = await post.makeRequest<{ links: any[] }, { success_count: number }>({
          apiEndpoint: PostEndpointUrl.GitHubBulkLink,
          payload: { links },
          showErrorToast: true,
        })
        toast({
          title: "Linked Successfully",
          description: `Connected ${res?.success_count || taskIds.length} tasks.`,
        })
      } else if (taskId) {
        await post.makeRequest({
          apiEndpoint: PostEndpointUrl.GitHubLinkTask,
          appendToUrl: `/${taskId}`,
          payload: { url: trimmed },
          showErrorToast: true,
        })
        toast({ title: "Linked Successfully", description: "The task is now connected to GitHub." })
      }
      onSuccess()
      onOpenChange(false)
    } catch (e: any) {
      const msg = e.response?.data?.msg || "Failed to link. Please try again."
      setManualError(msg)
    } finally {
      setLinking(false)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    } catch {
      return iso
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            {isBulk ? `Link ${taskIds?.length} Tasks to GitHub` : "Link GitHub Issue or PR"}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? `All selected tasks will be linked to the same GitHub issue or pull request.`
              : "Connect this task to an existing GitHub issue or pull request."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="h-3.5 w-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Paste URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="flex-1 min-h-0 flex flex-col mt-3 space-y-3 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="flex gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search by ${searchType === "prs" ? "PR" : "issue"} title...`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelectedIssue(null)
                  }}
                  className="pl-9"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="flex items-center bg-muted rounded-md p-0.5 flex-shrink-0">
                <button
                  onClick={() => { setSearchType("issues"); setSelectedIssue(null); }}
                  className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${searchType === "issues" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  title="Search issues only"
                >
                  Issues
                </button>
                <button
                  onClick={() => { setSearchType("prs"); setSelectedIssue(null); }}
                  className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${searchType === "prs" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  title="Search PRs only"
                >
                  PRs
                </button>
                <button
                  onClick={() => { setSearchType("all"); setSelectedIssue(null); }}
                  className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${searchType === "all" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  title="Search both issues and PRs"
                >
                  All
                </button>
              </div>
            </div>

            {searchError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md flex-shrink-0">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {searchError}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto border rounded-md bg-muted/20">
              {searching && results.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex gap-3 items-start">
                      <div className="h-4 w-4 bg-muted rounded-full mt-0.5" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-muted rounded w-3/4" />
                        <div className="h-2.5 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                  {query.trim().length < 2 ? (
                    <>
                      <Search className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">No {searchType === "prs" ? "PRs" : searchType === "issues" ? "issues" : "results"} found matching "{query.trim()}"</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {results.map(issue => {
                    const isSelected = selectedIssue?.number === issue.number
                    const isPR = issue.html_url.includes("/pull/")
                    return (
                      <button
                        key={issue.number + issue.html_url}
                        onClick={() => handleSelectIssue(issue)}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-muted/40 ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {isSelected ? (
                            <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                            </div>
                          ) : isPR ? (
                            <GitPullRequest className="h-4 w-4 text-purple-500" />
                          ) : (
                            <CircleDot className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">#{issue.number}</span>
                            <span className="text-sm font-medium truncate">{issue.title}</span>
                            {isPR && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-purple-200 text-purple-600">PR</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant={issue.state === "open" ? "default" : "secondary"} className="text-[10px] px-1 py-0 h-4">
                              {issue.state}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> {issue.user.login}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {formatDate(issue.created_at)}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="flex-shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linking}>Cancel</Button>
              <Button onClick={handleLinkSelected} disabled={!selectedIssue || linking}>
                {linking ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                {isBulk ? `Link to ${taskIds?.length} Tasks` : "Link to Task"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual" className="flex-1 min-h-0 flex flex-col mt-3 space-y-4 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="space-y-2 flex-shrink-0">
              <Label htmlFor="gh-url" className={manualError ? "text-destructive" : ""}>GitHub URL</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="gh-url"
                  placeholder="https://github.com/owner/repo/issues/123"
                  value={manualUrl}
                  onChange={(e) => {
                    setManualUrl(e.target.value)
                    if (manualError) setManualError(null)
                  }}
                  className={`pl-9 ${manualError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  autoComplete="off"
                />
              </div>
              {manualError ? (
                <p className="text-xs font-medium text-destructive">{manualError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Paste the full URL of the issue or PR
                </p>
              )}
            </div>

            <DialogFooter className="flex-shrink-0 mt-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={linking}>Cancel</Button>
              <Button onClick={handleManualLink} disabled={linking || !manualUrl.trim()}>
                {linking ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                {isBulk ? `Link to ${taskIds?.length} Tasks` : "Link to Task"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
