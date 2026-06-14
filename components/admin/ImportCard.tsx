"use client"

/**
 * ImportCard — admin panel for the generic import pipeline.
 *
 * Workflow:
 *   1. Pick a provider (Trello/Asana/Jira/Notion/Todoist).
 *   2. Connect — supplies a token (or completes OAuth in a future
 *      version). Tokens are stored encrypted server-side.
 *   3. Start a new import — for live-API providers, supply the source
 *      workspace name + provider-specific options (e.g., Trello board id).
 *      For ZIP-shaped providers, upload a file via presigned PUT.
 *   4. Plan — confirm counts and status / priority mappings.
 *   5. Run — orchestrator drives the pipeline; live progress via MQTT.
 *   6. Cancel / Rollback / Errors as needed.
 *
 * Live progress: same MQTT broadcast topic the Slack import uses, so we
 * piggy-back on that. SWR poll fallback is kicked when MQTT is down.
 */

import React, { useEffect, useMemo, useState, Suspense, lazy } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { mutate as swrMutate } from "swr"
import {
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Plug,
  Plus,
  Database,
  RefreshCw,
} from "lucide-react"
import {
  createImportJob,
  cancelImportJob,
  rollbackImportJob,
  retryFailedImportChunks,
  type ImportJob,
  type ImportProvider,
  type ProviderInfo,
  type ConnectionView,
  type DiscoverItem,
  disconnectImport,
  discoverImportResources,
} from "@/services/importService"

// Lazy-load the provider-specific dialogs. They're heavy (form
// validation, mappings UI, error pagination) and only render when the
// admin actively performs an action — not on the initial admin page
// load. This trims the admin route's initial JS bundle by ~40 KB
// minified for the common case where the user just opens settings to
// scan job statuses without taking action.
const ImportConnectDialog = lazy(() =>
  import("@/components/admin/ImportConnectDialog").then((m) => ({ default: m.ImportConnectDialog })),
)
const ImportPlanDialog = lazy(() =>
  import("@/components/admin/ImportPlanDialog").then((m) => ({ default: m.ImportPlanDialog })),
)
const ImportErrorsDialog = lazy(() =>
  import("@/components/admin/ImportErrorsDialog").then((m) => ({ default: m.ImportErrorsDialog })),
)

const POLL_INTERVAL_MS = 6000
const POLL_CAP_MS = 10 * 60 * 1000

