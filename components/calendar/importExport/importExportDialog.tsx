"use client"

/**
 * Moving a calendar in and out (calendar A4): import a calendar file, or the
 * zip Google Calendar exports, as a job (the shared useImportJobs and
 * importFiles, as docs import); export every event you're on as one .ics.
 * Every calendar in the file comes across with its repeating events and
 * their changes, guests and their answers, reminders, zones and call links,
 * and nobody is invited or told. Once done it says how many came in, into
 * which calendars, and what it left out, and Show them opens the week of
 * the next event that came. The shared dialog, which is a sheet on a phone
 * (the one overlay layout: its body the one scroller, its actions in the
 * footer); a chunk of its own, opened from the Calendars panel or a phone's
 * calendar options.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { ImportDropZone } from "@/components/common/importDropZone"
import { ImportRowFrame } from "@/components/common/importFiles"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ChevronRight, Download } from "@/lib/icons"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { calendarExportUrl } from "@/lib/calendar/eventsApi"
import { useCalendarList } from "@/lib/calendar/calendarList"
import { calendarHue, useCalendarChoices } from "@/lib/calendar/otherCalendars"
import { ContentIOCapabilities, loadCapabilities, startImport, type ContentIOJob } from "@/lib/export/contentIO"
import { extensionOf, megabytes, useImportJobs, type ImportRow } from "@/lib/export/useImportJobs"
import { downloadBlob } from "@/lib/utils/download"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { dayDate } from "@/lib/utils/timeZone"

const CALENDAR_FILES = [".ics", ".zip"]

/** How many of what an import left out are listed; the rest are counted. */
const SKIPS_SHOWN = 50

/** A calendar import's job: how many came in, into which calendars, and what to show first. */
type CalendarJob = ContentIOJob & {
  made?: number
  into?: { uuid: string; kind?: string; title: string; count: number }[]
  show?: { uuid: string; title: string; at?: string }
}

