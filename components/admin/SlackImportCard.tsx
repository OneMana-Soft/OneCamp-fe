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
 * and says where it stands as a dot and a word, as the other importers' rows
 * do. A row's next step is an outline button: the tab keeps one filled
 * action, New import, on the section's title row. One flat section like every
 * other admin tab, where it was a bordered Card with each import a box in it.
 */

import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react"
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { ConfirmAlertDialog } from "@/components/dialog/confirmAlertDialog"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useMqtt } from "@/components/mqtt/mqttContext"
import { AdminGet } from "@/services/endpoints/admin"
import { Upload, RefreshCw, RotateCcw, Users, AlertTriangle, HardDrive } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotImported } from "@/components/ui/graphics"
import { cn } from "@/lib/utils/helpers/cn"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import {
  cancelSlackImport,
  deleteStagedZip,
  rollbackSlackImport,
  runSlackImport,
  apiReadOf,
  type SlackImportJob,
} from "@/services/slackImportService"
import { importProblemOf } from "@/services/importService"
import { IMPORT_LIST, ImportRowsSkeleton, ROW_ACTION, count, partsLine } from "@/components/admin/ImportJobRow"
import { ImportJobFrame, SLACK_IMPORT_NEW_EVENT } from "@/components/admin/importParts"
import type { RowMenuItem } from "@/components/admin/connectParts"
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
  reading: "through Slack's API",
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
    AdminGet.GetSlackImportJobs,
  )

  const jobs = useMemo(() => data?.jobs ?? [], [data])
  const runningJobs = useMemo(() => jobs.filter(isLive), [jobs])

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

  // The import picker's Slack card (ImportCard) asks for a new Slack import:
  // this section owns the upload, so it opens it here.
  useEffect(() => {
    const open = () => setUploadOpen(true)
    window.addEventListener(SLACK_IMPORT_NEW_EVENT, open)
    return () => window.removeEventListener(SLACK_IMPORT_NEW_EVENT, open)
  }, [])

  // The guided run's Slack tile (ImportCard's FIRST_RUN_SLACK_HREF) brings the
  // admin here with ?slack=new: the upload opens, and the address loses the
  // ask, so a reload doesn't open it again.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("slack") !== "new") return
    url.searchParams.delete("slack")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    setUploadOpen(true)
    document.getElementById("import-slack")?.scrollIntoView?.({ block: "start" })
  }, [])

  const onUploaded = (jobId: string) => {
    setUploadOpen(false)
    setPlanJobId(jobId)
    refetch()
  }

  // A read through Slack's API runs on the server: marked in the list, which
  // shows how far it is, and planned from there when it finishes.
  const onReading = (jobId: string) => {
    setUploadOpen(false)
    setHighlightId(jobId)
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
      <SettingsSection
        id="import-slack"
        title="Import from Slack"
        description="Upload a Slack workspace export to bring channels, messages, threads, files and reactions into OneCamp."
        action={
          <>
            <Button variant="outline" size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => refetch()}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => setUploadOpen(true)}>
              <Upload /> New import
            </Button>
          </>
        }
      >
        {isLoading ? (
          <ImportRowsSkeleton label="Loading imports" />
        ) : isError ? (
          <ErrorState
            compact
            subject="the import history"
            detail={apiErrorStatus(isError) ? apiErrorMessage(isError) : undefined}
            onRetry={() => void refetch()}
          />
        ) : jobs.length === 0 ? (
          // A first run: nothing imported yet, so the imported spot, at the
          // empty state's quiet size (it was the large accent one, the only
          // one on the tab, above a boxed line from the next section).
          <EmptyState
            illustration={<SpotImported hue={ADMIN_GROUP_HUE.workspace} />}
            title="No imports from Slack yet"
            description={
              <>
                Choose <strong className="font-medium text-foreground">New import</strong> to upload a Slack export. Get
                yours from <em>Slack → Settings → Workspace settings → Import/Export Data</em>.
              </>
            }
          />
        ) : (
          <ul aria-label="Slack imports" className={IMPORT_LIST}>
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
      </SettingsSection>

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
          onReading={onReading}
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
  onClose,
  onConfirm,
}: {
  job: SlackImportJob
  busy: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown> | void
}) {
  const name = job.slack_workspace_name
  // The app's confirm with type-to-confirm (admin H4): the action waits for
  // the workspace's name, and the dialog stays until the server answers.
  return (
    <ConfirmAlertDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Roll back the import of ${name}?`}
      description="This takes away everything the import brought in: its channels, messages, threads, files and reactions. What your team has added since stays. It can't be undone here; to have it back, you would import the export again."
      confirmText="Roll back import"
      cancelText="Keep it"
      destructive
      requireText={name}
      onConfirm={onConfirm}
    />
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
  // A read through Slack's API: how far it is, while it reads and once it has.
  const reading = isReading(job)
  const read = apiReadOf(job)
  const pct = job.status === "completed" ? 100 : reading ? Math.round(((read?.conversations ?? 0) / Math.max(1, read?.of ?? 0)) * 100) : Math.round((job.chunks_done / total) * 100)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlighted) return
    ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" })
    ref.current?.focus({ preventScroll: true })
  }, [highlighted])

  const done = job.status === "completed" || job.status === "failed" || job.status === "cancelled" || job.status === "rolled_back"
  const ran = job.status === "running" || job.status === "completed" || job.status === "paused"
  const began = job.started_at || reading ? "Started" : job.source === "api" ? "Read" : "Uploaded"
  const meta = [`${began} ${shortDateTime(new Date(job.started_at ?? job.created_at))}`]
  if (read && !ran) {
    if (reading && read.of > 0) meta.push(`${read.conversations.toLocaleString()} of ${count(read.of, "conversation", "conversations")}`)
    else if (!reading) meta.push(count(read.conversations, "conversation", "conversations"))
    meta.push(count(read.messages + read.replies, "message", "messages"))
    if (read.files > 0) meta.push(count(read.files, "file", "files"))
  }
  if (ran) meta.push(count(job.items_imported, "item", "items"), partsLine(job.chunks_done, job.chunks_total))
  if (ran && job.chunks_failed > 0) meta.push(`${count(job.chunks_failed, "part", "parts")} failed`)

  // Done: what's left behind ⋯, so a list of finished imports is quiet.
  const menu: RowMenuItem[] = []
  if (done) {
    if (job.status === "completed" && onInvite) menu.push({ label: "Invite the people who came across", icon: Users, onSelect: onInvite, disabled: busy })
    if (job.errors_total > 0) menu.push({ label: `See ${count(job.errors_total, "error", "errors")}`, icon: AlertTriangle, onSelect: onShowErrors })
    menu.push({ label: "Free storage", icon: HardDrive, onSelect: onDeleteZip, disabled: busy })
    if (job.status !== "rolled_back")
      menu.push({ label: "Roll back", icon: RotateCcw, onSelect: onRollback, destructive: true, disabled: busy, separated: true })
  }

  return (
    <ImportJobFrame
      rowRef={ref}
      jobId={job.id}
      vendor="slack"
      vendorName="Slack"
      name={job.slack_workspace_name}
      status={reading ? "reading" : job.status}
      stage={stageLabel}
      meta={meta}
      pct={pct}
      highlighted={highlighted}
      errorsLabel={job.errors_total > 0 ? count(job.errors_total, "error", "errors") : undefined}
      onShowErrors={onShowErrors}
      menu={menu}
      actions={
        <>
          {job.status === "validating" && (
            <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onPlan} disabled={busy}>
              Plan
            </Button>
          )}
          {(job.status === "planned" || (job.status === "failed" && job.plan)) && (
            <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onRun} disabled={busy}>
              <PlayCircle />
              {job.status === "failed" ? "Run again" : "Run"}
            </Button>
          )}
          {job.status === "failed" && (
            <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onPlan} disabled={busy}>
              Plan again
            </Button>
          )}
          {(job.status === "pending" || job.status === "validating" || job.status === "planned") && onDiscard && (
            <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={onDiscard} disabled={busy}>
              Discard
            </Button>
          )}
          {(job.status === "running" || job.status === "paused") && (
            <Button size="sm" variant="ghost" className={ROW_ACTION} onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
        </>
      }
      below={() =>
        job.error_message ? (
          <p className="max-w-full break-words text-xs text-danger-ink">{job.error_message}</p>
        ) : null
      }
    />
  )
}

function isLive(job: SlackImportJob): boolean {
  const s = job.status
  return isReading(job) || s === "validating" || s === "planned" || s === "running" || s === "paused"
}

/** A read through Slack's API under way. Pure. */
function isReading(job: Pick<SlackImportJob, "status" | "stage">): boolean {
  return job.status === "pending" && job.stage === "reading"
}

export default SlackImportCard