const STATUS_BADGE: Record<string, { className: string; icon: React.ReactNode }> = {
  pending: { className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: <Clock className="h-3.5 w-3.5" /> },
  validating: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
  planned: { className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  running: { className: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
  paused: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: <Clock className="h-3.5 w-3.5" /> },
  completed: { className: "bg-green-500/10 text-green-600 border-green-500/20", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { className: "bg-gray-500/10 text-gray-600 border-gray-500/20", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  rolled_back: { className: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: <RotateCcw className="h-3.5 w-3.5" /> },
}

function isLive(s: ImportJob["status"]) {
  return s === "running" || s === "validating" || s === "paused" || s === "pending"
}

const ImportCard: React.FC = () => {
  const { toast } = useToast()
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected

  const { data: providersResp } = useFetch<{ providers: ProviderInfo[] }>("/admin/import/providers")
  const providers = useMemo(() => providersResp?.providers ?? [], [providersResp])
  const [selectedProvider, setSelectedProvider] = useState<ImportProvider | null>(null)

  const { data: conResp, mutate: refetchConn } = useFetch<{ connections: ConnectionView[] }>(
    "/admin/import/connections",
  )
  const connections = useMemo(() => conResp?.connections ?? [], [conResp])

  const { data: jobsResp, mutate: refetchJobs } = useFetch<{ jobs: ImportJob[] }>(
    `/admin/import/jobs${selectedProvider ? `?provider=${selectedProvider}` : ""}`,
  )
  const jobs = useMemo(() => jobsResp?.jobs ?? [], [jobsResp])
  const runningJobs = useMemo(() => jobs.filter((j) => isLive(j.status)), [jobs])

  // Connect dialog
  const [connectOpen, setConnectOpen] = useState(false)

  // New-job inputs
  const [workspaceName, setWorkspaceName] = useState("")
  const [boardId, setBoardId] = useState("") // Trello-specific opt
  const [creating, setCreating] = useState(false)

  // Discovery — populated after connect, used to render a dropdown of
  // accessible workspaces/boards/projects so the operator doesn't have
  // to know IDs by heart.
  const [discoverItems, setDiscoverItems] = useState<DiscoverItem[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [pickedDiscoverId, setPickedDiscoverId] = useState("")

  // Plan / Errors dialogs
  const [planJob, setPlanJob] = useState<ImportJob | null>(null)
  const [errorsJobId, setErrorsJobId] = useState<string | null>(null)

  // Polling fallback when MQTT is down or there are running jobs.
  // useResilientPolling handles tab visibility, exponential backoff,
  // and the MQTT-healthy short-circuit. Without isMqttHealthy in the
  // gate, the previous implementation polled even when MQTT was up.
  useResilientPolling({
    enabled: runningJobs.length > 0,
    mqttHealthy: isMqttHealthy,
    interval: POLL_INTERVAL_MS,
    capMs: POLL_CAP_MS,
    onPoll: refetchJobs,
  })

  // Note: real-time MQTT progress for imports is delivered via the
  // canonical useMqtt subscription wired in `mqttProvider`. The
  // SlackImportCard / ImportCard read the same job-list SWR key, so
  // when MQTT publishes a progress event the provider's broadcast
  // handler triggers a `mutate` of GetSlackImportJobs / GetImportJobs
  // and our polling fallback short-circuits. We don't need a
  // per-card MQTT subscription here.

  const providerInfo = useMemo(
    () => providers.find((p) => p.name === selectedProvider) ?? null,
    [providers, selectedProvider],
  )
  const connection = useMemo(
    () => connections.find((c) => c.provider === selectedProvider),
    [connections, selectedProvider],
  )

  // After connect, fetch the discoverable resources for the selected
  // provider. We refetch when the connection identity changes.
  useEffect(() => {
    if (!selectedProvider || !connection) {
      setDiscoverItems([])
      setPickedDiscoverId("")
      return
    }
    let cancelled = false
    setDiscoverLoading(true)
    discoverImportResources(selectedProvider)
      .then((items) => {
        if (!cancelled) setDiscoverItems(items)
      })
      .catch(() => {
        if (!cancelled) setDiscoverItems([])
      })
      .finally(() => {
        if (!cancelled) setDiscoverLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProvider, connection?.updated_at])

  const startNewJob = async () => {
    if (!selectedProvider) return
    if (!workspaceName.trim()) {
      toast({ title: "Source workspace name required", variant: "destructive" })
      return
    }
    // Each provider has its own "what id are we importing" option.
    // The discover dropdown populates pickedDiscoverId, which we map
    // to the right option key per provider.
    const opts: Record<string, unknown> = {}
    switch (selectedProvider) {
      case "trello":
        if (!pickedDiscoverId && !boardId.trim()) {
          toast({ title: "Pick a Trello board", variant: "destructive" })
          return
        }
        opts.board_id = pickedDiscoverId || boardId.trim()
        break
      case "notion":
        if (pickedDiscoverId) opts.databases = [pickedDiscoverId]
        break
      case "asana":
      case "jira":
      case "todoist":
        // Asana resolves workspace by name; Jira uses metadata.site_url;
        // Todoist token grants global access. The discover pick is
        // currently informational for these — the workspace_name field
        // is what scopes the import.
        if (pickedDiscoverId) opts.discover_id = pickedDiscoverId
        break
      case "linear":
        // Linear discovery returns teams; the picked id narrows the
        // import to a single team. Empty pick = import every team
        // visible to the token.
        if (pickedDiscoverId) opts.team_id = pickedDiscoverId
        break
      case "clickup":
        // ClickUp tokens often see multiple workspaces. The picked
        // discover id MUST be supplied for tokens that span more than
        // one workspace; for single-workspace tokens it's optional.
        if (pickedDiscoverId) opts.workspace_id = pickedDiscoverId
        break
    }
    setCreating(true)
    try {
      const { job_id } = await createImportJob(selectedProvider, {
        source_workspace_name: workspaceName.trim(),
        source: "api",
        options: opts,
      })
      toast({ title: "Job created", description: "Open it to plan and run." })
      setWorkspaceName("")
      setBoardId("")
      setPickedDiscoverId("")
      const refetched = await refetchJobs()
      const job = (refetched?.jobs ?? jobs).find((j: ImportJob) => j.id === job_id)
      if (job) setPlanJob(job)
    } catch (err: any) {
      toast({
        title: "Failed to create job",
        description: err?.response?.data?.error || err?.message,
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const onCancel = async (jobId: string) => {
    try {
      await cancelImportJob(jobId)
      toast({ title: "Cancellation requested" })
      refetchJobs()
    } catch (err: any) {
      toast({ title: "Cancel failed", description: err?.response?.data?.error, variant: "destructive" })
    }
  }
  const onRollback = async (jobId: string) => {
    if (!confirm("Roll back will soft-delete every entity this import created. Continue?")) return
    try {
      await rollbackImportJob(jobId)
      toast({ title: "Rolled back" })
      refetchJobs()
    } catch (err: any) {
      toast({ title: "Rollback failed", description: err?.response?.data?.error, variant: "destructive" })
    }
  }
  const onRetryFailed = async (jobId: string) => {
    try {
      const { reset, rerun } = await retryFailedImportChunks(jobId)
      if (reset === 0) {
        toast({ title: "No failed chunks to retry" })
      } else {
        toast({
          title: rerun ? "Resuming import" : "Reset complete",
          description: `${reset} failed chunk${reset === 1 ? "" : "s"} reset to pending.`,
        })
      }
      refetchJobs()
    } catch (err: any) {
      toast({ title: "Retry failed", description: err?.response?.data?.error, variant: "destructive" })
    }
  }
  const onDisconnect = async () => {
    if (!selectedProvider) return
    if (!confirm(`Disconnect ${selectedProvider}?`)) return
    try {
      await disconnectImport(selectedProvider)
      toast({ title: "Disconnected" })
      refetchConn()
    } catch (err: any) {
      toast({ title: "Disconnect failed", description: err?.response?.data?.error, variant: "destructive" })
    }
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold tracking-tight">
              <Database className="h-5 w-5 text-primary" />
              Import from Asana, Jira, Trello, Notion, Todoist
            </CardTitle>
            <CardDescription>
              Generic import pipeline. Tasks, projects and members are created under your
              chosen team. Re-imports of the same workspace are dedupped automatically.
              {!isMqttHealthy && (
                <span className="ml-1 text-amber-600">(Real-time off; polling.)</span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 flex-1 overflow-y-auto custom-scrollbar">
        {/* Provider picker */}
        <div className="flex flex-wrap gap-2">
          {providers
            .filter((p) => p.name !== ("slack" as any))
            .map((p) => (
              <Button
                key={p.name}
                variant={selectedProvider === p.name ? "default" : "outline"}
                onClick={() => setSelectedProvider(p.name)}
                size="sm"
              >
                {capitalise(p.name)}
              </Button>
            ))}
        </div>

        {!selectedProvider && (
          <div className="rounded border bg-muted/30 px-3 py-8 text-center text-sm text-muted-foreground">
            Pick a provider to get started.
          </div>
        )}

        {selectedProvider && (
          <>
            <Separator />

            {/* Connection */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Connection</div>
              {connection ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border bg-card px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="truncate">Connected{connection.source_account_name ? ` as ${connection.source_account_name}` : ""}</span>
                    {connection.expires_at && (
                      <span className="text-xs text-muted-foreground">
                        expires {new Date(connection.expires_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={onDisconnect} className="shrink-0 self-start sm:self-auto">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)}>
                  <Plug className="mr-2 h-4 w-4" /> Connect {capitalise(selectedProvider)}
                </Button>
              )}
            </div>

            {/* New job form */}
            {connection && (
              <div className="space-y-3">
                <Separator />
                <div className="text-sm font-medium">Start a new import</div>

                {/* Discover dropdown — populated after connect. The
                    label depends on the active provider so a token
                    that returns mixed-kind discovery items (e.g.
                    OAuth across multiple Asana orgs) doesn't show
                    a stale label. */}
                {discoverItems.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="discover">
                      {selectedProvider === "trello" && "Pick a Trello board"}
                      {selectedProvider === "asana" && "Pick an Asana workspace"}
                      {selectedProvider === "jira" && "Pick a Jira project"}
                      {selectedProvider === "notion" && "Pick a Notion database"}
                      {selectedProvider === "todoist" && "Pick a Todoist project"}
                    </Label>
                    <select
                      id="discover"
                      value={pickedDiscoverId}
                      onChange={(e) => {
                        setPickedDiscoverId(e.target.value)
                        const picked = discoverItems.find((d) => d.id === e.target.value)
                        if (picked && !workspaceName) setWorkspaceName(picked.name)
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">— pick one —</option>
                      {discoverItems.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {d.meta?.task_shaped === false ? "  (not task-shaped)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {discoverLoading && (
                  <div className="text-xs text-muted-foreground">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    Loading workspaces…
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ws">Source workspace label</Label>
                    <Input
                      id="ws"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="e.g., Acme Inc."
                    />
                  </div>
                  {selectedProvider === "trello" && discoverItems.length === 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="board">Trello board id</Label>
                      <Input
                        id="board"
                        value={boardId}
                        onChange={(e) => setBoardId(e.target.value)}
                        placeholder="24-char hex id (or pick from list above)"
                      />
                    </div>
                  )}
                </div>
                <Button onClick={startNewJob} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" /> Create job
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Jobs list */}
            <Separator />
            <div className="space-y-2">
              <div className="text-sm font-medium">Recent jobs</div>
              {jobs.length === 0 ? (
                <div className="rounded border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  No jobs yet for {capitalise(selectedProvider)}.
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map((j) => {
                    const badge = STATUS_BADGE[j.status]
                    const totalChunks = j.chunks_total || 1
                    const pct = Math.min(100, Math.round((j.chunks_done / totalChunks) * 100))
                    return (
                      <div key={j.id} className="rounded border bg-card p-3">
                        <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-medium truncate">{j.source_workspace_name}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              <Badge variant="outline" className={badge?.className}>
                                <span className="flex items-center gap-1">
                                  {badge?.icon}
                                  {j.status}
                                </span>
                              </Badge>
                              {j.stage && <span>· {j.stage}</span>}
                              <span>· {new Date(j.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap shrink-0">
                            {j.status === "planned" && (
                              <Button size="sm" variant="default" onClick={() => setPlanJob(j)}>
                                <PlayCircle className="mr-1 h-4 w-4" /> Plan
                              </Button>
                            )}
                            {j.status === "validating" && (
                              <Button size="sm" variant="default" onClick={() => setPlanJob(j)}>
                                <PlayCircle className="mr-1 h-4 w-4" /> Plan
                              </Button>
                            )}
                            {j.status === "failed" && (
                              <Button size="sm" variant="default" onClick={() => setPlanJob(j)}>
                                <PlayCircle className="mr-1 h-4 w-4" /> Retry plan
                              </Button>
                            )}
                            {(j.status === "running" || j.status === "paused") && (
                              <Button size="sm" variant="outline" onClick={() => onCancel(j.id)}>
                                Cancel
                              </Button>
                            )}
                            {(j.status === "completed" || j.status === "failed" || j.status === "cancelled") && (
                              <Button size="sm" variant="outline" onClick={() => onRollback(j.id)}>
                                <RotateCcw className="mr-1 h-4 w-4" /> Rollback
                              </Button>
                            )}
                            {(j.status === "failed" || j.status === "cancelled") && j.chunks_failed > 0 && (
                              <Button size="sm" variant="outline" onClick={() => onRetryFailed(j.id)}>
                                <RefreshCw className="mr-1 h-4 w-4" /> Retry failed
                              </Button>
                            )}
                            {j.errors_total > 0 && (
                              <Button size="sm" variant="ghost" onClick={() => setErrorsJobId(j.id)}>
                                <AlertTriangle className="mr-1 h-4 w-4 text-amber-500" />
                                {j.errors_total} errors
                              </Button>
                            )}
                          </div>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {j.chunks_done}/{j.chunks_total} chunks
                          </span>
                          <span>{j.items_imported.toLocaleString()} items</span>
                          {j.error_message && (
                            <span className="text-red-600">{j.error_message}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Dialogs are lazy-loaded; the Suspense boundary renders
             nothing while the chunk fetches because the dialogs
             themselves only mount on user action and the user is not
             yet looking at the dialog area. A spinner here would
             flash on every action. */}
        <Suspense fallback={null}>
          {selectedProvider && (
            <ImportConnectDialog
              provider={selectedProvider}
              open={connectOpen}
              onOpenChange={setConnectOpen}
              onConnected={() => refetchConn()}
            />
          )}
          {planJob && (
            <ImportPlanDialog
              job={planJob}
              providerInfo={providerInfo}
              open={!!planJob}
              onOpenChange={(o) => {
                if (!o) setPlanJob(null)
              }}
              onStarted={() => refetchJobs()}
            />
          )}
          {errorsJobId && (
            <ImportErrorsDialog
              jobId={errorsJobId}
              open={!!errorsJobId}
              onOpenChange={(o) => {
                if (!o) setErrorsJobId(null)
              }}
            />
          )}
        </Suspense>
      </CardContent>
    </Card>
  )
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default ImportCard
