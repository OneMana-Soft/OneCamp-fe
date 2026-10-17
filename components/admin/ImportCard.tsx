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
 *
 * THE HISTORY FIRST, AND IT STAYS PUT. It listed one tool's imports once a
 * tool was picked, under the tool's Connection and New import, which were
 * inserted above it: picking Jira pushed the history down by the height of a
 * form, and "All" pulled it back up. The history is every tool's now (each row
 * names its tool), above "Start an import", so picking a tool changes only the
 * panel under the picker. One flat section like every other admin tab, where
 * it was a bordered Card.
 *
 * PAGES (docs programme C4). A tool that brings pages (its "pages" capability:
 * Notion) offers them as docs, on by default: every page the token can read
 * comes across in its tree, and a database inside a page as a table. A
 * database picked from the list comes across as a project too.
 */

import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsSection } from "@/components/ui/settingsSection"
import { segmentedWell } from "@/components/ui/segmentedControl"
import { StatusWord } from "@/components/ui/statusWord"
import { SpotImported } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { Loader2, Plug, Plus } from "lucide-react"
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
import { IMPORT_LIST, ImportJobRow, ImportRowsSkeleton, ROW_ACTION, count } from "@/components/admin/ImportJobRow"
import { SourceMark } from "@/components/admin/connectParts"
import { SLACK_IMPORT_NEW_EVENT } from "@/components/admin/importParts"
import { ALL_OF_THEM, allOfThemLabel, optionsForPick, pickLabel } from "@/lib/importPick"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

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

/** What a source card says comes across, where it isn't projects and tasks. */
const SOURCE_LINE: Partial<Record<ImportProvider, string>> = { notion: "Pages, databases, tasks" }

/**
 * What rolling an import back takes away. An import that brought pages also
 * takes its tables, and its docs go to the trash with any pages added under
 * them, where they can be restored.
 */
