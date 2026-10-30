"use client"

/**
 * "Start an import" for a CSV of tasks: in place of a tool's account and its
 * list to pick from, a file and the name of the project its tasks go into.
 * The file goes straight to storage (presignedUpload), and the plan opens on
 * it, where the admin sees what each column becomes and who each person is
 * before anything comes across.
 */

import React, { useEffect, useRef, useState } from "react"
import { FileSpreadsheet, Plus } from "lucide-react"
import { ImportDropZone } from "@/components/common/importDropZone"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { readableBytes } from "@/lib/readableBytes"
import { importProblemOf } from "@/services/importService"
import { uploadImportFile } from "@/services/importUploadService"

/** models/postgres/Import.SourceBackupCSV: the source a CSV import reads. */
const CSV_SOURCE = "backup_csv"

const FILE_MISSING = "Choose the CSV file to import."
const NAME_MISSING = "Name the project the tasks go into."

export function CsvImportPanel({ onUploaded }: { onUploaded: (jobId: string) => Promise<void> | void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [fileError, setFileError] = useState("")
  const [nameError, setNameError] = useState("")
  const [problem, setProblem] = useState("")
  // The upload's progress while it runs, in percent.
  const [percent, setPercent] = useState<number | null>(null)
  const fileRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const upload = useRef<AbortController | null>(null)

  // Leaving the tab stops the upload: nothing is finalised, and the import is
  // left in the history to discard.
  useEffect(() => () => upload.current?.abort(), [])

  // A file chosen or dropped. Choosing nothing (a closed chooser) keeps the one there.
  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setProblem("")
    setFileError("")
    if (!/\.csv$/i.test(f.name)) {
      setFile(null)
      setFileError(`${f.name} isn't a CSV file. Export the list as CSV, then choose that file.`)
      return
    }
    setFile(f)
    if (!name.trim()) {
      setName(f.name.replace(/\.csv$/i, "").trim())
      setNameError("")
    }
  }

  const start = async () => {
    setProblem("")
    if (!file) {
      setFileError(FILE_MISSING)
      fileRef.current?.focus()
      return
    }
    if (!name.trim()) {
      setNameError(NAME_MISSING)
      nameRef.current?.focus()
      return
    }
    const controller = new AbortController()
    upload.current = controller
    setPercent(0)
    try {
      const { job_id } = await uploadImportFile("csv", file, name.trim(), CSV_SOURCE, setPercent, controller.signal)
      setFile(null)
      setName("")
      await onUploaded(job_id)
    } catch (err) {
      if (!controller.signal.aborted) setProblem(importProblemOf(err, "Couldn't upload the file. Try again.").message)
    } finally {
      upload.current = null
      setPercent(null)
    }
  }

  const uploading = percent !== null
  return (
    <>
      <div className="set-row">
        <p className="text-sm text-muted-foreground">
          A list of tasks saved as CSV: OneCamp&apos;s own export, or one from Asana, Jira, Linear, ClickUp or Notion.
          Before anything comes across, you see what each column becomes and who each person is.
        </p>
      </div>
      <section aria-labelledby="import-csv" className="set-row space-y-3">
        <h4 id="import-csv" className="text-sm font-medium">
          New import from a CSV file
        </h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="CSV file" help="Its first row names the columns." error={fileError}>
            <ImportDropZone ref={fileRef} accept={[".csv", "text/csv"]} multiple={false} onFiles={pick} label="Choose a CSV file" disabled={uploading} />
          </Field>
          <Field label="Project name" help="The project the tasks go into, and the import's name in the history." error={nameError}>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (nameError) setNameError("")
              }}
              placeholder="Launch plan…"
              autoComplete="off"
              disabled={uploading}
            />
          </Field>
        </div>
        {file && (
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {file.name}, {readableBytes(file.size)}
            </span>
          </p>
        )}
        {uploading && (
          <div>
            <div className="mb-1 text-xs text-muted-foreground" aria-live="polite">
              Uploading {percent}%…
            </div>
            <Progress value={percent} className="h-2" aria-label="Upload progress" />
          </div>
        )}
        <div className="space-y-2">
          {/* The panel's one primary, as ImportCard's own Start import is. */}
          <Button className="h-11 gap-1.5 md:h-9" onClick={start} busy={uploading}>
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                <Plus /> Start import
              </>
            )}
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-danger-ink">
              {problem}
            </p>
          )}
        </div>
      </section>
    </>
  )
}
