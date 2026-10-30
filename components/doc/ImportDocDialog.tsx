"use client"

/**
 * Importing files as docs (A7): Markdown, text, HTML and Word files, or zips
 * of them, become new docs inside this doc or at the top of the person's
 * docs. Each file is a job on the API (business/ContentIO), followed by the
 * shared useImportJobs, and the docs it made are listed when it is done.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { ImportDropZone } from "@/components/common/importDropZone"
import { ImportRowFrame } from "@/components/common/importFiles"
import { ContentIOCapabilities, loadCapabilities, startImport } from "@/lib/export/contentIO"
import { extensionOf, megabytes, useImportJobs, type ImportRow } from "@/lib/export/useImportJobs"

// What an import reads when the API has not said (it always says).
const DEFAULT_EXTENSIONS = [".md", ".markdown", ".txt", ".html", ".htm", ".docx", ".zip"]

export default function ImportDocDialog({ docId, onClose }: { docId: string; onClose(): void }) {
  const [open, setOpen] = React.useState(true)
  const [caps, setCaps] = React.useState<ContentIOCapabilities | null>(null)
  const [where, setWhere] = React.useState<"here" | "top">(docId ? "here" : "top")

  React.useEffect(() => {
    let live = true
    void loadCapabilities().then((c) => live && setCaps(c))
    return () => {
      live = false
    }
  }, [])

  const extensions = caps?.import_extensions?.length ? caps.import_extensions : DEFAULT_EXTENSIONS
  const jobs = useImportJobs({
    check: (file) => {
      if (!extensions.includes(extensionOf(file.name))) return "This kind of file can't be imported. Use Markdown, text, HTML, Word or a zip of them."
      if (caps && file.size > caps.max_import_bytes) return `Larger than the ${megabytes(caps.max_import_bytes)} an import takes.`
      return undefined
    },
    start: (file) => startImport(file, where === "here" ? docId : "", caps),
  })

  const close = () => {
    setOpen(false)
    onClose()
  }

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

        <ImportDropZone accept={extensions} onFiles={jobs.add} />

        {jobs.rows.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Files to import">
            {jobs.rows.map((r) => (
              <ImportRowFrame key={r.key} row={r} onRemove={() => jobs.remove(r.key)}>
                <DocsMade row={r} />
              </ImportRowFrame>
            ))}
          </ul>
        )}

        {docId && (
          <RadioGroup value={where} onValueChange={(v) => setWhere(v as "here" | "top")} className="gap-1.5" disabled={jobs.started}>
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
            {jobs.allOver ? "Close" : "Cancel"}
          </Button>
          {!jobs.allOver && (
            <Button type="button" onClick={jobs.run} disabled={!jobs.ready} busy={jobs.busy}>
              {jobs.busy ? "Importing…" : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The docs a finished import made, and what it left out. */
function DocsMade({ row }: { row: ImportRow }) {
  const job = row.job
  const failed = !!row.error || job?.status === "failed"
  const done = job?.status === "done"
  // A failed import still lists any empty doc it couldn't take away again.
  if (!(done || (failed && !!job?.created?.length))) return null
  return (
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
      {!!job?.skipped?.length && <p className="mt-1">Left out: {job.skipped.map((s) => `${s.what} (${s.why})`).join("; ")}</p>}
    </div>
  )
}
