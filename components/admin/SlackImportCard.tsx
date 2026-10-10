"use client"

/**
 * SlackImportCard — admin panel for importing Slack workspace exports.
 *
 * High-level flow:
 *   1. Upload a .zip   (UploadDialog)         → backend stages in MinIO
 *   2. Build a plan    (PlanDialog)            → backend parses + counts
 *   3. Run the import  (Run button)            → backend processes async
 *   4. Watch progress  (live MQTT + SWR poll)
 *   5. Errors / Rollback / Cancel              → if anything goes wrong
 *
 * Implementation notes:
 * - Live progress via the existing admin MQTT broadcast topic.
 *   useMqttMessageHandler will revalidate SWR when a Slack_Import_Progress
 *   event arrives. We also fall back to 6s polling when MQTT is down.
 * - The card is intentionally self-contained; it does not depend on
 *   uiSlice so it can be moved to a future /app/app/admin/import page
 *   without touching unrelated state.
 *
 * Each row reads like the task panel (quiet labels, values in ink at one x)
 * and says where it stands in the status tokens, the words the other
 * importers' rows use. A row's next step is an outline button: the tab keeps
 * one filled action, New import.
 */

import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { GetEndpointUrl } from "@/services/endPoints"
import { Upload, RefreshCw, RotateCcw, Users, AlertTriangle } from "@/lib/icons"
import { PlayCircle, Sparkles } from "lucide-react"
import { Eyebrow } from "@/components/ui/eyebrow"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { cn } from "@/lib/utils/helpers/cn"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import {
  cancelSlackImport,
  deleteStagedZip,
  rollbackSlackImport,
  runSlackImport,
  type SlackImportJob,
} from "@/services/slackImportService"
import { importProblemOf } from "@/services/importService"
import { ImportStatusChip, count, partsLine } from "@/components/admin/ImportJobRow"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
// Lazy-load the heavy dialogs (multi-GB upload widget, plan dialog
// with mappings, error pagination). Same rationale as ImportCard:
// the admin overview should render immediately; the dialogs only
// matter when an action is taken.
const SlackImportUploadDialog = lazy(() =>
  import("@/components/admin/SlackImportUploadDialog").then((m) => ({ default: m.SlackImportUploadDialog })),
)
const SlackImportPlanDialog = lazy(() =>
  import("@/components/admin/SlackImportPlanDialog").then((m) => ({ default: m.SlackImportPlanDialog })),
)
const SlackImportErrorsDialog = lazy(() =>
  import("@/components/admin/SlackImportErrorsDialog").then((m) => ({ default: m.SlackImportErrorsDialog })),
)
const ImportInviteDialog = lazy(() =>
  import("@/components/admin/ImportInviteDialog").then((m) => ({ default: m.ImportInviteDialog })),
)
import { appMutate as swrMutate } from "@/lib/swrMutate";

// Progress polling fallback interval. Kept loose because MQTT carries the
// fast path; this is purely defensive.
const POLL_INTERVAL_MS = 6000
// Hard cap on fallback polling so a runaway interval can't hammer the API.
const POLL_CAP_MS = 10 * 60 * 1000

const STAGE_LABELS: Record<string, string> = {
  validating: "Validating",
  planned: "Planned",
  queued: "Queued",
  users: "Resolving users",
  channels: "Creating channels",
  messages: "Importing messages",
  threads: "Importing threads",
  files: "Downloading files",
  reactions: "Applying reactions",
  finalize: "Finalising",
  cancelled: "Cancelled",
  failed: "Failed",
  rolled_back: "Rolled back",
}

/** An export still waiting for its plan: the plan is where it goes next. */
const needsPlan = (j: SlackImportJob) => j.status === "validating" || (j.status === "failed" && !j.plan)