export function rollbackWords(job: Pick<ImportJob, "options">): string {
  const pages = job.options?.pages === true
  return pages
    ? "This takes away what the import brought in: its tasks, comments, files, custom fields and tables, and its projects and teams if nothing else is in them. Its docs go to the trash, with any pages added under them, where they can be restored. Anything else your team has added stays."
    : "This takes away what the import brought in: its tasks, comments, files and custom fields, and its projects and teams if nothing else is in them. Anything your team has added stays."
}

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

  // Every tool's jobs, whichever tool is picked below (Slack's have their own
  // section), so an admin coming back sees how their imports are doing first
  // and picking a tool never moves or empties the list.
  // Read as jobsFetch.isError (not an alias), the shape app/errorState.test.ts
  // recognises when it checks that a failed read never shows as empty.
  const jobsFetch = useFetch<{ jobs: ImportJob[] }>("/admin/import/jobs")
  const { data: jobsResp, isLoading: jobsLoading, mutate: refetchJobs } = jobsFetch
  const jobs = useMemo(() => (jobsResp?.jobs ?? []).filter((j) => j.provider !== "slack"), [jobsResp])
  const runningJobs = useMemo(() => jobs.filter((j) => isLive(j.status)), [jobs])

  // Connect dialog
  const [connectOpen, setConnectOpen] = useState(false)

  // New-import inputs, and what is missing from them, said under each field.
  const [workspaceName, setWorkspaceName] = useState("")
  const [boardId, setBoardId] = useState("") // Trello-specific opt
  const [bringPages, setBringPages] = useState(true)
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
  // handler makes those keys stale (lib/importLive) and our polling
  // fallback short-circuits. We don't need a
  // per-card MQTT subscription here.

  const connection = useMemo(
    () => connections.find((c) => c.provider === selectedProvider),
    [connections, selectedProvider],
  )
  const offersPages = !!providers.find((p) => p.name === selectedProvider)?.capabilities?.includes("pages")
  const pages = offersPages && bringPages

  // After connect, fetch the discoverable resources for the selected
  // provider. A connection's identity is its updated_at: connecting again
  // changes it, and a refetch of the same connection does not.
  const connectedAt = connection?.updated_at
  useEffect(() => {
    if (!selectedProvider || connectedAt === undefined) {
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
  }, [selectedProvider, connectedAt, discoverAttempt])

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
    const pick = optionsForPick(selectedProvider, pickedDiscoverId, discoverItems, boardId, pages)
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
  const onRollback = async (job: ImportJob) => {
    const jobId = job.id
    confirm({
      title: "Roll back this import?",
      // Type-to-confirm (admin H4): it takes away work from many people.
      requireText: job.source_workspace_name || "Roll back",
      description: rollbackWords(job),
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

  // The tools to import from, as a choice of one. Slack has its own section.
  const choices = providers
    .filter((p) => (p.name as string) !== "slack")
    .map((p) => ({ value: p.name as ImportProvider | "", label: importProviderLabel(p.name) }))
  const providerName = selectedProvider ? importProviderLabel(selectedProvider) : ""

  return (
    <SettingsSection
      title="Import from other tools"
      description={
        <>
          Asana, ClickUp, Jira, Linear, monday.com, Notion, Todoist and Trello. Projects, tasks, subtasks, comments,
          files, people and custom fields come across, into the source&apos;s own teams or a team named after it.
          Notion&apos;s pages come across as docs, in their tree, and its databases as tables. Importing the same
          workspace again brings only what is new, without copies.
          {!isMqttHealthy && <span className="ml-1 text-warning-ink">Live updates are off, so the list refreshes every few seconds.</span>}
        </>
      }
    >
      <div className="space-y-8">
        <SettingsSection level={3} title="Recent imports">
          {jobsLoading && !jobsResp ? (
            <ImportRowsSkeleton label="Loading the import history" />
          ) : jobsFetch.isError && !jobsResp ? (
            <ErrorState
              compact
              subject="the import history"
              detail={apiErrorStatus(jobsFetch.isError) ? apiErrorMessage(jobsFetch.isError) : undefined}
              onRetry={() => void refetchJobs()}
            />
          ) : jobs.length === 0 ? (
            // A first run: the imported spot, at the empty state's quiet size.
            <EmptyState
              illustration={<SpotImported hue={ADMIN_GROUP_HUE.workspace} />}
              title="No imports from other tools yet"
              description="Pick a tool under Start an import, connect it, and bring a workspace across. Each import is listed here with how far it got."
            />
          ) : (
            <ul aria-label="Recent imports" className={IMPORT_LIST}>
              {jobs.map((j) => (
                <li key={j.id}>
                  <ImportJobRow
                    job={j}
                    showProvider
                    onPlan={() => setPlanJob(j)}
                    onDiscard={() => onDiscard(j)}
                    onCancel={() => onCancel(j)}
                    onRollback={() => onRollback(j)}
                    onRetryFailed={() => onRetryFailed(j.id)}
                    onInvite={() => setInviteJob(j)}
                    onShowErrors={() => setErrorsJobId(j.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>

        <SettingsSection level={3} title="Start an import">
          {/* The tool, as a choice of one: the app's segmented control. Its
              loading state is drawn inside the same well, at the options'
              height (it was six bare bars, 32px against the real 40px). */}
          {providersLoading && !providersResp ? (
            <div role="status" aria-label="Loading the tools" className={segmentedWell}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 md:h-6" />
              ))}
            </div>
          ) : providersError && !providersResp ? (
            <ErrorState
              compact
              subject="the tools you can import from"
              detail={apiErrorStatus(providersError) ? apiErrorMessage(providersError) : undefined}
              onRetry={() => void refetchProviders()}
            />
          ) : (
            <SourcePicker value={selectedProvider} onChange={chooseProvider} choices={choices} />
          )}

          {!selectedProvider && !providersError && (
            <p className="text-xs text-muted-foreground">Pick a tool to connect it or start an import from it.</p>
          )}

          {/* The picked tool's panel: its account, then a new import from it,
              one list of two rows. */}
          {selectedProvider && (
            <div data-provider-panel="" className="set-card">
              <div className="set-row flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {connError && !conResp ? (
                  <>
                    <p role="alert" className="text-sm text-muted-foreground">
                      Couldn&apos;t check the connection to {providerName}.
                    </p>
                    <Button size="sm" variant="outline" className={cn(ROW_ACTION, "shrink-0 self-start sm:self-auto")} onClick={() => void refetchConn()}>
                      Try again
                    </Button>
                  </>
                ) : connection ? (
                  <>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <StatusWord tone="success" className="min-w-0">
                        <span className="truncate">
                          Connected{connection.source_account_name ? ` as ${connection.source_account_name}` : ""}
                        </span>
                      </StatusWord>
                      {connection.expires_at && (
                        <span className="text-xs text-muted-foreground">Until {shortDateTime(new Date(connection.expires_at))}</span>
                      )}
                    </p>
                    <Button size="sm" variant="ghost" onClick={onDisconnect} className={cn(ROW_ACTION, "shrink-0 self-start sm:self-auto")}>
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <StatusWord className="mr-1.5">Not connected</StatusWord>
                      Connect your {providerName} account to import from it.
                    </p>
                    <Button size="sm" variant="outline" className={cn(ROW_ACTION, "shrink-0 gap-1.5 self-start sm:self-auto")} onClick={() => setConnectOpen(true)}>
                      <Plug /> Connect {providerName}
                    </Button>
                  </>
                )}
              </div>

              {connection && (
                <section aria-labelledby="import-new" className="set-row space-y-3">
                  <h4 id="import-new" className="text-sm font-medium">
                    New import from {providerName}
                  </h4>

                  {/* Discover dropdown — populated after connect. The
                      label depends on the active provider so a token
                      that returns mixed-kind discovery items (e.g.
                      OAuth across multiple Asana orgs) doesn't show
                      a stale label. */}
                  {offersPages && (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="import-pages"
                        className="mt-0.5"
                        checked={bringPages}
                        onCheckedChange={(v) => setBringPages(v === true)}
                        aria-describedby="import-pages-help"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <label htmlFor="import-pages" className="text-sm font-medium">
                          Bring pages across as docs
                        </label>
                        <p id="import-pages-help" className="text-xs text-muted-foreground">
                          Every page the token can read comes across as a doc in its tree, private to you until you share
                          it, and each database inside a page as a table.
                          {selectedProvider === "notion" &&
                            " A personal access token reads what you can in Notion; a connection's token reads the pages shared with it."}
                        </p>
                      </div>
                    </div>
                  )}
                  {discoverItems.length > 0 && (
                    <Field label={pickLabel(selectedProvider, pages)} error={pickError}>
                      <select
                        ref={pickRef}
                        value={pickedDiscoverId}
                        onChange={(e) => {
                          setPickedDiscoverId(e.target.value)
                          setPickError("")
                          const picked = discoverItems.find((d) => d.id === e.target.value)
                          if (picked && !workspaceName) setWorkspaceName(picked.name)
                        }}
                        // The fields' own height: 44px on a phone, 36px from md up.
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm md:h-9"
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
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Loading the list…
                    </p>
                  )}
                  {discoverProblem && !discoverLoading && (
                    <div role="alert" className="cx-imp-note flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                      <p className="min-w-0 flex-1 break-words text-danger-ink">{discoverProblem.message}<SaysLoadFailure /></p>
                      <div className="flex shrink-0 gap-2">
                        {needsReconnect(discoverProblem) && (
                          <Button size="sm" variant="outline" className={cn(ROW_ACTION, "gap-1.5")} onClick={() => setConnectOpen(true)}>
                            <Plug /> Reconnect
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className={ROW_ACTION} onClick={() => setDiscoverAttempt((n) => n + 1)}>
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
                        tab keeps one filled button, the Slack section's New import.
                        The fields' height, beside them in the form. */}
                    <Button variant="outline" className="h-11 gap-1.5 md:h-9" onClick={startNewJob} disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" /> Starting…
                        </>
                      ) : (
                        <>
                          <Plus /> Start import
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
            </div>
          )}
        </SettingsSection>
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
    </SettingsSection>
  )
}

/**
 * "Start an import": the tools as a grid of source cards (§A14, mock M5), 72px,
 * raised at e1, each a neutral mark, the tool's name and what comes across.
 * Slack is first and two columns wide. It hands off to the Slack section above
 * (SlackImportCard), which owns the export's upload: the card scrolls there
 * and opens it. The other tools are a choice of one (a radio group), as the
 * segmented strip of names was, with arrow keys moving between them.
 */
function SourcePicker({
  value,
  onChange,
  choices,
}: {
  value: ImportProvider | null
  onChange: (p: ImportProvider | null) => void
  choices: Array<{ value: ImportProvider | ""; label: string }>
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const focusable = Math.max(0, choices.findIndex((c) => c.value === value))
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + choices.length) % choices.length
    refs.current[next]?.focus()
    onChange((choices[next].value || null) as ImportProvider | null)
  }
  const startSlack = () => {
    document.getElementById("import-slack")?.scrollIntoView?.({ block: "start", behavior: "smooth" })
    window.dispatchEvent(new Event(SLACK_IMPORT_NEW_EVENT))
  }
  return (
    <div className="cx-imp-sources-wrap">
      <div data-source-picker="" className="cx-imp-sources">
        <button type="button" data-source-card="slack" data-wide="true" className="cx-imp-source" onClick={startSlack}>
          <SourceMark vendor="slack" name="Slack" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">Slack</span>
            <span className="cx-imp-source-line line-clamp-2 text-pretty">Channels, threads, files</span>
          </span>
        </button>
        {/* contents: the radios sit in the grid beside Slack. */}
        <div role="radiogroup" aria-label="Tool to import from" className="contents">
          {choices.map((c, i) => {
            const checked = c.value === value
            return (
              <button
                key={c.value}
                ref={(el) => {
                  refs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={c.label}
                tabIndex={i === focusable ? 0 : -1}
                data-source-card={c.value}
                className="cx-imp-source"
                onClick={() => onChange((c.value || null) as ImportProvider | null)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <SourceMark vendor={c.value} name={c.label} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{c.label}</span>
                  {/* Two lines rather than an ellipsis: at a third of the column the
                      line was "Projects, tasks, comm…" on every card. */}
                  <span className="cx-imp-source-line line-clamp-2 text-pretty">
                    {SOURCE_LINE[c.value as ImportProvider] ?? "Projects, tasks, comments"}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ImportCard
