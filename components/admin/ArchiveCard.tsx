"use client"

/**
 * The Archive section: how much has been archived, each kind's rule, and the
 * runs so far.
 *
 * Every read says when it failed: a failed read said "No archive policies
 * configured.", a claim about the workspace with nothing to do.
 *
 * Design v3 (admin A13). A kind of thing is a category, not an identity, so
 * it is a 28px mark on --sunken with an ink-3 glyph (§1.5), where each kind
 * had its own hued tile. A rule reads as a sentence with its one number as an
 * inline select that saves the moment it changes ("Archive channel posts
 * older than [365 days], every hour"), the saved tick beside it. A row's other
 * actions (Archive now, Edit rule, Restore a run) live in its ⋯ menu.
 */

import React, { useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsCard, SettingsSection, SETTINGS_STACK } from "@/components/ui/settingsSection"
import { SavedTick, useSaveStatus } from "@/components/ui/saveStatus"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Archive, History, PlayCircle, RefreshCw, RotateCcw, Settings2, Undo2 } from "@/lib/icons"
import { RowMenu } from "@/components/admin/PeopleFrame"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { AdminGet } from "@/services/endpoints/admin"
import { purgeLine } from "@/lib/purgeLine"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { openUI } from "@/store/slice/uiSlice"
import { useMqtt } from "@/components/mqtt/mqttContext"
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

/** The days a rule's sentence offers, with the rule's own number added when it is another. */
export const ARCHIVE_DAYS = [30, 90, 180, 365, 730, 1825]
export function dayChoices(current: number): number[] {
  return ARCHIVE_DAYS.includes(current) || !current ? ARCHIVE_DAYS : [...ARCHIVE_DAYS, current].sort((a, b) => a - b)
}
const daysWord = (d: number) => (d % 365 === 0 ? `${d / 365} ${d === 365 ? "year" : "years"}` : `${d} days`)

/** A kind's mark: 28px on --sunken, its glyph in ink-3. Never a hue. */
function KindMark({ type }: { type: string }) {
  const Icon = archiveEntity(type).icon
  return (
    <span data-archive-mark="" className="archive-mark" aria-hidden="true">
      <Icon />
    </span>
  )
}

/** Loading rows in the card's own shape: a mark, two lines. */
function RowsSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <SettingsCard aria-label={label}>
      <ul role="status" aria-label={label} className="set-rows">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} aria-hidden="true" className="set-row flex items-center gap-3">
            <Skeleton className="size-7 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={i % 2 === 0 ? "h-3.5 w-1/3" : "h-3.5 w-1/4"} />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}

/**
 * One rule as a sentence: "Archive channel posts older than [365 days],
 * every hour." The select saves on change (instant), with the saved tick, and
 * springs back with the reason if the server refuses.
 */
function RuleRow({ policy, onSaved, menu }: { policy: ArchivePolicy; onSaved: () => void; menu: React.ReactNode }) {
  const e = archiveEntity(policy.entity_type)
  const [days, setDays] = useState(policy.retention_days)
  const { status, run } = useSaveStatus()
  const purge = purgeLine(policy)
  const id = `archive-days-${policy.entity_type}`
  const change = async (next: number) => {
    const before = days
    setDays(next)
    const held = await run(() =>
      axiosInstance.put(`${PostEndpointUrl.UpdateArchivePolicy}/${policy.entity_type}`, { retention_days: next, auto_archive: policy.auto_archive }, OWN_ERRORS),
    )
    if (held) onSaved()
    else setDays(before)
  }
  return (
    <li data-archive-rule={policy.entity_type} className="set-row flex items-center gap-3">
      <KindMark type={policy.entity_type} />
      <div className="min-w-0 flex-1">
        <p className="archive-sentence flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <span>
            Archive <span className="font-medium">{e.label.toLowerCase()}</span> older than
          </span>
          <label htmlFor={id} className="sr-only">
            How old {e.label.toLowerCase()} must be before they are archived
          </label>
          <select
            id={id}
            value={days}
            onChange={(ev) => void change(Number(ev.target.value))}
            disabled={status.state === "saving"}
            className="field-surface h-8 rounded-md px-2 text-sm font-semibold tabular-nums"
          >
            {dayChoices(days).map((d) => (
              <option key={d} value={d}>
                {daysWord(d)}
              </option>
            ))}
          </select>
          <span>{policy.auto_archive ? ", every hour." : ", only when you run it."}</span>
          <SavedTick status={status} />
        </p>
        {status.state === "error" && status.error ? (
          <p role="alert" className="mt-1 text-xs text-danger-ink">
            {status.error}
          </p>
        ) : purge ? (
          <p className="mt-1 text-xs text-ink-2">{purge}</p>
        ) : null}
      </div>
      {menu}
    </li>
  )
}

