"use client"

/**
 * SlackImportUploadDialog — accepts a Slack workspace export ZIP,
 * uploads it to the backend, and hands off to the planning step.
 *
 * The dialog enforces basic client-side validation (file type, size) so
 * users get instant feedback. The authoritative validation happens on
 * the backend — never trust the client alone.
 *
 * Everything it has to say, it says in place. A wrong file is said under the
 * file field and let go (it was a red toast, and the file chosen before it
 * stayed chosen); an upload can be stopped (a multi-GB one could not, and the
 * dialog refused to close); an export uploaded before says so and offers to
 * show that import (it was a red toast, and then the plan dialog opened on an
 * import that had already finished).
 */

import React, { useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Tile } from "@/components/ui/graphics/Tile"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "@/components/ui/progress"
import { Upload, AlertCircle, FileArchive } from "@/lib/icons"
import { SLACK_IMPORT_LIMITS_KEY, uploadSlackExport, uploadSlackExportPresigned } from "@/services/slackImportService"
import { importProblemOf } from "@/services/importService"
import { useFetch } from "@/hooks/useFetch"
import { readableBytes } from "@/lib/readableBytes"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: (jobId: string) => void
  /** Shows the import an export already made, when the same file comes in again. */
  onShowExisting?: (jobId: string) => void
  /** The history changed behind the dialog: a stopped large upload leaves an unfinished import there. */
  onChanged?: () => void
}

// 50 GB is the practical ceiling for the presigned PUT path on most
// browsers. Browsers cap individual fetch/XHR uploads at slightly
// different ranges (Chrome: ~no fixed cap; Firefox: ~32 GB; Safari:
// ~10 GB). For workspaces beyond that, a desktop client or chunked
// upload would be needed; that's a future enhancement.
const BROWSER_MAX_BYTES = 50 * 1024 * 1024 * 1024

/**
 * The largest export the dialog accepts: the server's own limit
 * (EXPORT_MAX_BYTES, 5 GB unless raised), never more than a browser can
 * send, or null until the server has said. It used to say 50 GB whatever
 * the server took, and then 50 GB until the server's answer arrived. Pure.
 */
export function exportLimit(serverMax?: number): number | null {
  return serverMax && serverMax > 0 ? Math.min(serverMax, BROWSER_MAX_BYTES) : null
}

// Files smaller than this go through the simple multipart endpoint;
// larger ones use the presigned PUT path which streams browser→MinIO
// directly without buffering through the Go service. The threshold
// matches the point where a typical upload starts to stress
// http.MaxBytesReader and Go's request memory model.
const PRESIGN_THRESHOLD = 2 * 1024 * 1024 * 1024 // 2 GB

type Problem = { message: string; existing?: string }

