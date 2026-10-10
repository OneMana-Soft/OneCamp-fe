"use client"

/**
 * The Archive section: how much has been archived, each kind's rule, and the
 * runs so far.
 *
 * Every read says when it failed: a failed read said "No archive policies
 * configured." or "No archive jobs have been run yet.", claims about the
 * workspace with nothing to do. Each kind has its own hued tile (one map,
 * archiveEntities), the same in the counts, its rule and its history, where
 * the icons sat in grey chips. Runs say where they stand as a dot and a word
 * (StatusWord), the way the task panel says a status. Rules and runs are
 * hairline rows in one list each.
 *
 * One flat section like every other admin tab: it was a bordered Card with a
 * p-4 header, its title 17px right and down of every other tab's, and its
 * three parts are sections inside it (level 3), not boxes in a box.
 */

import React, { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { Tile } from "@/components/ui/graphics/Tile"
import { History, RefreshCw, RotateCcw, Undo2 } from "@/lib/icons"
// Already a direct importer (PlayCircle), so Archive adds no file to the icon guard's count.
import { Archive, PlayCircle } from "lucide-react"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { purgeLine } from "@/lib/purgeLine"
import { cn } from "@/lib/utils/helpers/cn"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { openUI } from "@/store/slice/uiSlice"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { ARCHIVE_ENTITY_ORDER, archiveEntity } from "@/components/admin/archiveEntities"
import { archiveProblem } from "@/components/admin/archiveProblem"

interface ArchivePolicy {
  id: string; entity_type: string; retention_days: number; auto_archive: boolean
  archive_completed_tasks: boolean; archive_inactive_channels_days: number; compress_attachments: boolean
  purge_after_days?: number; purged_count?: number; purged_bytes?: number
  created_at: string; updated_at: string
}

interface ArchiveJob {
  id: string; entity_type: string; status: string; started_at?: string; completed_at?: string
  items_processed: number; items_archived: number; items_failed: number; error_message?: string; created_at: string
}

interface ArchiveStats {
  total_archived_posts: number; total_archived_chats: number; total_archived_tasks: number
  total_archived_recordings: number; total_archived_attachments: number; total_archived_docs: number
}

// Entity types that do not support job-level undo.
const UNSUPPORTED_UNDO: string[] = ["docs", "recordings"]

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting", tone: "warning" },
  running: { label: "Archiving", tone: "info" },
  completed: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

/** Where a run stands: a dot and a word, as the task panel says a status. It was a tinted pill. */
function RunStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending
  return (
    <StatusWord tone={s.tone} className="text-xs">
      {s.label}
    </StatusWord>
  )
}

const n = (v: number) => v.toLocaleString("en")
const items = (v: number) => `${n(v)} ${v === 1 ? "item" : "items"}`

/** The server's reason for a failed read, when it answered with one. */
const reasonOf = (e: unknown) => (e && apiErrorStatus(e) ? apiErrorMessage(e) : undefined)

/**
 * How long a finished run took, as a person says it: "108ms", "41s", "1m 48s",
 * "6m". Nothing for one still going. Runs over a minute read "373s".
 */
export function duration(job: Pick<ArchiveJob, "started_at" | "completed_at">): string {
  if (!job.completed_at || !job.started_at) return ""
  const ms = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const rest = secs % 60
  return rest ? `${m}m ${rest}s` : `${m}m`
}

/** A list of rows between hairlines, as every list on the admin page is drawn. */
const LIST = "divide-y divide-border rounded-lg border border-border"

/** A row's buttons: 44px touch targets on a phone, 32px from md up. */
const ROW_ACTION = "h-11 md:h-8"

/** Loading rows in the list's own shape: a tile, two lines, and the row's end. */
function RowsSkeleton({ label, rows = 3, actions = true }: { label: string; rows?: number; actions?: boolean }) {
  return (
    <ul role="status" aria-label={label} className={LIST}>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-1/3" : "w-1/4")} />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {actions && <Skeleton className="hidden h-8 w-28 md:block" />}
        </li>
      ))}
    </ul>
  )
}

