"use client"

// A project's time: how much was logged over a range, by person and by task,
// billable and not, and every entry as a CSV file for an invoice. Any member
// of the project can read it; its admins also set the project's rates and see
// what the billable time comes to.

import * as React from "react"
import axiosInstance from "@/lib/axiosInstance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { serverMessage } from "@/lib/http/serverMessage"
import { Download, FileText, Loader2 } from "@/lib/icons"
import { ProjectRatesDialog } from "@/components/project/ProjectRatesDialog"
import { ProjectInvoices } from "@/components/project/ProjectInvoices"
import { formatCents } from "@/lib/rates"
import { REPORT_PRESETS, formatDuration, formatHours, presetRange, type ReportPreset, type TimeLine, type TimeReport } from "@/lib/tasks/time"
import { GetEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"

export function ProjectTimeDialog({
  projectId,
  projectName,
  isAdmin = false,
  open,
  onOpenChange,
}: {
  projectId: string
  projectName?: string
  isAdmin?: boolean
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { toast } = useToast()
  const [ratesOpen, setRatesOpen] = React.useState(false)
  const [preset, setPreset] = React.useState<ReportPreset>("this-month")
  const [downloading, setDownloading] = React.useState(false)
  // The range is fixed when the preset is picked, so a report open across
  // midnight doesn't refetch every render.
  const range = React.useMemo(() => presetRange(preset, new Date()), [preset])
  const query = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
  const base = `${GetEndpointUrl.ProjectTime}/${projectId}/time`
  const { data, isLoading, isError: error, mutate } = useFetch<{ data: TimeReport }>(open ? `${base}?${query}` : "")
  const report = data?.data
  // Money, when the project has rates and the reader is one of its admins.
  const priced = report?.currency && report.amount_cents !== undefined ? (cents: number) => formatCents(cents, report.currency!) : undefined

  const download = async () => {
    setDownloading(true)
    try {
      const tz = browserTZ()
      const res = await axiosInstance.get(`${base}?${query}&format=csv&tz=${encodeURIComponent(tz)}`, { responseType: "blob" })
      const name = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1] ?? "time.csv"
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      toast({ title: "Couldn't download the report", description: serverMessage(e), variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Time{projectName ? ` on ${projectName}` : ""}</DialogTitle>
          <DialogDescription>Time logged on this project&apos;s tasks. Make an invoice from it, or download it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as ReportPreset)}>
            <SelectTrigger className="h-9 w-44" aria-label="Range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => setRatesOpen(true)}>
                Rates
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className={`h-9 gap-1.5 ${!report || report.billable_seconds === 0 ? "pointer-events-none opacity-50" : ""}`}>
              <a href={`/invoice/${projectId}?${query}`} target="_blank" rel="noopener" aria-disabled={!report || report.billable_seconds === 0}>
                <FileText className="h-4 w-4" />
                Make an invoice
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={download} disabled={downloading || !report || report.entries === 0}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download CSV
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{serverMessage(error, "Couldn't load the report. Try again.")}</p>
        ) : !report || report.entries === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No time logged in this range. Start a timer or add time from any task in the project.
          </p>
        ) : (
          <div className="grid gap-5">
            <dl className="grid grid-cols-3 divide-x border-y py-3">
              <Stat label="Total" value={formatDuration(report.seconds)} />
              <Stat label="Billable" value={formatDuration(report.billable_seconds)} />
              {priced ? (
                <Stat label="Comes to" value={priced(report.amount_cents ?? 0)} />
              ) : (
                <Stat label="Billable hours" value={formatHours(report.billable_seconds)} />
              )}
            </dl>
            {report.running > 0 && (
              <p className="text-xs text-muted-foreground">
                {report.running === 1 ? "One timer is" : `${report.running} timers are`} still running and counted up to now.
              </p>
            )}
            {report.truncated && <p className="text-xs text-destructive">This range has too many entries to add up at once. Pick a shorter one.</p>}
            {isAdmin && !priced && (
              <p className="text-xs text-muted-foreground">
                Set the project&apos;s{" "}
                <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setRatesOpen(true)}>
                  rates
                </button>{" "}
                to see what its billable time comes to, per person and per task.
              </p>
            )}
            <Breakdown title="By person" lines={report.by_person} total={report.seconds} priced={priced} />
            <Breakdown title="By task" lines={report.by_task} total={report.seconds} priced={priced} />
          </div>
        )}
        {/* Saved invoices are the project's, whatever range is shown above. */}
        {isAdmin && <ProjectInvoices projectId={projectId} />}
      </DialogContent>
      {isAdmin && <ProjectRatesDialog projectId={projectId} open={ratesOpen} onOpenChange={setRatesOpen} onSaved={() => void mutate()} />}
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    // Figures in a row split by hairlines, not three boxes: they are one
    // reading, and the boxes made the dialog a grid of cards.
    <div className="min-w-0 px-4 first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-lg font-semibold">{value}</dd>
    </div>
  )
}

function Breakdown({ title, lines, total, priced }: { title: string; lines: TimeLine[]; total: number; priced?: (cents: number) => string }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ul className="grid gap-1.5">
        {lines.map((l) => (
          <li key={l.id} className="grid gap-1">
            {/* On a phone the money wraps under the name rather than squeezing it to a few letters. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 max-w-full truncate">{l.name}</span>
              <span className="ml-auto shrink-0 text-right tabular-nums">
                {formatDuration(l.seconds)}
                {l.billable_seconds !== l.seconds && <span className="text-xs text-muted-foreground"> · {formatDuration(l.billable_seconds)} billable</span>}
                {priced && l.amount_cents !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {" · "}
                    <span className="font-medium text-foreground">{priced(l.amount_cents)}</span>
                    {l.rate_cents !== undefined && ` at ${priced(l.rate_cents)}/h`}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${total ? Math.max(2, (l.seconds / total) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
