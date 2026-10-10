"use client"

/**
 * The Archive section: how much has been archived, each kind's rule, and the
 * runs so far.
 *
 * Every read says when it failed: a failed read said "No archive policies
 * configured." or "No archive jobs have been run yet.", claims about the
 * workspace with nothing to do. Each kind has its own hued tile (one map,
 * archiveEntities), the same in the counts, its rule and its history, where
 * the icons sat in grey chips. Runs say where they stand in the status tokens,
 * as words with no icon: they were raw blue and grey, with a spinning icon
 * while running. Rules and runs are hairline rows in one list each, and the
 * card no longer scrolls inside itself.
 */

import React, { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Tile } from "@/components/ui/graphics/Tile"
import { RefreshCw, RotateCcw, Undo2 } from "@/lib/icons"
import { PlayCircle } from "lucide-react"
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

const TONE = {
  info: "border-info/20 bg-info/10 text-info-ink",
  success: "border-success/20 bg-success/10 text-success-ink",
  warning: "border-warning/20 bg-warning/10 text-warning-ink",
  danger: "border-destructive/20 bg-destructive/10 text-danger-ink",
  neutral: "border-border bg-muted text-muted-foreground",
} as const

const STATUS: Record<string, { label: string; tone: keyof typeof TONE }> = {
  pending: { label: "Waiting", tone: "warning" },
  running: { label: "Archiving", tone: "info" },
  completed: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.pending
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-sm border px-1.5 text-2xs font-medium", TONE[s.tone])}>{s.label}</span>
}

const n = (v: number) => v.toLocaleString("en")
const items = (v: number) => `${n(v)} ${v === 1 ? "item" : "items"}`

/** How long a finished run took: "108ms", "2s"; nothing for one still going. */
function duration(job: ArchiveJob): string {
  if (!job.completed_at || !job.started_at) return ""
  const ms = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`
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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">Archive</CardTitle>
            <CardDescription className="mt-1 text-sm text-muted-foreground">
              Old posts, messages, tasks and files move to the archive by these rules. Archived items are hidden, not
              deleted, and can be restored, unless a rule deletes files for good.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 self-start" onClick={() => dispatch(openUI({ key: "archiveRestore" }))}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restore items
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        <section aria-labelledby="archive-counts" className="space-y-3">
          <h3 id="archive-counts" className="text-sm font-medium">Archived so far</h3>
          {statsFetch.isLoading && !stats ? (
            <div role="status" aria-label="Loading the counts" className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {ARCHIVE_ENTITY_ORDER.map((t) => (
                <Skeleton key={t} className="h-12" />
              ))}
            </div>
          ) : statsFetch.isError && !stats ? (
            <ErrorState subject="the counts" onRetry={() => void statsFetch.mutate()} />
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
        </section>

        <section aria-labelledby="archive-rules" className="space-y-3">
          <h3 id="archive-rules" className="text-sm font-medium">Archive rules</h3>
          {policiesFetch.isLoading && !policiesFetch.data ? (
            <div role="status" aria-label="Loading the archive rules" className="rounded-lg border border-border px-3 py-1">
              <SkeletonRows rows={3} avatar={false} />
            </div>
          ) : policiesFetch.isError && !policiesFetch.data ? (
            <ErrorState subject="the archive rules" onRetry={() => void policiesFetch.mutate()} />
          ) : policies.length === 0 ? (
            <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">No archive rules are set up on this server.</p>
          ) : (
            <ul aria-label="Archive rules" className="divide-y divide-border rounded-lg border border-border">
              {policies.map((policy) => {
                const e = archiveEntity(policy.entity_type)
                const Icon = e.icon
                const purge = purgeLine(policy)
                return (
                  <li key={policy.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Tile hue={e.hue} size="sm">
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
                    <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => dispatch(openUI({ key: "archiveRunJob", data: { entityLabel: e.label, entityType: policy.entity_type } }))}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Archive now
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => dispatch(openUI({ key: "archiveEditPolicy", data: policy }))}>
                        Edit
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="archive-history" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="archive-history" className="text-sm font-medium">Archive history</h3>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => void jobsFetch.mutate()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
          {jobsFetch.isLoading && !jobsFetch.data ? (
            <div role="status" aria-label="Loading the archive history" className="rounded-lg border border-border px-3 py-1">
              <SkeletonRows rows={3} avatar={false} />
            </div>
          ) : jobsFetch.isError && !jobsFetch.data ? (
            <ErrorState subject="the archive history" onRetry={() => void jobsFetch.mutate()} />
          ) : jobs.length === 0 ? (
            <p className="rounded-lg border border-border px-3 py-6 text-center text-sm text-muted-foreground">Nothing has been archived yet.</p>
          ) : (
            <ul aria-label="Archive history" className="divide-y divide-border rounded-lg border border-border">
              {jobs.slice(0, 20).map((job) => {
                const e = archiveEntity(job.entity_type)
                const Icon = e.icon
                const took = duration(job)
                return (
                  <li key={job.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Tile hue={e.hue} size="sm">
                        <Icon />
                      </Tile>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{e.label}</span>
                          <StatusChip status={job.status} />
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{shortDateTime(new Date(job.created_at))}</span>
                          {job.items_archived > 0 && <span>{n(job.items_archived)} archived</span>}
                          {job.items_failed > 0 && <span className="text-danger-ink">{n(job.items_failed)} failed</span>}
                          {took && <span className="font-mono">{took}</span>}
                        </p>
                        {job.error_message && <p className="mt-1 break-words text-xs text-danger-ink">{job.error_message}</p>}
                      </div>
                    </div>
                    {job.status === "completed" && !UNSUPPORTED_UNDO.includes(job.entity_type) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Restore what this run archived"
                        title="Restore what this run archived"
                        className="h-8 w-8 shrink-0 self-start sm:self-auto"
                        onClick={() => handleUndoJob(job.id)}
                        disabled={undoingJobId === job.id}
                      >
                        {undoingJobId === job.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

export default ArchiveCard
