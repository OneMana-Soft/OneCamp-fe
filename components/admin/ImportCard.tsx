"use client"

/**
 * ImportCard — admin panel for the generic import pipeline.
 *
 * Workflow:
 *   1. Pick a provider (Trello/Asana/Jira/Notion/Todoist…).
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
 *
 * Every read says when it failed rather than reading as an answer: the history
 * said "No imports yet." while it loaded and when it had failed, and a failed
 * read of the connections offered "Connect Jira" for a connection that may
 * already exist. What a form is missing is said under the field it is about.
 */

import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { CheckCircle2, Loader2, Plug, Plus } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDateTime } from "@/lib/utils/date/shortDate"
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
import { ImportJobRow, count } from "@/components/admin/ImportJobRow"
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

const NAME_MISSING = "Name this import, so you can tell it apart in the history."

const ImportCard: React.FC = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected

  const {
    data: providersResp,
    isLoading: providersLoading,
    isError: providersError,
    mutate: refetchProviders,
  } = useFetch<{ providers: ProviderInfo[] }>("/admin/import/providers")
  const providers = useMemo(() => providersResp?.providers ?? [], [providersResp])
  const [selectedProvider, setSelectedProvider] = useState<ImportProvider | null>(null)

  const { data: conResp, isError: connError, mutate: refetchConn } = useFetch<{ connections: ConnectionView[] }>(
    "/admin/import/connections",
  )
  const connections = useMemo(() => conResp?.connections ?? [], [conResp])

  // Every provider's jobs until one is picked (Slack's have their own card),
  // so an admin coming back sees how their imports are doing first.
  const {
    data: jobsResp,
    isLoading: jobsLoading,
    isError: jobsError,
    mutate: refetchJobs,
  } = useFetch<{ jobs: ImportJob[] }>(`/admin/import/jobs${selectedProvider ? `?provider=${selectedProvider}` : ""}`)
  const jobs = useMemo(() => (jobsResp?.jobs ?? []).filter((j) => j.provider !== "slack"), [jobsResp])
  const runningJobs = useMemo(() => jobs.filter((j) => isLive(j.status)), [jobs])

  // Connect dialog
  const [connectOpen, setConnectOpen] = useState(false)

  // New-import inputs, and what is missing from them, said under each field.
  const [workspaceName, setWorkspaceName] = useState("")
  const [boardId, setBoardId] = useState("") // Trello-specific opt
  const [creating, setCreating] = useState(false)
  const [nameError, setNameError] = useState("")
  const [pickError, setPickError] = useState("")
  const [createProblem, setCreateProblem] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLSelectElement>(null)
  const boardRef = useRef<HTMLInputElement>(null)

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

  const chooseProvider = (p: ImportProvider | null) => {
    setSelectedProvider(p)
    setNameError("")
    setPickError("")
    setCreateProblem("")
  }

  const startNewJob = async () => {
    if (!selectedProvider) return
    setCreateProblem("")
    if (!workspaceName.trim()) {
      setNameError(NAME_MISSING)
      nameRef.current?.focus()
      return
    }
    // Each provider reads its own key for what was picked (lib/importPick).
    const pick = optionsForPick(selectedProvider, pickedDiscoverId, discoverItems, boardId)
    if ("error" in pick) {
      setPickError(pick.error)
      ;(discoverItems.length > 0 ? pickRef.current : boardRef.current)?.focus()
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
      setWorkspaceName("")
      setBoardId("")
      setPickedDiscoverId("")
      const refetched = await refetchJobs()
      const job = (refetched?.jobs ?? jobs).find((j: ImportJob) => j.id === job_id)
      // The plan opening is the confirmation; without it, say where it went.
      if (job) setPlanJob(job)
      else toast({ title: "Import created", description: "Plan it from the list below to see what comes across." })
    } catch (err: unknown) {
      setCreateProblem(importProblemOf(err, "Couldn't start the import. Try again in a moment.").message)
    } finally {
      setCreating(false)
    }
  }

  // Cancelling stopped a running import on one click.
  const onCancel = (job: ImportJob) => {
    confirm({
      title: `Cancel the import of ${job.source_workspace_name}?`,
      description: "What has come across so far stays. Parts still being written finish first, then it stops. You can run it again later.",
      confirmText: "Cancel import",
      cancelText: "Keep importing",
      destructive: true,
      onConfirm: async () => {
        try {
          await cancelImportJob(job.id)
          toast({ title: "Cancelling the import", description: "It stops once the parts in progress finish." })
          refetchJobs()
        } catch (err: unknown) {
          toast({ title: "Couldn't cancel the import", description: importProblemOf(err).message, variant: "destructive" })
        }
      },
    })
  }
  const onDiscard = (job: ImportJob) => {
    confirm({
      title: "Discard this import?",
      description: `${job.source_workspace_name} hasn't brought anything in yet. Discarding it lets you start a new import of it.`,
      confirmText: "Discard import",
      destructive: true,
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
      title: "Roll back this import?",
      description:
        "This takes away what the import brought in: its tasks, comments, files and custom fields, and its projects and teams if nothing else is in them. Anything your team has added stays.",
      confirmText: "Roll back import",
      destructive: true,
      onConfirm: async () => {
        try {
          await rollbackImportJob(jobId)
          toast({ title: "Rolled back" })
          refetchJobs()
        } catch (err) {
          // The request shows no toast of its own: this is the one.
          toast({ title: "Couldn't roll back the import", description: importProblemOf(err).message, variant: "destructive" })
        }
      },
    })
  }
  const onRetryFailed = async (jobId: string) => {
    try {
      const { reset, rerun } = await retryFailedImportChunks(jobId)
      if (reset === 0) {
        toast({ title: "Nothing failed, so there is nothing to retry" })
      } else {
        toast({
          title: rerun ? "Trying the failed parts again" : "The failed parts will run again",
          description: `${count(reset, "part", "parts")} will run again.`,
        })
      }
      refetchJobs()
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({ title: "Couldn't retry the failed parts", description: importProblemOf(err).message, variant: "destructive" })
    }
  }
  const onDisconnect = async () => {
    if (!selectedProvider) return
    const name = importProviderLabel(selectedProvider)
    confirm({
      title: `Disconnect your ${name} account?`,
      description: `OneCamp stops reading from ${name}. Imports already made stay. You can connect it again later.`,
      confirmText: "Disconnect account",
      destructive: true,
      onConfirm: async () => {
        try {
          await disconnectImport(selectedProvider)
          toast({ title: `${name} disconnected` })
          refetchConn()
        } catch (err: unknown) {
          toast({ title: `Couldn't disconnect ${name}`, description: importProblemOf(err).message, variant: "destructive" })
        }
      },
    })
  }

  const choices: { name: ImportProvider | null; label: string }[] = [
    { name: null, label: "All" },
    ...providers.filter((p) => (p.name as string) !== "slack").map((p) => ({ name: p.name, label: importProviderLabel(p.name) })),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Import from other tools</CardTitle>
        <CardDescription>
          Asana, ClickUp, Jira, Linear, monday.com, Notion, Todoist and Trello. Projects, tasks, subtasks, comments,
          files, people and custom fields come across, into the source&apos;s own teams or a team named after it.
          Importing the same workspace again brings only what is new, without copies.
          {!isMqttHealthy && <span className="ml-1 text-warning-ink">Live updates are off, so the list refreshes every few seconds.</span>}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Provider picker: a choice of one, "All" included, where the chosen
            provider was a filled orange button and there was no way back to
            every provider's imports once one was picked. */}
        {providersLoading && !providersResp ? (
          <div role="status" aria-label="Loading the providers" className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
        ) : providersError && !providersResp ? (
          <ErrorState subject="the import providers" onRetry={() => void refetchProviders()} />
        ) : (
          <div role="radiogroup" aria-label="Provider" className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1">
            {choices.map((c) => {
              const on = selectedProvider === c.name
              return (
                <button
                  key={c.name ?? "all"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => chooseProvider(c.name)}
                  className={cn(
                    "h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                    on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {!selectedProvider && !providersError && (
          <p className="text-sm text-muted-foreground">Pick a tool to connect it or start an import from it.</p>
        )}

        {selectedProvider && (
          <section aria-labelledby="import-connection" className="space-y-2">
            <h3 id="import-connection" className="text-sm font-medium">
              Connection
            </h3>
            {connError && !conResp ? (
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">
                  Couldn&apos;t check the connection to {importProviderLabel(selectedProvider)}.
                </span>
                <Button size="sm" variant="outline" className="h-8 shrink-0 self-start sm:self-auto" onClick={() => void refetchConn()}>
                  Try again
                </Button>
              </div>
            ) : connection ? (
              <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success-ink" />
                  <span className="truncate">Connected{connection.source_account_name ? ` as ${connection.source_account_name}` : ""}</span>
                  {connection.expires_at && (
                    <span className="text-xs text-muted-foreground">Until {shortDateTime(new Date(connection.expires_at))}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={onDisconnect} className="h-8 shrink-0 self-start sm:self-auto">
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setConnectOpen(true)}>
                <Plug className="mr-2 h-4 w-4" /> Connect {importProviderLabel(selectedProvider)}
              </Button>
            )}
          </section>
        )}

        {/* New import form */}
        {selectedProvider && connection && (
          <section aria-labelledby="import-new" className="space-y-3">
            <h3 id="import-new" className="text-sm font-medium">
              Start a new import
            </h3>

            {/* Discover dropdown — populated after connect. The
                label depends on the active provider so a token
                that returns mixed-kind discovery items (e.g.
                OAuth across multiple Asana orgs) doesn't show
                a stale label. */}
            {discoverItems.length > 0 && (
              <Field label={pickLabel(selectedProvider)} error={pickError}>
                <select
                  ref={pickRef}
                  value={pickedDiscoverId}
                  onChange={(e) => {
                    setPickedDiscoverId(e.target.value)
                    setPickError("")
                    const picked = discoverItems.find((d) => d.id === e.target.value)
                    if (picked && !workspaceName) setWorkspaceName(picked.name)
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Choose one</option>
                  {allOfThemLabel(selectedProvider, discoverItems.length) && (
                    <option value={ALL_OF_THEM}>{allOfThemLabel(selectedProvider, discoverItems.length)}</option>
                  )}
                  {discoverItems.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.meta?.task_shaped === false ? "  (not a task list)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {discoverLoading && (
              <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Loading the list…
              </p>
            )}
            {discoverProblem && !discoverLoading && (
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 break-words text-danger-ink">{discoverProblem.message}</p>
                <div className="flex shrink-0 gap-2">
                  {needsReconnect(discoverProblem) && (
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setConnectOpen(true)}>
                      <Plug className="mr-1.5 h-4 w-4" /> Reconnect
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setDiscoverAttempt((n) => n + 1)}>
                    Try again
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Workspace name" help="Shown in the import history. Importing the same workspace again brings only what is new." error={nameError}>
                <Input
                  ref={nameRef}
                  value={workspaceName}
                  onChange={(e) => {
                    setWorkspaceName(e.target.value)
                    if (nameError) setNameError("")
                  }}
                  placeholder="Acme Inc.…"
                  autoComplete="off"
                />
              </Field>
              {selectedProvider === "trello" && discoverItems.length === 0 && (
                <Field label="Trello board ID" help="The part after trello.com/b/ in the board's address." error={pickError}>
                  <Input
                    ref={boardRef}
                    value={boardId}
                    onChange={(e) => {
                      setBoardId(e.target.value)
                      if (pickError) setPickError("")
                    }}
                    placeholder="Paste the board ID…"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              )}
            </div>
            <div className="space-y-2">
              {/* Outline, as every section's own action is on admin pages: the
                  tab keeps one filled button, the Slack card's New import. */}
              <Button variant="outline" className="h-8" onClick={startNewJob} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" /> Start import
                  </>
                )}
              </Button>
              {createProblem && (
                <p role="alert" className="text-sm text-danger-ink">
                  {createProblem}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Jobs list: every provider's until one is picked. */}
        <section aria-labelledby="import-history" className="space-y-2">
          <h3 id="import-history" className="text-sm font-medium">
            Recent imports
          </h3>
          {jobsLoading && !jobsResp ? (
            <div role="status" aria-label="Loading the import history" className="rounded-lg border border-border px-3 py-1">
              <SkeletonRows rows={3} avatar={false} />
            </div>
          ) : jobsError && !jobsResp ? (
            <ErrorState subject="the import history" onRetry={() => void refetchJobs()} />
          ) : jobs.length === 0 ? (
            <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {selectedProvider ? `No imports from ${importProviderLabel(selectedProvider)} yet.` : "No imports yet."}
            </p>
          ) : (
            <ul aria-label="Recent imports" className="divide-y divide-border rounded-lg border border-border">
              {jobs.map((j) => (
                <li key={j.id} className="px-3 py-3">
                  <ImportJobRow
                    job={j}
                    showProvider={!selectedProvider}
                    onPlan={() => setPlanJob(j)}
                    onDiscard={() => onDiscard(j)}
                    onCancel={() => onCancel(j)}
                    onRollback={() => onRollback(j.id)}
                    onRetryFailed={() => onRetryFailed(j.id)}
                    onInvite={() => setInviteJob(j)}
                    onShowErrors={() => setErrorsJobId(j.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

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
                if (planJob.provider !== "slack") chooseProvider(planJob.provider)
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
