"use client"

/**
 * Importing files as docs (A7): Markdown, text, HTML and Word files, or zips
 * of them, become new docs inside this doc or at the top of the person's
 * docs. Each file is a job on the API (business/ContentIO); its progress
 * comes over MQTT, with a poll as the fallback, and the docs it made are
 * listed when it is done.
 */

import * as React from "react"
import { CheckCircle2, FileUp, Loader2, TriangleAlert, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/helpers/cn"
import {
  CONTENT_IO_JOB_EVENT,
  ContentIOCapabilities,
  ContentIOJob,
  getJob,
  jobIsOver,
  loadCapabilities,
  startImport,
} from "@/lib/export/contentIO"
import { apiErrorMessage } from "@/lib/utils/apiError"

const POLL_MS = 1500
// What an import reads when the API has not said (it always says).
const DEFAULT_EXTENSIONS = [".md", ".markdown", ".txt", ".html", ".htm", ".docx", ".zip"]

interface Row {
  key: string
  file: File
  job?: ContentIOJob
  error?: string
}

const extensionOf = (name: string) => {
  const i = name.lastIndexOf(".")
  return i < 0 ? "" : name.slice(i).toLowerCase()
}

const megabytes = (n: number) => `${Math.round(n / (1 << 20))} MB`

export default function ImportDocDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const [open, setOpen] = React.useState(true)
  const [caps, setCaps] = React.useState<ContentIOCapabilities | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])
  const [where, setWhere] = React.useState<"here" | "top">(docId ? "here" : "top")
  const [started, setStarted] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let live = true
    void loadCapabilities().then((c) => live && setCaps(c))
    return () => {
      live = false
    }
  }, [])

  const extensions = caps?.import_extensions?.length ? caps.import_extensions : DEFAULT_EXTENSIONS

  const close = () => {
    setOpen(false)
    onClose()
  }

  const update = React.useCallback((key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  // A job's news arrives over MQTT (the message handler re-sends it as a
  // window event); a poll covers a missed message.
  React.useEffect(() => {
    const onJob = (e: Event) => {
      const job = (e as CustomEvent<ContentIOJob>).detail
      if (!job?.id) return
      setRows((rs) => rs.map((r) => (r.job?.id === job.id ? { ...r, job } : r)))
    }
    window.addEventListener(CONTENT_IO_JOB_EVENT, onJob)
    return () => window.removeEventListener(CONTENT_IO_JOB_EVENT, onJob)
  }, [])

  const pending = rows.filter((r) => r.job && !jobIsOver(r.job)).map((r) => r.job!.id).join(",")
  React.useEffect(() => {
    if (!pending) return
    const ids = pending.split(",")
    const timer = window.setInterval(() => {
      for (const id of ids) {
        getJob(id)
          .then((job) => setRows((rs) => rs.map((r) => (r.job?.id === id ? { ...r, job } : r))))
          .catch(() => {
            // The next poll tries again.
          })
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [pending])

  const add = (files: FileList | File[] | null) => {
    if (!files) return
    const next: Row[] = []
    for (const file of Array.from(files)) {
      let error: string | undefined
      if (!extensions.includes(extensionOf(file.name))) {
        error = "This kind of file can't be imported. Use Markdown, text, HTML, Word or a zip of them."
      } else if (caps && file.size > caps.max_import_bytes) {
        error = `Larger than the ${megabytes(caps.max_import_bytes)} an import takes.`
      }
      next.push({ key: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`, file, error })
    }
    setRows((rs) => [...rs.filter((r) => r.job), ...rs.filter((r) => !r.job), ...next])
  }

  const run = async () => {
    setStarted(true)
    const parent = where === "here" ? docId : ""
    for (const row of rows) {
      if (row.job || row.error) continue
      try {
        const job = await startImport(row.file, parent, caps)
        update(row.key, { job })
      } catch (err) {
        update(row.key, { error: apiErrorMessage(err, "The file couldn't be imported. Try again.") })
      }
    }
  }

  const ready = rows.some((r) => !r.job && !r.error)
  const busy = rows.some((r) => r.job && !jobIsOver(r.job))
  const allOver = started && rows.length > 0 && !ready && !busy

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg" data-import-doc-dialog="">
        <DialogHeader>
          <DialogTitle>Import files</DialogTitle>
          <DialogDescription>
            Markdown, text, HTML and Word files, or a zip of them, become new docs, with their pictures. A zip exported
            from Notion, Confluence or Google Takeout keeps its pages in their tree.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm transition-colors",
            dragging && "border-primary bg-hover",
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            add(e.dataTransfer.files)
          }}
        >
          <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">Drop files here, or</p>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            Choose files
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={extensions.join(",")}
            className="hidden"
            data-import-input=""
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ""
            }}
          />
        </div>

        {rows.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Files to import">
            {rows.map((r) => (
              <ImportRow
                key={r.key}
                row={r}
                onRemove={r.job ? undefined : () => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              />
            ))}
          </ul>
        )}

        {docId && (
          <RadioGroup value={where} onValueChange={(v) => setWhere(v as "here" | "top")} className="gap-1.5" disabled={started}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="here" id="import-here" />
              <Label htmlFor="import-here">Inside this doc</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="top" id="import-top" />
              <Label htmlFor="import-top">At the top of my docs</Label>
            </div>
          </RadioGroup>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {allOver ? "Close" : "Cancel"}
          </Button>
          {!allOver && (
            <Button type="button" onClick={run} disabled={!ready || busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportRow({ row, onRemove }: { row: Row; onRemove?: () => void }) {
  const job = row.job
  const failed = !!row.error || job?.status === "failed"
  const done = job?.status === "done"
  return (
    <li className="rounded-md border border-border px-3 py-2 text-sm" data-import-row={job?.status || (row.error ? "invalid" : "ready")}>
      <div className="flex items-center gap-2">
        {failed ? (
          <TriangleAlert className="h-4 w-4 shrink-0 text-danger-ink" aria-hidden="true" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
        ) : job ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">{row.file.name}</span>
        {onRemove && (
          <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-hover" onClick={onRemove} aria-label={`Remove ${row.file.name}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {job && !jobIsOver(job) && <Progress value={job.progress} className="mt-2 h-1.5" aria-label={`Importing ${row.file.name}`} />}
      {(row.error || job?.error) && <p className="mt-1 text-2xs text-danger-ink">{row.error || job?.error}</p>}
      {/* A failed import still lists any empty doc it couldn't take away again. */}
      {(done || (failed && !!job?.created?.length)) && (
        <div className="mt-1 text-2xs text-muted-foreground">
          {job?.created?.length ? (
            <ul className="space-y-0.5">
              {job.created.map((c) => (
                <li key={c.uuid}>
                  <a className="text-brand-text hover:underline" href={`/app/doc/${c.uuid}`}>
                    {c.title || "Untitled"}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            "Nothing in it could be made into a doc."
          )}
          {!!job?.skipped?.length && (
            <p className="mt-1">
              Left out: {job.skipped.map((s) => `${s.what} (${s.why})`).join("; ")}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
