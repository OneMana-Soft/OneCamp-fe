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
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { CheckCircle2, Loader2, Plug, Plus, Database } from "lucide-react"
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
  importProviderLabel,
  importProblemOf,
  needsReconnect,
  type ImportProblem,
} from "@/services/importService"
import { ImportJobRow } from "@/components/admin/ImportJobRow"
import { ALL_OF_THEM, allOfThemLabel, optionsForPick, pickLabel } from "@/lib/importPick"

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
const ImportInviteDialog = lazy(() =>
  import("@/components/admin/ImportInviteDialog").then((m) => ({ default: m.ImportInviteDialog })),
)

const POLL_INTERVAL_MS = 6000
const POLL_CAP_MS = 10 * 60 * 1000


function isLive(s: ImportJob["status"]) {
  return s === "running" || s === "validating" || s === "paused" || s === "pending"
}

const ImportCard: React.FC = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected

  const { data: providersResp } = useFetch<{ providers: ProviderInfo[] }>("/admin/import/providers")
  const providers = useMemo(() => providersResp?.providers ?? [], [providersResp])
  const [selectedProvider, setSelectedProvider] = useState<ImportProvider | null>(null)

  const { data: conResp, mutate: refetchConn } = useFetch<{ connections: ConnectionView[] }>(
    "/admin/import/connections",
  )
  const connections = useMemo(() => conResp?.connections ?? [], [conResp])

  // Every provider's jobs until one is picked (Slack's have their own card),
  // so an admin coming back sees how their imports are doing first.
  const { data: jobsResp, mutate: refetchJobs } = useFetch<{ jobs: ImportJob[] }>(
    `/admin/import/jobs${selectedProvider ? `?provider=${selectedProvider}` : ""}`,
  )
  const jobs = useMemo(() => (jobsResp?.jobs ?? []).filter((j) => j.provider !== "slack"), [jobsResp])
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
  // Why the list couldn't load. It used to be swallowed, so a refused token
  // looked like an account with nothing in it.
  const [discoverProblem, setDiscoverProblem] = useState<ImportProblem | null>(null)
  const [discoverAttempt, setDiscoverAttempt] = useState(0)

  // Plan / Errors dialogs
  const [planJob, setPlanJob] = useState<ImportJob | null>(null)
  const [errorsJobId, setErrorsJobId] = useState<string | null>(null)
  const [inviteJob, setInviteJob] = useState<ImportJob | null>(null)

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
    setDiscoverProblem(null)
    discoverImportResources(selectedProvider)
      .then((items) => {
        if (cancelled) return
        setDiscoverItems(items)
        // A token that sees one Asana workspace has nothing to choose.
        if (selectedProvider === "asana" && items.length === 1) setPickedDiscoverId(items[0].id)
      })
      .catch((err) => {
        if (cancelled) return
        setDiscoverItems([])
        setDiscoverProblem(importProblemOf(err, "Couldn't load the list. Try again."))
      })
      .finally(() => {
        if (!cancelled) setDiscoverLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedProvider, connection?.updated_at, discoverAttempt])

  const startNewJob = async () => {
    if (!selectedProvider) return
    if (!workspaceName.trim()) {
      toast({ title: "Source workspace name required", variant: "destructive" })
      return
    }
    // Each provider reads its own key for what was picked (lib/importPick).
    const pick = optionsForPick(selectedProvider, pickedDiscoverId, discoverItems, boardId)
    if ("error" in pick) {
      toast({ title: pick.error, variant: "destructive" })
      return
    }
    const opts = pick.options
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
  const onDiscard = (job: ImportJob) => {
    confirm({
      title: "Discard this import?",
      description: `${job.source_workspace_name} hasn't brought anything in yet. Discarding it lets you start a new import of it.`,
      confirmText: "Discard",
      onConfirm: async () => {
        try {
          await cancelImportJob(job.id)
          toast({ title: "Discarded" })
          refetchJobs()
        } catch (err: unknown) {
          toast({ title: "Couldn't discard it", description: importProblemOf(err).message, variant: "destructive" })
        }
      },
    })
  }
  const onRollback = async (jobId: string) => {
    confirm({
      title: "Roll back import",
      description:
        "This takes away what the import brought in: its tasks, comments, files and custom fields, and its projects and teams if nothing else is in them. Anything your team has added stays.",
      confirmText: "Roll back",
      onConfirm: async () => {
        try {
          await rollbackImportJob(jobId)
          toast({ title: "Rolled back" })
          refetchJobs()
        } catch (err: any) {
          toast({ title: "Rollback failed", description: err?.response?.data?.error, variant: "destructive" })
        }
      },
    })
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
    confirm({
      title: "Disconnect provider",
      description: `Disconnect ${selectedProvider}?`,
      confirmText: "Disconnect",
      onConfirm: async () => {
        try {
          await disconnectImport(selectedProvider)
          toast({ title: "Disconnected" })
          refetchConn()
        } catch (err: any) {
          toast({ title: "Disconnect failed", description: err?.response?.data?.error, variant: "destructive" })
        }
      },
    })
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold tracking-tight">
              <Database className="h-5 w-5 text-primary" />
              Import from Asana, monday.com, ClickUp, Jira, Linear, Trello, Notion, Todoist
            </CardTitle>
            <CardDescription>
              Projects, tasks, subtasks, comments, files, people and custom fields come across, into the
              source&apos;s own teams or a team named after it. Importing the same workspace again brings only what
              is new, without copies.
              {!isMqttHealthy && (
                <span className="ml-1 text-warning">(Real-time off; polling.)</span>
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
                {importProviderLabel(p.name)}
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
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
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
                  <Plug className="mr-2 h-4 w-4" /> Connect {importProviderLabel(selectedProvider)}
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
                    <Label htmlFor="discover">{pickLabel(selectedProvider)}</Label>
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
                      <option value="">Pick one</option>
                      {allOfThemLabel(selectedProvider, discoverItems.length) && (
                        <option value={ALL_OF_THEM}>{allOfThemLabel(selectedProvider, discoverItems.length)}</option>
                      )}
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
                {discoverProblem && !discoverLoading && (
                  <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 break-words text-destructive">{discoverProblem.message}</p>
                    <div className="flex shrink-0 gap-2">
                      {needsReconnect(discoverProblem) && (
                        <Button size="sm" onClick={() => setConnectOpen(true)}>
                          <Plug className="mr-1.5 h-4 w-4" /> Reconnect
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDiscoverAttempt((n) => n + 1)}>
                        Try again
                      </Button>
                    </div>
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

          </>
        )}

        {/* Jobs list: every provider's until one is picked. */}
        <Separator />
        <div className="space-y-2">
          <div className="text-sm font-medium">Recent imports</div>
          {jobs.length === 0 ? (
            <div className="rounded border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {selectedProvider ? `No imports from ${importProviderLabel(selectedProvider)} yet.` : "No imports yet."}
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <ImportJobRow
                  key={j.id}
                  job={j}
                  showProvider={!selectedProvider}
                  onPlan={() => setPlanJob(j)}
                  onDiscard={() => onDiscard(j)}
                  onCancel={() => onCancel(j.id)}
                  onRollback={() => onRollback(j.id)}
                  onRetryFailed={() => onRetryFailed(j.id)}
                  onInvite={() => setInviteJob(j)}
                  onShowErrors={() => setErrorsJobId(j.id)}
                />
              ))}
            </div>
          )}
        </div>

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
              // The job's own provider: it may be planned from the list of
              // every provider's jobs, with none picked.
              providerInfo={providers.find((p) => p.name === planJob.provider) ?? null}
              open={!!planJob}
              onOpenChange={(o) => {
                if (!o) setPlanJob(null)
              }}
              onStarted={() => refetchJobs()}
              onChanged={() => refetchJobs()}
              onReconnect={() => {
                if (planJob.provider !== "slack") setSelectedProvider(planJob.provider)
                setPlanJob(null)
                setConnectOpen(true)
              }}
            />
          )}
          {inviteJob && (
            <ImportInviteDialog
              jobId={inviteJob.id}
              label={inviteJob.source_workspace_name}
              open={!!inviteJob}
              onOpenChange={(o) => {
                if (!o) setInviteJob(null)
              }}
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

export default ImportCard
