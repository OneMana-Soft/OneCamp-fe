"use client"

/**
 * The files of an import and the job each became (business/ContentIO), for
 * every import dialog: docs (ImportDocDialog) and calendars
 * (importCalendarDialog). A file is checked when it is added, started when
 * the person says so, and followed (useJobFollow) until its job is at rest.
 * A spreadsheet's import (ImportSheetDialog) follows its one job the same way.
 */

import * as React from "react"
import { CONTENT_IO_JOB_EVENT, getJob, jobIsAtRest, type ContentIOJob } from "@/lib/export/contentIO"
import { useStableCallback } from "@/hooks/useStableCallback"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"

const POLL_MS = 1500

/**
 * Follows the jobs ids names: each one's news over MQTT (the message handler
 * re-sends it as a window event), and a read every POLL_MS for a missed
 * message. A job that's gone, or no longer the reader's (403, 404), never
 * answers again: onGone says so, and the caller stops naming it. Any other
 * failed read, the next poll asks again. The callbacks may change on every
 * render without restarting the poll.
 */
export function useJobFollow(ids: string[], onNews: (job: ContentIOJob) => void, onGone: (id: string) => void) {
  const news = useStableCallback(onNews)
  const gone = useStableCallback(onGone)
  const named = ids.join(",")
  React.useEffect(() => {
    if (!named) return
    const followed = new Set(named.split(","))
    const onJob = (e: Event) => {
      const job = (e as CustomEvent<ContentIOJob>).detail
      if (job?.id && followed.has(job.id)) news(job)
    }
    window.addEventListener(CONTENT_IO_JOB_EVENT, onJob)
    const timer = window.setInterval(() => {
      for (const id of followed) {
        getJob(id)
          .then(news)
          .catch((err) => {
            const status = apiErrorStatus(err)
            if (status === 403 || status === 404) gone(id)
          })
      }
    }, POLL_MS)
    return () => {
      window.removeEventListener(CONTENT_IO_JOB_EVENT, onJob)
      window.clearInterval(timer)
    }
  }, [named, news, gone])
}

export interface ImportRow {
  key: string
  file: File
  job?: ContentIOJob
  error?: string
}

export const extensionOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i < 0 ? "" : name.slice(i).toLowerCase()
}

export const megabytes = (n: number) => `${Math.round(n / (1 << 20))} MB`

export function useImportJobs({ check, start }: {
  /** Why a file can't be imported, or undefined when it can. */
  check: (file: File) => string | undefined
  /** Starts a file's import. */
  start: (file: File) => Promise<ContentIOJob>
}) {
  const [rows, setRows] = React.useState<ImportRow[]>([])
  const [started, setStarted] = React.useState(false)
  // A press while files are starting starts nothing more: each file once.
  const [starting, setStarting] = React.useState(false)
  const inFlight = React.useRef(false)

  const update = React.useCallback((key: string, patch: Partial<ImportRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  const following = (r: ImportRow) => !!r.job && !r.error && !jobIsAtRest(r.job)
  useJobFollow(
    rows.filter(following).map((r) => r.job!.id),
    (job) => setRows((rs) => rs.map((r) => (r.job?.id === job.id ? { ...r, job } : r))),
    (id) => setRows((rs) => rs.map((r) => (r.job?.id === id ? { ...r, error: "This import can't be followed any more." } : r))),
  )

  const add = (files: FileList | File[] | null) => {
    if (!files) return
    const next = Array.from(files).map((file) => ({
      key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`,
      file,
      error: check(file),
    }))
    setRows((rs) => [...rs.filter((r) => r.job), ...rs.filter((r) => !r.job), ...next])
  }

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key || !!r.job))

  const run = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setStarting(true)
    setStarted(true)
    try {
      for (const row of rows) {
        if (row.job || row.error) continue
        try {
          update(row.key, { job: await start(row.file) })
        } catch (err) {
          update(row.key, { error: apiErrorMessage(err, "The file couldn't be imported. Try again.") })
        }
      }
    } finally {
      inFlight.current = false
      setStarting(false)
    }
  }

  const ready = rows.some((r) => !r.job && !r.error)
  // Busy from the press: Import says "Importing…" while its files start.
  const busy = starting || rows.some(following)
  return { rows, add, remove, run, started, ready, busy, allOver: started && rows.length > 0 && !ready && !busy }
}
