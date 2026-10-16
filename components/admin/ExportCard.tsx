"use client"

/**
 * ExportCard: an admin exports the workspace's docs (docs programme C4) as a
 * zip of Markdown, in folders that follow the page tree, which an import reads
 * back as the same tree. It holds every doc the admin can open, and the
 * private docs whose owners let them in (each owner decides in the doc's More
 * menu); the rest are left out, and the export says how many. Starting one is
 * recorded in the audit log, and the zip is kept for a day.
 *
 * The rows are the import card's (design v3, admin §A14): a mark, a name with
 * where it stands as a dot and a word, a tabular meta line, and on the right
 * the bar while it runs or Download once it is made. Progress arrives as the
 * Content IO job message; while live updates are off the list is polled.
 */

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { SourceMark, StateWord, type StateTone } from "@/components/admin/connectParts"
import { ImportProgressBar } from "@/components/admin/importParts"
import { IMPORT_LIST, ImportRowsSkeleton, ROW_ACTION } from "@/components/admin/ImportJobRow"
import { useFetch } from "@/hooks/useFetch"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useToast } from "@/hooks/use-toast"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { patchCached } from "@/lib/swrMutate"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { CONTENT_IO_JOB_EVENT } from "@/lib/export/contentIO"
import { Download, FileArchive, Loader2 } from "@/lib/icons"
import {
  WORKSPACE_EXPORT_ROUTES,
  downloadAddress,
  exportIsRunning,
  exportMeta,
  leftOut,
  startWorkspaceExport,
  type WorkspaceExport,
} from "@/lib/workspaceExport/workspaceExport"

/** Where an export stands, as a word and a tone; waiting and running pulse. */
const EXPORT_STATE: Record<string, { label: string; tone: StateTone; pulse?: boolean }> = {
  queued: { label: "Waiting", tone: "neutral", pulse: true },
  running: { label: "Exporting", tone: "warning", pulse: true },
  done: { label: "Ready", tone: "success" },
  gone: { label: "No longer kept", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
}

/** Whether a made export's zip is still kept, as the server says. Pure apart from the clock. */
export function downloadable(e: WorkspaceExport, now: number = Date.now()): boolean {
  return e.status === "done" && !!e.kept_until && now < Date.parse(e.kept_until)
}

type ExportList = { exports: WorkspaceExport[] }

export default function ExportCard() {
  const { toast } = useToast()
  const { connectionState } = useMqtt()
  const list = useFetch<ExportList>(WORKSPACE_EXPORT_ROUTES.list, undefined, undefined, OWN_ERRORS)
  const { data, isLoading, mutate } = list
  const exports = data?.exports ?? []
  const running = exports.some(exportIsRunning)
  const [starting, setStarting] = useState(false)
  const [problem, setProblem] = useState("")

  // Each job's changes, as they happen.
  useEffect(() => {
    const onJob = (event: Event) => {
      const job = (event as CustomEvent<WorkspaceExport>).detail
      if (!job?.id || job.kind !== "export") return
      patchCached<ExportList>(WORKSPACE_EXPORT_ROUTES.list, (cur) =>
        cur.exports.some((e) => e.id === job.id) ? { exports: cur.exports.map((e) => (e.id === job.id ? { ...e, ...job } : e)) } : cur,
      )
    }
    window.addEventListener(CONTENT_IO_JOB_EVENT, onJob)
    return () => window.removeEventListener(CONTENT_IO_JOB_EVENT, onJob)
  }, [])

  useResilientPolling({ enabled: running, mqttHealthy: connectionState.isConnected, interval: 4000, onPoll: mutate })

  const start = async () => {
    setProblem("")
    setStarting(true)
    try {
      await startWorkspaceExport()
      await mutate()
    } catch (err) {
      setProblem(apiErrorMessage(err, "The export couldn't be started. Try again in a moment."))
    } finally {
      setStarting(false)
    }
  }

  const download = async (e: WorkspaceExport) => {
    try {
      const url = await downloadAddress(e.id)
      if (url) window.location.assign(url)
      else toast({ title: "This export is no longer kept", description: "An export is kept for a day after it's made. Export again for a new one." })
    } catch (err) {
      toast({ title: "Couldn't download the export", description: apiErrorMessage(err, "Check your connection and try again."), variant: "destructive" })
    }
  }

  return (
    <SettingsSection
      title="Export the workspace's docs"
      description="Every doc you can open, and the private docs whose owners let them in, as Markdown files in folders that follow the page tree. Owners decide in each doc's More menu. Starting an export and downloading it are recorded in the audit log, and the zip is kept for a day."
      action={
        <Button variant="outline" className={sectionActionClass} onClick={start} disabled={starting || running}>
          {starting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileArchive aria-hidden="true" />}
          {running ? "Exporting…" : "Export all docs"}
        </Button>
      }
    >
      {problem && (
        <p role="alert" className="mb-3 text-sm text-danger-ink">
          {problem}
        </p>
      )}
      {isLoading && !data ? (
        <ImportRowsSkeleton label="Loading the exports" rows={1} />
      ) : list.isError && !data ? (
        <ErrorState
          compact
          subject="the exports"
          detail={apiErrorStatus(list.isError) ? apiErrorMessage(list.isError) : undefined}
          onRetry={() => void mutate()}
        />
      ) : exports.length === 0 ? (
        <EmptyState
          icon={FileArchive}
          title="No exports yet"
          description="An export is a zip you can keep, or import into another workspace with its tree."
        />
      ) : (
        <ul aria-label="Recent exports" className={IMPORT_LIST}>
          {exports.map((e) => (
            <ExportRow key={e.id} item={e} onDownload={() => void download(e)} />
          ))}
        </ul>
      )}
    </SettingsSection>
  )
}

function ExportRow({ item: e, onDownload }: { item: WorkspaceExport; onDownload: () => void }) {
  const kept = downloadable(e)
  const state = EXPORT_STATE[e.status === "done" && !kept ? "gone" : e.status] ?? EXPORT_STATE.queued
  const meta = exportMeta(e)
  const below = [...leftOut(e)]
  return (
    <li data-export-job={e.status} className="cx-imp-job">
      <SourceMark name="Docs" glyph={FileArchive} size={28} />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">Workspace docs</span>
          <StateWord tone={state.tone} pulse={state.pulse}>
            {state.label}
          </StateWord>
        </div>
        <p className="cx-imp-meta mt-0.5 flex min-w-0 flex-wrap gap-x-1">
          {meta.map((m, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-3">
                  ·
                </span>
              )}
              <span>{m}</span>
            </React.Fragment>
          ))}
        </p>
      </div>
      <div className="cx-imp-job-side">
        {exportIsRunning(e) && <ImportProgressBar pct={e.progress} running={e.status === "running"} />}
        {kept && (
          <Button size="sm" variant="secondary" className={ROW_ACTION} onClick={onDownload}>
            <Download aria-hidden="true" /> Download
          </Button>
        )}
      </div>
      {(e.error || below.length > 0) && (
        <div className="cx-imp-job-below space-y-1">
          {e.error && <p className="break-words text-xs text-danger-ink">{e.error}</p>}
          {below.map((line) => (
            <p key={line} className="break-words text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
    </li>
  )
}