const ArchiveCard = () => {
  const dispatch = useDispatch()
  const policiesFetch = useFetch<{ policies: ArchivePolicy[] }>(AdminGet.GetArchivePolicies)
  const jobsFetch = useFetch<{ jobs: ArchiveJob[] }>(GetEndpointUrl.GetArchiveJobs)
  const statsFetch = useFetch<{ stats: ArchiveStats }>(GetEndpointUrl.GetArchiveStats)
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected
  const { toast } = useToast()
  const [undoingJobId, setUndoingJobId] = useState<string | null>(null)

  // Hard cap on fallback polling: 6 minutes. If MQTT is dead and a job runs
  // longer than this, Refresh is there. Never poll the API for hours.
  const POLL_CAP_MS = 6 * 60 * 1000
  const POLL_INTERVAL_MS = 6000

  const jobs = useMemo(() => jobsFetch.data?.jobs ?? [], [jobsFetch.data])
  const runningJobIds = useMemo(() => jobs.filter((x) => x.status === "running").map((x) => x.id).sort().join(","), [jobs])

  // Job status updates arrive over MQTT, which busts the SWR cache for the
  // jobs list directly; this is the fallback when MQTT is unavailable.
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
      toast({ title: `Restored ${items(Number(res.data?.count ?? 0))}`, description: "They are back where they were.", tone: "success" })
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
    // No title of its own: the page frame names the section.
    <section aria-label="Archive" data-archive="" className={SETTINGS_STACK}>
      <div data-archive-actions="" className="flex items-center justify-between gap-3">
        <p className="max-w-[60ch] text-xs text-ink-2">Archived items are hidden, not deleted, and can be restored, unless a rule deletes files for good.</p>
        <Button variant="secondary" size="sm" className="h-11 shrink-0 md:h-7" onClick={() => dispatch(openUI({ key: "archiveRestore" }))}>
          <RotateCcw aria-hidden="true" />
          Restore items
        </Button>
      </div>

      <SettingsSection title="Archived so far">
        {statsFetch.isLoading && !stats ? (
          <SettingsCard aria-label="Loading the counts">
            <ul role="status" aria-label="Loading the counts" className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 md:grid-cols-3">
              {ARCHIVE_ENTITY_ORDER.map((t) => (
                <li key={t} aria-hidden="true" className="flex items-center gap-3">
                  <Skeleton className="size-7 shrink-0 rounded-lg" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </li>
              ))}
            </ul>
          </SettingsCard>
        ) : statsFetch.isError && !stats ? (
          <ErrorState compact subject="the counts" detail={reasonOf(statsFetch.isError)} onRetry={() => void statsFetch.mutate()} />
        ) : (
          <SettingsCard>
            <ul aria-label="Archived so far" className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 md:grid-cols-3">
              {ARCHIVE_ENTITY_ORDER.map((type) => (
                <li key={type} className="flex items-center gap-3">
                  <KindMark type={type} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums">{n(statOf(type))}</p>
                    <p className="truncate text-xs text-ink-2">{archiveEntity(type).label}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SettingsCard>
        )}
      </SettingsSection>

      <SettingsSection title="Rules" description="When each kind of thing goes to the archive. Changing a number saves it.">
        {policiesFetch.isLoading && !policiesFetch.data ? (
          <RowsSkeleton label="Loading the archive rules" />
        ) : policiesFetch.isError && !policiesFetch.data ? (
          <ErrorState compact subject="the archive rules" detail={reasonOf(policiesFetch.isError)} onRetry={() => void policiesFetch.mutate()} />
        ) : policies.length === 0 ? (
          <SettingsCard>
            <EmptyState
              icon={Archive}
              title="No archive rules on this server"
              description="Rules say how old posts, messages, tasks and files must be before they move to the archive."
            />
          </SettingsCard>
        ) : (
          <SettingsCard>
            <ul aria-label="Archive rules" className="set-rows">
              {policies.map((policy) => {
                const e = archiveEntity(policy.entity_type)
                return (
                  <RuleRow
                    key={policy.id}
                    policy={policy}
                    onSaved={() => void policiesFetch.mutate()}
                    menu={
                      <RowMenu label={`Actions for ${e.label}`}>
                        <DropdownMenuItem onSelect={() => dispatch(openUI({ key: "archiveRunJob", data: { entityLabel: e.label, entityType: policy.entity_type } }))}>
                          <PlayCircle aria-hidden="true" />
                          Archive now…
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => dispatch(openUI({ key: "archiveEditPolicy", data: policy }))}>
                          <Settings2 aria-hidden="true" />
                          Edit the rule…
                        </DropdownMenuItem>
                      </RowMenu>
                    }
                  />
                )
              })}
            </ul>
          </SettingsCard>
        )}
      </SettingsSection>

      <SettingsSection
        title="History"
        action={
          <Button variant="ghost" size="sm" className="h-11 md:h-7" onClick={() => void jobsFetch.mutate()}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        {jobsFetch.isLoading && !jobsFetch.data ? (
          <RowsSkeleton label="Loading the archive history" />
        ) : jobsFetch.isError && !jobsFetch.data ? (
          <ErrorState compact subject="the archive history" detail={reasonOf(jobsFetch.isError)} onRetry={() => void jobsFetch.mutate()} />
        ) : jobs.length === 0 ? (
          <SettingsCard>
            <EmptyState
              icon={History}
              title="Nothing archived yet"
              description="Each run is listed here, by a rule's hourly pass or by Archive now, with what it moved and how to put it back."
            />
          </SettingsCard>
        ) : (
          <SettingsCard>
            <ul aria-label="Archive history" className="set-rows">
              {jobs.slice(0, 20).map((job) => {
                const e = archiveEntity(job.entity_type)
                const took = duration(job)
                const meta = [shortDateTime(new Date(job.created_at)), job.items_archived > 0 ? `${n(job.items_archived)} archived` : ""].filter(Boolean)
                const undoable = job.status === "completed" && !UNSUPPORTED_UNDO.includes(job.entity_type)
                return (
                  <li key={job.id} data-archive-run="" className="set-row flex items-center gap-3">
                    <KindMark type={job.entity_type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">{e.label}</span>
                        <RunStatus status={job.status} />
                      </div>
                      {/* One line of facts, a quiet dot between them. The failures stay in danger ink. */}
                      <p className="mt-0.5 text-xs text-ink-2">
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
                    {undoable &&
                      (undoingJobId === job.id ? (
                        <RefreshCw className="size-4 animate-spin text-ink-3" aria-label="Restoring" />
                      ) : (
                        <RowMenu label={`Actions for the ${e.label.toLowerCase()} run`}>
                          <DropdownMenuItem onSelect={() => void handleUndoJob(job.id)}>
                            <Undo2 aria-hidden="true" />
                            Restore what this run archived
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => dispatch(openUI({ key: "archiveRestore" }))}>
                            <RotateCcw aria-hidden="true" />
                            Restore single items…
                          </DropdownMenuItem>
                        </RowMenu>
                      ))}
                  </li>
                )
              })}
            </ul>
          </SettingsCard>
        )}
      </SettingsSection>
    </section>
  )
}

export default ArchiveCard
