"use client"

// A project's time: how much was logged over a range, by person and by task,
// billable and not, and every entry as a CSV file for an invoice. Any member
// of the project can read it.

import * as React from "react"
import axiosInstance from "@/lib/axiosInstance"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { serverMessage } from "@/lib/http/serverMessage"
import { Download, FileText, Loader2 } from "@/lib/icons"
import { REPORT_PRESETS, formatDuration, formatHours, presetRange, type ReportPreset, type TimeLine, type TimeReport } from "@/lib/tasks/time"
import { GetEndpointUrl } from "@/services/endPoints"

export function ProjectTimeDialog({ projectId, projectName, open, onOpenChange }: { projectId: string; projectName?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast()
  const [preset, setPreset] = React.useState<ReportPreset>("this-month")
  const [downloading, setDownloading] = React.useState(false)
  // The range is fixed when the preset is picked, so a report open across
  // midnight doesn't refetch every render.
  const range = React.useMemo(() => presetRange(preset, new Date()), [preset])
  const query = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`
  const base = `${GetEndpointUrl.ProjectTime}/${projectId}/time`
  const { data, isLoading, isError: error } = useFetch<{ data: TimeReport }>(open ? `${base}?${query}` : "")
  const report = data?.data

  const download = async () => {
    setDownloading(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
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
          <DialogDescription>Time logged on this project&apos;s tasks. Download it to invoice a client.</DialogDescription>
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
          <div className="flex gap-2">
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
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{serverMessage(error, "Couldn't load the report. Try again.")}</p>
        ) : !report || report.entries === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No time logged in this range. Start a timer or add time from any task in the project.
          </p>
        ) : (
          <div className="grid gap-5">
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Total" value={formatDuration(report.seconds)} />
              <Stat label="Billable" value={formatDuration(report.billable_seconds)} />
              <Stat label="Billable hours" value={formatHours(report.billable_seconds)} />
            </dl>
            {report.running > 0 && (
              <p className="text-xs text-muted-foreground">
                {report.running === 1 ? "One timer is" : `${report.running} timers are`} still running and counted up to now.
              </p>
            )}
            {report.truncated && <p className="text-xs text-destructive">This range has too many entries to add up at once. Pick a shorter one.</p>}
            <Breakdown title="By person" lines={report.by_person} total={report.seconds} />
            <Breakdown title="By task" lines={report.by_task} total={report.seconds} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function Breakdown({ title, lines, total }: { title: string; lines: TimeLine[]; total: number }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="grid gap-1.5">
        {lines.map((l) => (
          <li key={l.id} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{l.name}</span>
              <span className="shrink-0 tabular-nums">
                {formatDuration(l.seconds)}
                {l.billable_seconds !== l.seconds && <span className="text-xs text-muted-foreground"> · {formatDuration(l.billable_seconds)} billable</span>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${total ? Math.max(2, (l.seconds / total) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
