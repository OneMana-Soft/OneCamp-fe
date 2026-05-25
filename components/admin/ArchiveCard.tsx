"use client"

import React, { useRef, useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, FileText, MessageSquare, ListTodo, Video, Paperclip, FileCode, RotateCcw, Undo2 } from "@/lib/icons";
import { Archive, PlayCircle, Database } from "lucide-react";
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import axiosInstance from "@/lib/axiosInstance"

interface ArchivePolicy {
  id: string; entity_type: string; retention_days: number; auto_archive: boolean
  archive_completed_tasks: boolean; archive_inactive_channels_days: number; compress_attachments: boolean
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

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  posts: <MessageSquare className="h-4 w-4" />, chats: <FileText className="h-4 w-4" />, tasks: <ListTodo className="h-4 w-4" />,
  recordings: <Video className="h-4 w-4" />, attachments: <Paperclip className="h-4 w-4" />, docs: <FileCode className="h-4 w-4" />,
}

const ENTITY_LABELS: Record<string, string> = {
  posts: "Channel Posts", chats: "Direct Messages", tasks: "Tasks",
  recordings: "Recordings", attachments: "Attachments", docs: "Documents",
}

const UNSUPPORTED: string[] = []
// Entity types that do not support job-level undo.
const UNSUPPORTED_UNDO: string[] = ["docs", "recordings"]