const SlackImportCard: React.FC = () => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected

  const { data, isLoading, isError, mutate: refetch } = useFetch<{ jobs: SlackImportJob[] }>(
    GetEndpointUrl.GetSlackImportJobs,
  )

  const jobs = useMemo(() => data?.jobs ?? [], [data])
  const runningJobs = useMemo(() => jobs.filter((j) => isLive(j.status)), [jobs])

  // -------- Polling fallback --------
  // useResilientPolling does the heavy lifting: pause on hidden tabs,
  // skip when MQTT is healthy, exponential backoff on errors, hard
  // cap on total duration. Keeping the hook usage minimal makes
  // every admin card use the same lifecycle.
  useResilientPolling({
    enabled: runningJobs.length > 0,
    mqttHealthy: isMqttHealthy,
    interval: POLL_INTERVAL_MS,
    capMs: POLL_CAP_MS,
    onPoll: refetch,
  })

  // -------- Dialog state --------
  const [uploadOpen, setUploadOpen] = useState(false)
  const [planJobId, setPlanJobId] = useState<string | null>(null)
  const [errorsJobId, setErrorsJobId] = useState<string | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [inviteJob, setInviteJob] = useState<SlackImportJob | null>(null)
  const [rollbackJob, setRollbackJob] = useState<SlackImportJob | null>(null)
  // The import an export uploaded twice already made, marked in the list.
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 8000)
    return () => clearTimeout(t)
  }, [highlightId])

  const onUploaded = (jobId: string) => {
    setUploadOpen(false)
    setPlanJobId(jobId)
    refetch()
  }

  // The same export uploaded again: show the import it made. One still
  // waiting for its plan goes to the plan; any other is marked in the list,
  // where it used to open the plan of an import that had already finished.
  const onShowExisting = (jobId: string) => {
    setUploadOpen(false)
    const existing = jobs.find((j) => j.id === jobId)
    if (existing && needsPlan(existing)) {
      setPlanJobId(jobId)
      return
    }
    setHighlightId(jobId)
    if (!existing) refetch()
  }

  const onPlanRan = () => {
    setPlanJobId(null)
    refetch()
  }

  const handleRun = async (job: SlackImportJob) => {
    try {
      setBusyJobId(job.id)
      await runSlackImport(job.id)
      toast({ title: "Import started", description: `${job.slack_workspace_name} is importing now.` })
      // Bust the live progress source.
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({
        title: "Couldn't start the import",
        description: importProblemOf(err).message,
        variant: "destructive",
      })
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCancel = (job: SlackImportJob) => {
    confirm({
      title: `Cancel the import of ${job.slack_workspace_name}?`,
      description: "What has come across so far stays. Messages still being written finish first, then it stops.",
      confirmText: "Cancel import",
      cancelText: "Keep importing",
      destructive: true,
      onConfirm: async () => {
        try {
          setBusyJobId(job.id)
          await cancelSlackImport(job.id)
          toast({ title: "Cancelling the import", description: "It stops once the messages in progress are written." })
          swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
        } catch (err) {
          toast({ title: "Couldn't cancel the import", description: importProblemOf(err).message, variant: "destructive" })
        } finally {
          setBusyJobId(null)
        }
      },
    })
  }

  const handleDiscard = (job: SlackImportJob) => {
    confirm({
      title: "Discard this export?",
      description: `${job.slack_workspace_name} hasn't been imported yet. Discarding it deletes the uploaded file and lets you start a new import of this workspace.`,
      confirmText: "Discard export",
      destructive: true,
      onConfirm: async () => {
        try {
          setBusyJobId(job.id)
          await cancelSlackImport(job.id)
          toast({ title: "Discarded" })
          swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
        } catch (err) {
          toast({ title: "Couldn't discard it", description: importProblemOf(err).message, variant: "destructive" })
        } finally {
          setBusyJobId(null)
        }
      },
    })
  }

  // Rolling back used the browser's own prompt to type ROLLBACK: unstyled,
  // blocking, and suppressed in some installed-app windows. It asks in its
  // own dialog now (RollbackDialog), for the workspace's name.
  const doRollback = async (job: SlackImportJob) => {
    try {
      setBusyJobId(job.id)
      await rollbackSlackImport(job.id)
      toast({ title: "Rolled back", description: `What the import of ${job.slack_workspace_name} brought in is gone.` })
      setRollbackJob(null)
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      // The request shows no toast of its own: this is the one.
      toast({ title: "Couldn't roll back the import", description: importProblemOf(err).message, variant: "destructive" })
    } finally {
      setBusyJobId(null)
    }
  }

  const handleDeleteStagedZip = async (job: SlackImportJob) => {
    confirm({
      title: "Delete the uploaded export?",
      description: `The Slack file for ${job.slack_workspace_name} is removed from storage. What was imported stays; to import it again, you would upload the file again.`,
      confirmText: "Delete export",
      destructive: true,
      onConfirm: async () => {
        try {
          setBusyJobId(job.id)
          await deleteStagedZip(job.id)
          toast({ title: "Export file deleted" })
          swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
        } catch (err) {
          // The request shows no toast of its own: this is the one.
          toast({
            title: "Couldn't delete the export file",
            description: importProblemOf(err).message,
            variant: "destructive",
          })
        } finally {
          setBusyJobId(null)
        }
      },
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                Import from Slack
              </CardTitle>
              <CardDescription className="mt-1">
                Upload a Slack workspace export to bring channels, messages, threads, files and reactions into OneCamp.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0 self-start">
              <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
              </Button>
              <Button onClick={() => setUploadOpen(true)} size="sm" className="h-8">
                <Upload className="h-4 w-4 mr-1.5" /> New import
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading && (
            <div role="status" aria-label="Loading imports">
              <SkeletonRows rows={3} />
            </div>
          )}
          {isError && (
            <ErrorState subject="the import history" onRetry={() => void refetch()} />
          )}
          {!isError && !isLoading && jobs.length === 0 && (
            <EmptyState
              tone="accent"
              icon={Upload}
              hue={ADMIN_GROUP_HUE.workspace}
              title="No imports yet"
              description={
                <>
                  Click <strong className="font-medium text-foreground">New import</strong> to upload a
                  Slack export. Get yours from{" "}
                  <em>Slack → Settings → Workspace settings → Import/Export Data</em>.
                </>
              }
            />
          )}

          {jobs.length > 0 && (
            <ul aria-label="Slack imports" className="divide-y divide-border rounded-lg border border-border">
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobRow
                    job={job}
                    busy={busyJobId === job.id}
                    highlighted={highlightId === job.id}
                    onPlan={() => setPlanJobId(job.id)}
                    onRun={() => handleRun(job)}
                    onCancel={() => handleCancel(job)}
                    onRollback={() => setRollbackJob(job)}
                    onDeleteZip={() => handleDeleteStagedZip(job)}
                    onShowErrors={() => setErrorsJobId(job.id)}
                    onInvite={() => setInviteJob(job)}
                    onDiscard={() => handleDiscard(job)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {rollbackJob && (
        <RollbackDialog
          job={rollbackJob}
          busy={busyJobId === rollbackJob.id}
          onClose={() => setRollbackJob(null)}
          onConfirm={() => doRollback(rollbackJob)}
        />
      )}

      <Suspense fallback={null}>
        <SlackImportUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={onUploaded}
          onShowExisting={onShowExisting}
          onChanged={() => refetch()}
        />
        {planJobId && (
          <SlackImportPlanDialog
            jobId={planJobId}
            open={!!planJobId}
            onOpenChange={(open) => !open && setPlanJobId(null)}
            onComplete={onPlanRan}
            onChanged={() => refetch()}
          />
        )}
        {inviteJob && (
          <ImportInviteDialog
            jobId={inviteJob.id}
            label={inviteJob.slack_workspace_name}
            open={!!inviteJob}
            onOpenChange={(open) => !open && setInviteJob(null)}
          />
        )}
        {errorsJobId && (
          <SlackImportErrorsDialog
            jobId={errorsJobId}
            open={!!errorsJobId}
            onOpenChange={(open) => !open && setErrorsJobId(null)}
          />
        )}
      </Suspense>
    </>
  )
}

/**
 * Rolling back an import, confirmed by typing the workspace's name: it takes
 * away everything the import brought in and cannot be undone from here.
 */
function RollbackDialog({
  job,
  busy,
  onClose,
  onConfirm,
}: {
  job: SlackImportJob
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState("")
  const name = job.slack_workspace_name
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase()
  return (
    <AlertDialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Roll back the import of {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This takes away everything the import brought in: its channels, messages, threads, files and reactions.
            What your team has added since stays. It can&apos;t be undone here; to have it back, you would import the
            export again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field label={<>Type {name} to confirm</>}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matches || busy}
            className={buttonVariants({ variant: "destructive" })}
            onClick={(e) => {
              // The dialog stays open until the server has answered.
              e.preventDefault()
              onConfirm()
            }}
          >
            {busy ? "Rolling back…" : "Roll back import"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface JobRowProps {
  job: SlackImportJob
  busy: boolean
  /** The import a repeated upload pointed to: marked and brought into view. */
  highlighted?: boolean
  onPlan: () => void
  onRun: () => void
  onCancel: () => void
  onRollback: () => void
  onDeleteZip: () => void
  onShowErrors: () => void
  /** Invite the people who came across; offered once the import finished. */
  onInvite?: () => void
  /** Discard an export still waiting to be planned or run. */
  onDiscard?: () => void
}

// Exported for tests. The card around it needs polling, MQTT and endpoint
// config to mount, none of which the row's own rendering depends on.
export const JobRow: React.FC<JobRowProps> = ({ job, busy, highlighted, onPlan, onRun, onCancel, onRollback, onDeleteZip, onShowErrors, onInvite, onDiscard }) => {
  const stageLabel = (job.stage && STAGE_LABELS[job.stage]) || job.stage || ""
  const total = Math.max(1, job.chunks_total)
  const pct = job.status === "completed" ? 100 : Math.round((job.chunks_done / total) * 100)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlighted) return
    ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" })
    ref.current?.focus({ preventScroll: true })
  }, [highlighted])

  return (
    <div
      ref={ref}
      data-job-id={job.id}
      data-highlighted={highlighted ? "true" : undefined}
      tabIndex={highlighted ? -1 : undefined}
      className={cn("space-y-2 rounded-lg p-3 outline-none transition-shadow", highlighted && "ring-2 ring-ring/70")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{job.slack_workspace_name}</span>
          {/* Its own component, so the moment an import finishes can be marked
              on it without touching the row. */}
          <ImportStatusChip status={job.status} />
          {stageLabel && job.status === "running" && <span className="text-xs text-muted-foreground">{stageLabel}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {job.status === "validating" && (
            <Button size="sm" variant="outline" className="h-8" onClick={onPlan} disabled={busy}>
              Plan
            </Button>
          )}
          {(job.status === "planned" || (job.status === "failed" && job.plan)) && (
            <Button size="sm" variant="outline" className="h-8" onClick={onRun} disabled={busy}>
              <PlayCircle className="h-4 w-4 mr-1.5" />
              {job.status === "failed" ? "Run again" : "Run"}
            </Button>
          )}
          {job.status === "failed" && (
            <Button size="sm" variant="outline" className="h-8" onClick={onPlan} disabled={busy}>
              Plan again
            </Button>
          )}
          {(job.status === "pending" || job.status === "validating" || job.status === "planned") && onDiscard && (
            <Button size="sm" variant="outline" className="h-8" onClick={onDiscard} disabled={busy}>
              Discard
            </Button>
          )}
          {(job.status === "running" || job.status === "paused") && (
            <Button size="sm" variant="outline" className="h-8" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          {job.status === "completed" && onInvite && (
            <Button size="sm" variant="outline" className="h-8" onClick={onInvite} disabled={busy}>
              <Users className="h-4 w-4 mr-1.5" />
              Invite people
            </Button>
          )}
          {(job.status === "completed" || job.status === "failed" || job.status === "cancelled") && (
            <Button size="sm" variant="outline" className="h-8" onClick={onRollback} disabled={busy}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Roll back
            </Button>
          )}
          {(job.status === "completed" ||
            job.status === "failed" ||
            job.status === "cancelled" ||
            job.status === "rolled_back") && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onDeleteZip} disabled={busy}>
              Free storage
            </Button>
          )}
          {/* Only when something was logged: "Errors" showed on every row. */}
          {job.errors_total > 0 && (
            <Button size="sm" variant="ghost" className="h-8" onClick={onShowErrors}>
              <AlertTriangle className="h-4 w-4 mr-1.5 text-warning-ink" />
              {count(job.errors_total, "error", "errors")}
            </Button>
          )}
        </div>
      </div>

      <dl className="space-y-1">
        <div className={fieldRow("center", "mb-0")}>
          <dt className={fieldLabel}>{job.started_at ? "Started" : "Uploaded"}</dt>
          <dd className="text-sm">{shortDateTime(new Date(job.started_at ?? job.created_at))}</dd>
        </div>
        {(job.status === "running" || job.status === "completed" || job.status === "paused") && (
          <>
            <div className={fieldRow("center", "mb-0")}>
              <dt className={fieldLabel}>Progress</dt>
              <dd className="flex min-w-0 items-center gap-3 text-sm">
                <Progress value={pct} className="h-1.5 w-28 shrink-0" aria-label={`${pct}% done`} />
                <span>{partsLine(job.chunks_done, job.chunks_total)}</span>
              </dd>
            </div>
            <div className={fieldRow("center", "mb-0")}>
              <dt className={fieldLabel}>Brought in</dt>
              <dd className="text-sm">{count(job.items_imported, "item", "items")}</dd>
            </div>
            {job.chunks_failed > 0 && (
              <div className={fieldRow("center", "mb-0")}>
                <dt className={fieldLabel}>Failed</dt>
                <dd className="text-sm text-danger-ink">{count(job.chunks_failed, "part", "parts")}</dd>
              </div>
            )}
          </>
        )}
      </dl>
      {job.error_message && <p className="max-w-full break-words text-xs text-danger-ink">{job.error_message}</p>}

      {job.digest && (
        <div className="rounded-md border border-border/40 bg-muted/30 p-3">
          <Eyebrow as="div" size="sm" className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            What came across
          </Eyebrow>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line">{job.digest}</p>
        </div>
      )}
    </div>
  )
}

function isLive(status: SlackImportJob["status"]): boolean {
  return status === "validating" || status === "planned" || status === "running" || status === "paused"
}

export default SlackImportCard