const ArchiveCard = () => {
  const dispatch = useDispatch()
  const policiesFetch = useFetch<{ policies: ArchivePolicy[] }>(GetEndpointUrl.GetArchivePolicies)
  const jobsFetch = useFetch<{ jobs: ArchiveJob[] }>(GetEndpointUrl.GetArchiveJobs)
  const statsFetch = useFetch<{ stats: ArchiveStats }>(GetEndpointUrl.GetArchiveStats)
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected
  const { toast } = useToast()
  const [undoingJobId, setUndoingJobId] = useState<string | null>(null)

  // Hard cap on fallback polling: 6 minutes. If MQTT is dead and a job
  // genuinely runs longer than this, the user can hit the manual Refresh
  // button. Never let a runaway interval poll the API for hours.
  const POLL_CAP_MS = 6 * 60 * 1000
  const POLL_INTERVAL_MS = 6000

  const jobs = useMemo(() => jobsFetch.data?.jobs ?? [], [jobsFetch.data])
  const runningJobIds = useMemo(() => jobs.filter((x) => x.status === "running").map((x) => x.id).sort().join(","), [jobs])

  // Job status updates arrive via MQTT (`MqttMessageType.Archive_Job_Status`),
  // which busts the SWR cache for `/admin/archive/jobs` directly.
  // useResilientPolling is the fallback when MQTT is unavailable (dev
  // without broker, transient disconnect, non-admin user). It also
  // pauses on hidden tabs and applies exponential backoff on errors.
  useResilientPolling({
    enabled: runningJobIds.length > 0,
    mqttHealthy: isMqttHealthy,
    interval: POLL_INTERVAL_MS,
    capMs: POLL_CAP_MS,
    onPoll: jobsFetch.mutate,
  })

  const stats = statsFetch.data?.stats
  const statOf = (type: string): number => (stats ? Number((stats as unknown as Record<string, number>)[`total_archived_${type}`] ?? 0) : 0)

  const handleUndoJob = async (jobId: string) => {
    setUndoingJobId(jobId)
    try {
      const res = await axiosInstance.post(`${PostEndpointUrl.UndoArchiveJob}/${jobId}`, undefined, OWN_ERRORS)
      toast({ title: `Restored ${items(Number(res.data?.count ?? 0))}`, description: "They are back where they were." })
      void jobsFetch.mutate()
      void policiesFetch.mutate()
      void statsFetch.mutate()
    } catch (err: unknown) {
      toast({
        title: "Couldn't restore what this run archived",
        description: archiveProblem(err, "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setUndoingJobId(null)
    }
  }

  const policies = policiesFetch.data?.policies ?? []

  return (
    <SettingsSection
      title="Archive"
      description="Old posts, messages, tasks and files move to the archive by these rules. Archived items are hidden, not deleted, and can be restored, unless a rule deletes files for good."
      action={
        <Button
          variant="outline"
          size="sm"
          className={cn(sectionActionClass, "gap-1.5")}
          onClick={() => dispatch(openUI({ key: "archiveRestore" }))}
        >
          <RotateCcw />
          Restore items
        </Button>
      }
    >
      <div className="space-y-8">
        <SettingsSection level={3} title="Archived so far">
          {statsFetch.isLoading && !stats ? (
            <ul role="status" aria-label="Loading the counts" className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
              {ARCHIVE_ENTITY_ORDER.map((t) => (
                <li key={t} aria-hidden="true" className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </li>
              ))}
            </ul>
          ) : statsFetch.isError && !stats ? (
            <ErrorState compact subject="the counts" detail={reasonOf(statsFetch.isError)} onRetry={() => void statsFetch.mutate()} />
          ) : (
            <ul aria-label="Archived so far" className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
              {ARCHIVE_ENTITY_ORDER.map((type) => {
                const e = archiveEntity(type)
                const Icon = e.icon
                return (
                  <li key={type} className="flex items-center gap-3">
                    <Tile hue={e.hue} size="md">
                      <Icon />
                    </Tile>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">{n(statOf(type))}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.label}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SettingsSection>

        <SettingsSection level={3} title="Archive rules">
          {policiesFetch.isLoading && !policiesFetch.data ? (
            <RowsSkeleton label="Loading the archive rules" />
          ) : policiesFetch.isError && !policiesFetch.data ? (
            <ErrorState
              compact
              subject="the archive rules"
              detail={reasonOf(policiesFetch.isError)}
              onRetry={() => void policiesFetch.mutate()}
            />
          ) : policies.length === 0 ? (
            <EmptyState
              icon={Archive}
              hue={ADMIN_GROUP_HUE.workspace}
              title="No archive rules on this server"
              description="Rules say how old posts, messages, tasks and files must be before they move to the archive."
            />
          ) : (
            <ul aria-label="Archive rules" className={LIST}>
              {policies.map((policy) => {
                const e = archiveEntity(policy.entity_type)
                const Icon = e.icon
                const purge = purgeLine(policy)
                return (
                  <li key={policy.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Tile hue={e.hue} size="md">
                        <Icon />
                      </Tile>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Older than {n(policy.retention_days)} days, {policy.auto_archive ? "archived every hour" : "only when you archive them"}
                          {purge ? `. ${purge}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 pl-11 sm:pl-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(ROW_ACTION, "gap-1.5")}
                        onClick={() => dispatch(openUI({ key: "archiveRunJob", data: { entityLabel: e.label, entityType: policy.entity_type } }))}
                      >
                        <PlayCircle />
                        Archive now
                      </Button>
                      <Button variant="ghost" size="sm" className={ROW_ACTION} onClick={() => dispatch(openUI({ key: "archiveEditPolicy", data: policy }))}>
                        Edit
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SettingsSection>

        <SettingsSection
          level={3}
          title="Archive history"
          action={
            <Button variant="ghost" size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => void jobsFetch.mutate()}>
              <RefreshCw />
              Refresh
            </Button>
          }
        >
          {jobsFetch.isLoading && !jobsFetch.data ? (
            <RowsSkeleton label="Loading the archive history" actions={false} />
          ) : jobsFetch.isError && !jobsFetch.data ? (
            <ErrorState compact subject="the archive history" detail={reasonOf(jobsFetch.isError)} onRetry={() => void jobsFetch.mutate()} />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={History}
              hue={ADMIN_GROUP_HUE.workspace}
              title="Nothing archived yet"
              description="Each run is listed here, by a rule's hourly pass or by Archive now, with what it moved and how to put it back."
            />
          ) : (
            <ul aria-label="Archive history" className={LIST}>
              {jobs.slice(0, 20).map((job) => {
                const e = archiveEntity(job.entity_type)
                const Icon = e.icon
                const took = duration(job)
                const meta = [
                  shortDateTime(new Date(job.created_at)),
                  job.items_archived > 0 ? `${n(job.items_archived)} archived` : "",
                ].filter(Boolean)
                return (
                  <li key={job.id} className="flex items-center gap-3 px-4 py-3">
                    <Tile hue={e.hue} size="md">
                      <Icon />
                    </Tile>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">{e.label}</span>
                        <RunStatus status={job.status} />
                      </div>
                      {/* One line of facts, a quiet dot between them, as every
                          row's meta line reads. The failures stay in danger ink. */}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.join(" · ")}
                        {job.items_failed > 0 && (
                          <>
                            {" · "}
                            <span className="text-danger-ink">{n(job.items_failed)} failed</span>
                          </>
                        )}
                        {took && <span className="tabular-nums">{` · took ${took}`}</span>}
                      </p>
                      {job.error_message && <p className="mt-1 break-words text-xs text-danger-ink">{job.error_message}</p>}
                    </div>
                    {job.status === "completed" && !UNSUPPORTED_UNDO.includes(job.entity_type) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Restore what this run archived"
                        title="Restore what this run archived"
                        className="size-11 shrink-0 md:size-8"
                        onClick={() => handleUndoJob(job.id)}
                        disabled={undoingJobId === job.id}
                      >
                        {undoingJobId === job.id ? <RefreshCw className="animate-spin" /> : <Undo2 />}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </SettingsSection>
      </div>
    </SettingsSection>
  )
}

export default ArchiveCard