const STATUS_STYLES: Record<string, { icon: React.ReactNode; color: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20" },
  running: { icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  cancelled: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20" },
}

const ArchiveCard = () => {
  const dispatch = useDispatch()
  const { data: policyData, isLoading: policiesLoading, mutate: mutatePolicies } = useFetch<{ policies: ArchivePolicy[] }>(GetEndpointUrl.GetArchivePolicies)
  const { data: jobData, isLoading: jobsLoading, mutate: mutateJobs } = useFetch<{ jobs: ArchiveJob[] }>(GetEndpointUrl.GetArchiveJobs)
  const { data: statsData } = useFetch<{ stats: ArchiveStats }>(GetEndpointUrl.GetArchiveStats)
  const { connectionState: mqttState } = useMqtt()
  const isMqttHealthy = mqttState.isConnected
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  // Wall-clock anchor for the current fallback polling session. Survives
  // effect re-runs so we can enforce a real time-based cap. The session key
  // is the comma-joined sorted list of running job IDs — when it changes
  // (a new job starts or an existing one finishes), we reset the timer.
  const pollSessionRef = useRef<{ key: string; startedAt: number } | null>(null)
  const { toast } = useToast()
  const [undoingJobId, setUndoingJobId] = useState<string | null>(null)

  // Hard cap on fallback polling: 6 minutes. If MQTT is dead and a job
  // genuinely runs longer than this, the user can hit the manual Refresh
  // button. Never let a runaway interval poll the API for hours.
  const POLL_CAP_MS = 6 * 60 * 1000
  const POLL_INTERVAL_MS = 6000

  // Job status updates arrive via MQTT (`MqttMessageType.Archive_Job_Status`),
  // which busts the SWR cache for `/admin/archive/jobs` directly. Polling
  // is a fallback when MQTT is unavailable (dev without broker, transient
  // disconnect, non-admin user). We poll every 6 seconds while a job runs,
  // capped at 6 minutes of elapsed real time (not attempts) to survive
  // SWR-driven effect re-runs.
  useEffect(() => {
    const currentJobs = jobData?.jobs || []
    const runningIds = currentJobs
      .filter(j => j.status === "running")
      .map(j => j.id)
      .sort()
    const sessionKey = runningIds.join(",")

    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    // No fallback polling needed when MQTT is healthy or no jobs are running.
    if (isMqttHealthy || runningIds.length === 0) {
      pollSessionRef.current = null
      return
    }

    // Establish or continue the polling session.
    if (pollSessionRef.current?.key !== sessionKey) {
      pollSessionRef.current = { key: sessionKey, startedAt: Date.now() }
    }

    pollRef.current = setInterval(() => {
      if (document.visibilityState === "hidden") return

      const session = pollSessionRef.current
      if (!session) return

      // Wall-clock cap: stop polling after POLL_CAP_MS regardless of how
      // many SWR-triggered effect re-runs happened in between.
      if (Date.now() - session.startedAt > POLL_CAP_MS) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        return
      }
      mutateJobs()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [jobData, mutateJobs, isMqttHealthy])

  const getStatValue = (entityType: string): number => {
    if (!statsData?.stats) return 0
    return (statsData.stats as any)[`total_archived_${entityType}`] || 0
  }

  const formatDuration = (job: ArchiveJob): string => {
    if (!job.completed_at || !job.started_at) return "—"
    const ms = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
    return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`
  }

  const handleUndoJob = async (jobId: string) => {
    setUndoingJobId(jobId)
    try {
      const res = await axiosInstance.post(`${PostEndpointUrl.UndoArchiveJob}/${jobId}`)
      toast({ title: "Archived items restored", description: `${res.data?.count || 0} item(s) restored successfully` })
      mutateJobs()
      mutatePolicies()
    } catch (err: any) {
      const msg = err?.response?.status === 429 ? "Rate limit exceeded — try again later" : "Failed to undo archive job"
      toast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setUndoingJobId(null)
    }
  }

  const isUnsupported = (t: string) => UNSUPPORTED.includes(t)

  const policies = policyData?.policies || []
  const jobs = jobData?.jobs || []

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-primary/10 p-1.5 rounded-md"><Archive className="h-4 w-4 text-primary" /></div>
              <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">Data Archiving</CardTitle>
            </div>
            <CardDescription className="text-sm text-muted-foreground">Configure retention policies and manage data archiving across all OneCamp data stores.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0 self-start" onClick={() => dispatch(openUI({ key: "archiveRestore" }))}>
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restore Items</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 overflow-y-auto pr-4 custom-scrollbar pb-10 min-h-0">
        <div className="space-y-8">
          {statsData?.stats && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />Archive Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(ENTITY_LABELS).map(([type, label]) => (
                  <div key={type} className={`border border-border/50 rounded-lg bg-card/50 p-3 flex items-center gap-3 ${isUnsupported(type) ? "opacity-50" : ""}`}>
                    <div className="bg-muted/50 p-2 rounded-lg">{ENTITY_ICONS[type]}</div>
                    <div>
                      <p className="text-lg font-bold">{getStatValue(type).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {isUnsupported(type) && <Badge variant="outline" className="text-[9px] mt-0.5 text-muted-foreground">Manual only</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Retention Policies</h3>
            {policiesLoading ? <div className="text-sm text-muted-foreground animate-pulse">Loading policies...</div> :
            policies.length === 0 ? <div className="text-center py-8 text-sm text-muted-foreground">No archive policies configured.</div> :
            <div className="space-y-3">
              {policies.map(policy => (
                <div key={policy.id} className={`border border-border/50 rounded-lg bg-card/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${isUnsupported(policy.entity_type) ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-muted/50 p-2 rounded-lg shrink-0">{ENTITY_ICONS[policy.entity_type] || <Database className="h-4 w-4" />}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{ENTITY_LABELS[policy.entity_type] || policy.entity_type}</h4>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Retain for <span className="font-semibold text-foreground">{policy.retention_days}</span> days</span>
                        {policy.auto_archive ? <Badge className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />Auto</Badge> : <Badge variant="outline" className="text-[10px]">Manual only</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" disabled={isUnsupported(policy.entity_type)}
                      onClick={() => dispatch(openUI({ key: "archiveRunJob", data: { entityLabel: ENTITY_LABELS[policy.entity_type] || policy.entity_type, entityType: policy.entity_type } }))}>
                      <PlayCircle className="h-3 w-3" />Run Now
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => dispatch(openUI({ key: "archiveEditPolicy", data: policy }))}>Edit</Button>
                  </div>
                </div>
              ))}
            </div>}
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Job History</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => mutateJobs()}><RefreshCw className="h-3 w-3" />Refresh</Button>
            </div>
            {jobsLoading ? <div className="text-sm text-muted-foreground animate-pulse">Loading jobs...</div> :
            jobs.length === 0 ? <div className="text-center py-8 text-sm text-muted-foreground">No archive jobs have been run yet.</div> :
            <div className="space-y-2">
              {jobs.slice(0, 20).map(job => {
                const s = STATUS_STYLES[job.status] || STATUS_STYLES.pending
                return (
                  <div key={job.id} className="border border-border/50 rounded-lg bg-card/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="bg-muted/50 p-1.5 rounded-md shrink-0">{ENTITY_ICONS[job.entity_type] || <Database className="h-3.5 w-3.5" />}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium capitalize">{ENTITY_LABELS[job.entity_type] || job.entity_type}</span><Badge className={`text-[10px] gap-1 ${s.color}`}>{s.icon}{job.status}</Badge></div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span>{new Date(job.created_at).toLocaleString()}</span>
                          {job.items_processed > 0 && <span>{job.items_processed} processed</span>}
                          {job.items_archived > 0 && <span className="text-green-600 dark:text-green-400">{job.items_archived} archived</span>}
                          {job.items_failed > 0 && <span className="text-red-500">{job.items_failed} failed</span>}
                        </div>
                        {job.error_message && <p className="text-xs text-red-500 mt-1 break-words">{job.error_message}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">{formatDuration(job)}</span>
                      {job.status === "completed" && !UNSUPPORTED_UNDO.includes(job.entity_type) && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7" title="Undo this archive"
                          onClick={() => handleUndoJob(job.id)}
                          disabled={undoingJobId === job.id}
                        >
                          {undoingJobId === job.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ArchiveCard