export default function ImportExportDialog({
  onClose,
  onImported,
  onShow,
}: {
  onClose(): void
  onImported?: () => void
  /** Show them: the calendar goes to this day, with these calendars shown. */
  onShow?: (day: Date, calendars: string[]) => void
}) {
  const [caps, setCaps] = React.useState<ContentIOCapabilities | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState("")

  React.useEffect(() => {
    let live = true
    void loadCapabilities().then((c) => live && setCaps(c))
    return () => {
      live = false
    }
  }, [])

  const jobs = useImportJobs({
    check: (file) => {
      if (!CALENDAR_FILES.includes(extensionOf(file.name))) return "Choose a calendar file (.ics), or the zip Google Calendar exports."
      if (caps && file.size > caps.max_import_bytes) return `Larger than the ${megabytes(caps.max_import_bytes)} an import takes.`
      return undefined
    },
    start: (file) => startImport(file, "", caps, "calendar"),
  })

  // Once an import has made events, the calendar shows them.
  const done = jobs.rows.map((r) => r.job as CalendarJob | undefined).filter((j): j is CalendarJob => j?.status === "done")
  const made = done.reduce((n, j) => n + (j.made ?? j.created?.length ?? 0), 0)
  React.useEffect(() => {
    if (made > 0) onImported?.()
  }, [made, onImported])
  const show = done.find((j) => j.show?.at)?.show

  const exportAll = async () => {
    setExporting(true)
    setExportError("")
    try {
      const res = await axiosInstance.get(calendarExportUrl, { ...OWN_ERRORS, responseType: "text" })
      downloadBlob(res.data as string, "text/calendar;charset=utf-8", "OneCamp calendar.ics")
    } catch (err) {
      setExportError(apiErrorMessage(err, "Your calendar couldn't be exported. Try again."))
    } finally {
      setExporting(false)
    }
  }

  // Once every import is over, Show them is the one primary; Close steps back.
  // A date ("2026-11-05") is that day here; an instant, its moment.
  const day = jobs.allOver && show?.at ? (dayDate(show.at) ?? new Date(show.at)) : null
  const showThem =
    day && onShow
      ? () => {
          onClose()
          onShow(day, done.flatMap((j) => (j.into ?? []).map((c) => c.uuid)))
        }
      : null
  const footer = (
    <>
      <Button type="button" variant={showThem ? "secondary" : "ghost"} onClick={onClose}>
        {jobs.allOver ? "Close" : "Cancel"}
      </Button>
      {!jobs.allOver ? (
        <Button type="button" onClick={jobs.run} disabled={!jobs.ready} busy={jobs.busy}>
          {jobs.busy ? "Importing…" : "Import"}
        </Button>
      ) : showThem ? (
        <Button type="button" onClick={showThem}>
          Show them
        </Button>
      ) : null}
    </>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-calendar-import-export="">
        <DialogHeader>
          <DialogTitle>Import and export</DialogTitle>
          <DialogDescription>
            Bring in a calendar file, or the zip Google Calendar exports: every calendar in it comes across with its
            repeating events, guests and their answers, reminders and call links. Nobody is invited or told.
          </DialogDescription>
        </DialogHeader>
        <OverlayBody className="grid gap-3">
          <ImportDropZone accept={CALENDAR_FILES} onFiles={jobs.add} label="Choose a file" />
          <p className="text-meta text-ink-3">In Google Calendar: Settings, then Import and export, then Export.</p>

          {jobs.rows.length > 0 && (
            <ul className="space-y-2" aria-label="Files to import">
              {jobs.rows.map((r) => (
                <ImportRowFrame key={r.key} row={r} onRemove={() => jobs.remove(r.key)}>
                  <EventsMade row={r} />
                </ImportRowFrame>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3" data-calendar-export="">
            <div className="grid gap-0.5">
              <span className="text-ui-sm font-medium text-ink">Export</span>
              <span className="text-meta text-ink-3">Every event you&apos;re on, as one .ics any calendar app imports.</span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={exportAll} busy={exporting}>
              <Download aria-hidden="true" />
              {exporting ? "Exporting…" : "Download .ics"}
            </Button>
            {exportError ? (
              <p role="alert" className="w-full text-meta text-danger-ink">
                {exportError}
              </p>
            ) : null}
          </div>
        </OverlayBody>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A reason as a list reads it after a dot: "only events come across, not to-dos". Pure. */
const asClause = (why: string) => why.replace(/\.$/, "").replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLowerCase())

/**
 * What a finished import brought in, in short lines: how many came in and
 * how many were here already; each calendar they went into, with its
 * colour and its count; and, folded away, what it left out, one row each.
 */
export function EventsMade({ row }: { row: ImportRow }) {
  // Each calendar in the colour the Calendars panel and the week draw it.
  const calendars = useCalendarList()
  const { hues } = useCalendarChoices()
  const job = row.job as CalendarJob | undefined
  if (job?.status !== "done") return null
  const n = job.made ?? job.created?.length ?? 0
  const there = job.unchanged ?? 0
  const skipped = job.skipped ?? []
  const head = [
    n ? `${n} ${n === 1 ? "event" : "events"} came in` : "Nothing new came in",
    there ? `${there} ${there === 1 ? "was" : "were"} already here` : "",
  ].filter(Boolean).join(" · ")
  return (
    <div className="mt-1.5 grid gap-1.5" data-events-made="">
      <p className="text-meta text-ink-2">{head}</p>
      {job.into?.length ? (
        <ul className="grid gap-1" aria-label="Calendars they came into">
          {job.into.map((c) => (
            <li key={c.uuid} className="flex items-center gap-2 text-ui-sm" data-into={c.uuid}>
              <span aria-hidden="true" className={cn(HUE_CLASS[calendarHue(calendars.find((v) => v.id === c.uuid) ?? { id: c.uuid, kind: c.kind, mine: true }, hues)], "size-2 shrink-0 rounded-full bg-hue")} />
              <span className="min-w-0 truncate text-ink">{c.title}</span>
              <span className="shrink-0 tabular-nums text-ink-3">· {c.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {skipped.length > 0 && (
        <details className="group" data-left-out="">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-meta text-ink-3 outline-none hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
            Left out ({skipped.length})
          </summary>
          <ul className="mt-1 grid gap-0.5 pl-[18px]">
            {skipped.slice(0, SKIPS_SHOWN).map((s, i) => (
              <li key={i} className="text-meta text-ink-3">
                <span className="text-ink-2">{s.what}</span> · {asClause(s.why)}
              </li>
            ))}
            {skipped.length > SKIPS_SHOWN ? <li className="text-meta text-ink-3">and {skipped.length - SKIPS_SHOWN} more</li> : null}
          </ul>
        </details>
      )}
    </div>
  )
}