export const SlackImportUploadDialog: React.FC<Props> = ({ open, onOpenChange, onUploaded, onShowExisting, onChanged }) => {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileError, setFileError] = useState("")
  const [problem, setProblem] = useState<Problem | null>(null)
  // Which upload was stopped: a large one leaves an unfinished import behind.
  const [stopped, setStopped] = useState<"" | "simple" | "direct">("")
  const abortRef = useRef<AbortController | null>(null)
  const { data: limits } = useFetch<{ max_bytes: number }>(open ? SLACK_IMPORT_LIMITS_KEY : "")
  const maxBytes = exportLimit(limits?.max_bytes)

  const reset = () => {
    setFile(null)
    setWorkspaceName("")
    setUploading(false)
    setProgress(0)
    setFileError("")
    setProblem(null)
    setStopped("")
  }

  const handleClose = (next: boolean) => {
    if (uploading) return // Stop first: the footer offers it while an upload runs
    if (!next) reset()
    onOpenChange(next)
  }

  // A file the dialog can't take is said under the field and let go, so
  // Upload can't send the one chosen before it.
  const refuse = (input: HTMLInputElement, why: string) => {
    input.value = ""
    setFile(null)
    setFileError(why)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const f = input.files?.[0] || null
    setProblem(null)
    setStopped("")
    setFileError("")
    if (!f) {
      setFile(null)
      return
    }
    if (!/\.zip$/i.test(f.name)) {
      return refuse(input, `Slack exports come as a .zip file, and ${f.name} isn't one.`)
    }
    // Until the server's limit is known the server checks it, in the same words.
    if (maxBytes !== null && f.size > maxBytes) {
      return refuse(input, `That export is ${readableBytes(f.size)}, and this server takes exports up to ${readableBytes(maxBytes)}.`)
    }
    // The first bytes, checked here: the backend checks again, but a file
    // renamed to .zip is caught before a multi-GB upload that would fail.
    if (!(await isPKZipFile(f))) {
      return refuse(input, `${f.name} isn't a ZIP archive inside, although its name ends in .zip.`)
    }
    setFile(f)
    // Best-effort default for slack_workspace_name if the user hasn't typed one yet.
    if (!workspaceName) {
      const stem = f.name.replace(/\.zip$/i, "").replace(/[._-]?Slack[ _-]?export.*/i, "")
      setWorkspaceName(stem || "Slack Workspace")
    }
  }

  // isPKZipFile reads the first 4 bytes of f and checks for any of the
  // three PKZIP signatures. Cheap (browser FileReader is async but
  // bounded to 4 bytes) so we always run it before showing the file.
  async function isPKZipFile(f: File): Promise<boolean> {
    try {
      const head = new Uint8Array(await f.slice(0, 4).arrayBuffer())
      if (head.length < 4) return false
      const isLocalFile = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
      const isEOCD = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x05 && head[3] === 0x06
      const isSpan = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x07 && head[3] === 0x08
      return isLocalFile || isEOCD || isSpan
    } catch {
      // If we can't read the file (very small files, browser quirks),
      // skip the client-side check and let the BE decide.
      return true
    }
  }

  const handleSubmit = async () => {
    if (!file || !workspaceName.trim()) return
    const controller = new AbortController()
    abortRef.current = controller
    setUploading(true)
    setProgress(0)
    setProblem(null)
    setStopped("")
    // Files over the threshold use the presigned-PUT path which uploads
    // browser → MinIO directly. For smaller files the simple multipart
    // route is fine and means one round-trip less.
    const usePresigned = file.size > PRESIGN_THRESHOLD
    try {
      const uploader = usePresigned ? uploadSlackExportPresigned : uploadSlackExport
      const res = await uploader(file, workspaceName.trim(), "export_zip", setProgress, controller.signal)
      toast({ title: "Uploaded", description: "OneCamp is counting what's in it. Nothing is imported until you run it." })
      onUploaded(res.job_id)
      reset()
    } catch (err) {
      if (controller.signal.aborted) {
        setStopped(usePresigned ? "direct" : "simple")
        if (usePresigned) onChanged?.()
        return
      }
      const e = err as { response?: { status?: number; data?: { code?: string; existing_job_id?: unknown } } }
      const status = e?.response?.status
      const code = e?.response?.data?.code
      const existing = e?.response?.data?.existing_job_id
      if (status === 409 && code === "duplicate_upload" && existing) {
        setProblem({ message: "You've uploaded this export before, so importing it again would bring nothing new.", existing: String(existing) })
        return
      }
      if (status === 409 && code === "active_job") {
        setProblem({ message: "Another import of this workspace is waiting or running. Finish or cancel it, then upload again." })
        return
      }
      setProblem({ message: importProblemOf(err, "The upload didn't finish. Try again.").message })
    } finally {
      setUploading(false)
      abortRef.current = null
    }
  }

  const showExisting = (jobId: string) => {
    onShowExisting?.(jobId)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <Tile hue={ADMIN_GROUP_HUE.workspace} size="sm">
              <Upload />
            </Tile>
            Upload a Slack export
          </DialogTitle>
          <DialogDescription>
            The .zip file you downloaded from Slack&apos;s Workspace settings
            {maxBytes !== null && <> (up to {readableBytes(maxBytes)} on this server)</>}. OneCamp reads it and shows
            what would come across before anything is imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field
            label="Slack workspace name"
            help="Shown in the import history. Importing the same workspace again under this name brings only what is new."
          >
            <Input
              placeholder="Acme Inc.…"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={uploading}
              maxLength={120}
              autoComplete="off"
            />
          </Field>

          <Field label="Export file" help="A .zip, from Slack's Workspace settings, under Import/Export Data." error={fileError}>
            <Input type="file" accept=".zip,application/zip" onChange={handleFileChange} disabled={uploading} />
          </Field>
          {file && (
            <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <FileArchive className="h-4 w-4" aria-hidden="true" />
              <span>
                {file.name}, {readableBytes(file.size)}
              </span>
              {file.size > PRESIGN_THRESHOLD && (
                <span className="text-info-ink">A large file goes straight to storage: keep this tab open until it finishes.</span>
              )}
            </div>
          )}

          {uploading && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground" aria-live="polite">
                Uploading {progress}%…
              </div>
              <Progress value={progress} className="h-2" aria-label="Upload progress" />
            </div>
          )}

          {stopped && (
            <p role="status" className="text-sm text-muted-foreground">
              Upload stopped. Nothing was imported.
              {stopped === "direct" && " The unfinished upload is in the import history: discard it there."}
            </p>
          )}

          {problem && (
            <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <p className="break-words text-danger-ink">{problem.message}</p>
              {problem.existing && onShowExisting && (
                <Button size="sm" variant="outline" className="h-8" onClick={() => showExisting(problem.existing!)}>
                  Show that import
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
            <p className="text-muted-foreground">
              Workspace exports include public channels only. Direct messages and private channels need a Corporate
              (Plus or Enterprise) export. The plan shows exactly what is in your file before anything is imported.
            </p>
          </div>
        </div>

        <DialogFooter>
          {uploading ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              Stop upload
            </Button>
          ) : (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={!file || !workspaceName.trim() || uploading}>
            {uploading ? "Uploading…" : "Upload and plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
