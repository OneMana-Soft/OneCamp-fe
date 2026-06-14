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
 */

import React, { useMemo, useState, Suspense, lazy } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { GetEndpointUrl } from "@/services/endPoints"
import {
  Upload,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
} from "@/lib/icons"
import { PlayCircle, Database } from "lucide-react"
import {
  cancelSlackImport,
  deleteStagedZip,
  rollbackSlackImport,
  runSlackImport,
  type SlackImportJob,
} from "@/services/slackImportService"
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
import { mutate as swrMutate } from "swr"

// Progress polling fallback interval. Kept loose because MQTT carries the
// fast path; this is purely defensive.
const POLL_INTERVAL_MS = 6000
// Hard cap on fallback polling so a runaway interval can't hammer the API.
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

const SlackImportCard: React.FC = () => {
  const { toast } = useToast()
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected

  const { data, isLoading, mutate: refetch } = useFetch<{ jobs: SlackImportJob[] }>(
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

  const onUploaded = (jobId: string) => {
    setUploadOpen(false)
    setPlanJobId(jobId)
    refetch()
  }

  const onPlanRan = () => {
    setPlanJobId(null)
    refetch()
  }

  const handleRun = async (job: SlackImportJob) => {
    try {
      setBusyJobId(job.id)
      await runSlackImport(job.id)
      toast({ title: "Import started", description: `${job.slack_workspace_name} is now importing.` })
      // Bust the live progress source.
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      toast({
        title: "Could not start import",
        description: errorMessage(err),
        variant: "destructive",
      })
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCancel = async (job: SlackImportJob) => {
    if (!confirm(`Cancel import for ${job.slack_workspace_name}? In-flight chunks finish, then the job stops.`)) return
    try {
      setBusyJobId(job.id)
      await cancelSlackImport(job.id)
      toast({ title: "Cancellation sent" })
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      toast({ title: "Cancel failed", description: errorMessage(err), variant: "destructive" })
    } finally {
      setBusyJobId(null)
    }
  }

  const handleRollback = async (job: SlackImportJob) => {
    const confirm1 = window.prompt(
      `Type "ROLLBACK" to soft-delete every entity created by the import of ${job.slack_workspace_name}.\n\nThis cannot be reversed automatically; you would need to re-import.`,
    )
    if (confirm1 !== "ROLLBACK") return
    try {
      setBusyJobId(job.id)
      await rollbackSlackImport(job.id)
      toast({ title: "Rollback complete" })
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      toast({ title: "Rollback failed", description: errorMessage(err), variant: "destructive" })
    } finally {
      setBusyJobId(null)
    }
  }

  const handleDeleteStagedZip = async (job: SlackImportJob) => {
    if (!confirm(`Delete the staged Slack ZIP for ${job.slack_workspace_name} from storage?\n\nThe import is preserved; only the source file is removed. You won't be able to retry without re-uploading.`)) return
    try {
      setBusyJobId(job.id)
      await deleteStagedZip(job.id)
      toast({ title: "Staged file deleted" })
      swrMutate((key) => typeof key === "string" && key.includes("/admin/import/slack/jobs"))
    } catch (err) {
      toast({
        title: "Could not delete staged file",
        description: errorMessage(err),
        variant: "destructive",
      })
    } finally {
      setBusyJobId(null)
    }
  }

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 shadow-sm h-full overflow-hidden flex flex-col">
        <CardHeader className="pb-4 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold tracking-tight">
                <Database className="h-5 w-5 text-primary" />
                Import from Slack
              </CardTitle>
              <CardDescription className="mt-1">
                Upload a Slack workspace export to bring channels, messages, threads, files and reactions into OneCamp.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0 self-start">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
              </Button>
              <Button onClick={() => setUploadOpen(true)} size="sm">
                <Upload className="h-4 w-4 mr-1.5" /> New import
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto py-4 space-y-3">
          {isLoading && (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading jobs…</div>
          )}
          {!isLoading && jobs.length === 0 && (
            <div className="text-center py-12">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                No imports yet. Click <strong>New import</strong> to upload a Slack export.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Get your export from <em>Slack → Settings → Workspace settings → Import/Export Data</em>.
              </p>
            </div>
          )}

          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              busy={busyJobId === job.id}
              onPlan={() => setPlanJobId(job.id)}
              onRun={() => handleRun(job)}
              onCancel={() => handleCancel(job)}
              onRollback={() => handleRollback(job)}
              onDeleteZip={() => handleDeleteStagedZip(job)}
              onShowErrors={() => setErrorsJobId(job.id)}
            />
          ))}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <SlackImportUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={onUploaded}
        />
        {planJobId && (
          <SlackImportPlanDialog
            jobId={planJobId}
            open={!!planJobId}
            onOpenChange={(open) => !open && setPlanJobId(null)}
            onComplete={onPlanRan}
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

interface JobRowProps {
  job: SlackImportJob
  busy: boolean
  onPlan: () => void
  onRun: () => void
  onCancel: () => void
  onRollback: () => void
  onDeleteZip: () => void
  onShowErrors: () => void
}

const JobRow: React.FC<JobRowProps> = ({ job, busy, onPlan, onRun, onCancel, onRollback, onDeleteZip, onShowErrors }) => {
  const status = STATUS_BADGE[job.status] ?? STATUS_BADGE.pending
  const stageLabel = (job.stage && STAGE_LABELS[job.stage]) || job.stage || ""
  const total = Math.max(1, job.chunks_total)
  const pct = job.status === "completed" ? 100 : Math.round((job.chunks_done / total) * 100)

  return (
    <div className="border border-border/40 rounded-lg p-4 bg-background/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{job.slack_workspace_name}</span>
            <Badge variant="outline" className={`gap-1.5 ${status.className}`}>
              {status.icon}
              <span className="capitalize">{job.status.replace("_", " ")}</span>
            </Badge>
            {stageLabel && job.status === "running" && (
              <Badge variant="outline">{stageLabel}</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            ID {job.id.slice(0, 8)} · started {job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
          </div>
          {job.error_message && (
            <div className="mt-2 text-xs text-red-500 max-w-full break-words">{job.error_message}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.status === "validating" && (
            <Button size="sm" onClick={onPlan} disabled={busy}>
              Plan
            </Button>
          )}
          {(job.status === "planned" || job.status === "failed") && (
            <Button size="sm" onClick={onRun} disabled={busy}>
              <PlayCircle className="h-4 w-4 mr-1.5" />
              Run
            </Button>
          )}
          {(job.status === "running" || job.status === "paused") && (
            <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          {(job.status === "completed" || job.status === "failed" || job.status === "cancelled") && (
            <Button size="sm" variant="outline" onClick={onRollback} disabled={busy}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Rollback
            </Button>
          )}
          {(job.status === "completed" ||
            job.status === "failed" ||
            job.status === "cancelled" ||
            job.status === "rolled_back") && (
            <Button size="sm" variant="ghost" onClick={onDeleteZip} disabled={busy}>
              Free storage
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onShowErrors}>
            Errors{job.errors_total ? ` (${job.errors_total})` : ""}
          </Button>
        </div>
      </div>

      {(job.status === "running" || job.status === "completed" || job.status === "paused") && (
        <>
          <Separator className="my-3" />
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-xs">
            <Stat label="Chunks" value={`${job.chunks_done}/${job.chunks_total}`} />
            <Stat label="Items" value={job.items_imported.toLocaleString()} />
            <Stat label="Failures" value={job.chunks_failed} />
            <Stat label="Errors" value={job.errors_total} />
          </div>
          <Progress value={pct} className="mt-3 h-2" />
        </>
      )}
    </div>
  )
}

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</div>
    <div className="font-medium">{value}</div>
  </div>
)

function isLive(status: SlackImportJob["status"]): boolean {
  return status === "validating" || status === "planned" || status === "running" || status === "paused"
}

function errorMessage(err: unknown): string {
  if (!err) return "Unknown error"
  // axios error shape with response data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = err as any
  return e?.response?.data?.error || e?.message || "Unknown error"
}

export default SlackImportCard
