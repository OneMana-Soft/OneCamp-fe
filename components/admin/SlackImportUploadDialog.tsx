"use client"

/**
 * SlackImportUploadDialog — accepts a Slack workspace export ZIP,
 * uploads it to the backend, and hands off to the planning step.
 *
 * The dialog enforces basic client-side validation (file type, size) so
 * users get instant feedback. The authoritative validation happens on
 * the backend — never trust the client alone.
 */

import React, { useState } from "react"
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
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Progress } from "@/components/ui/progress"
import { Upload, AlertCircle, FileArchive } from "@/lib/icons"
import { uploadSlackExport, uploadSlackExportPresigned } from "@/services/slackImportService"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: (jobId: string) => void
}

// 50 GB is the practical ceiling for the presigned PUT path on most
// browsers. Browsers cap individual fetch/XHR uploads at slightly
// different ranges (Chrome: ~no fixed cap; Firefox: ~32 GB; Safari:
// ~10 GB). For workspaces beyond that, a desktop client or chunked
// upload would be needed; that's a future enhancement.
const MAX_BYTES = 50 * 1024 * 1024 * 1024

// Files smaller than this go through the simple multipart endpoint;
// larger ones use the presigned PUT path which streams browser→MinIO
// directly without buffering through the Go service. The threshold
// matches the point where a typical upload starts to stress
// http.MaxBytesReader and Go's request memory model.
const PRESIGN_THRESHOLD = 2 * 1024 * 1024 * 1024 // 2 GB

export const SlackImportUploadDialog: React.FC<Props> = ({ open, onOpenChange, onUploaded }) => {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const reset = () => {
    setFile(null)
    setWorkspaceName("")
    setUploading(false)
    setProgress(0)
  }

  const handleClose = (next: boolean) => {
    if (uploading) return // don't allow closing mid-upload
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    if (!f) {
      setFile(null)
      return
    }
    if (!/\.zip$/i.test(f.name)) {
      toast({ title: "Not a ZIP file", description: "Slack exports come as a .zip archive.", variant: "destructive" })
      return
    }
    if (f.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: `Maximum upload is ${(MAX_BYTES / (1024 * 1024 * 1024)).toFixed(0)} GB.`,
        variant: "destructive",
      })
      return
    }
    // Magic-byte validation client-side. The backend re-validates
    // (auth-of-record), but rejecting here gives the operator instant
    // feedback for typos (drag-dropping a .docx renamed to .zip, etc.)
    // and saves a multi-GB upload that's destined to fail.
    if (!(await isPKZipFile(f))) {
      toast({
        title: "Not a ZIP file",
        description: "The file's contents don't match a ZIP archive (PKZIP signature missing).",
        variant: "destructive",
      })
      return
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
    setUploading(true)
    setProgress(0)
    try {
      // Files over the threshold use the presigned-PUT path which uploads
      // browser → MinIO directly. For smaller files the simple multipart
      // route is fine and means one round-trip less.
      const usePresigned = file.size > PRESIGN_THRESHOLD
      const uploader = usePresigned ? uploadSlackExportPresigned : uploadSlackExport
      const res = await uploader(file, workspaceName.trim(), "export_zip", setProgress)
      toast({
        title: "Upload complete",
        description: `Job ${res.job_id.slice(0, 8)} created${
          usePresigned ? " (direct-to-storage path)" : ""
        }. Building plan…`,
      })
      onUploaded(res.job_id)
      reset()
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      const status = e?.response?.status
      const code = e?.response?.data?.code
      const existing = e?.response?.data?.existing_job_id

      // 409 + duplicate_upload is the dedup hit. Show a helpful message
      // pointing the operator at the existing job rather than a generic
      // "upload failed".
      if (status === 409 && code === "duplicate_upload" && existing) {
        toast({
          title: "Already imported",
          description: `This exact export was already uploaded as job ${String(existing).slice(0, 8)}. Open the import history to view it.`,
          variant: "destructive",
        })
        // Notify the parent so it can refresh and let the operator click
        // through to the existing job. We treat dedup as a soft success
        // for the purpose of closing the dialog.
        onUploaded(existing)
        reset()
        return
      }
      if (status === 409 && code === "active_job") {
        toast({
          title: "Workspace is busy",
          description:
            "Another import is already active for this workspace. Wait for it to finish or cancel it before starting a new one.",
          variant: "destructive",
        })
        return
      }

      const msg = e?.response?.data?.error || e?.message || "Upload failed"
      toast({ title: "Upload failed", description: msg, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Upload Slack export
          </DialogTitle>
          <DialogDescription>
            Drop the .zip file you downloaded from Slack&apos;s Workspace settings. We&apos;ll
            stage it, then preview what would be imported before any changes are made.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="slack_workspace_name">Slack workspace name</Label>
            <Input
              id="slack_workspace_name"
              placeholder="Acme Inc."
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={uploading}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Label for the source Slack workspace this export came from. Shown in the import
              history and used to dedup re-imports of the same workspace.
            </p>
          </div>

          <div>
            <Label htmlFor="file">Export file (.zip)</Label>
            <Input
              id="file"
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {file && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileArchive className="h-4 w-4" />
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                {file.size > PRESIGN_THRESHOLD && (
                  <span className="ml-1 text-blue-600 dark:text-blue-400">
                    · uploads direct to storage
                  </span>
                )}
              </div>
            )}
          </div>

          {uploading && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Uploading {progress}%…</div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              Workspace exports include public channels only. DMs and private channels
              require a Corporate (Plus/Enterprise) export. The plan step will tell
              you exactly what&apos;s in your file before you commit.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!file || !workspaceName.trim() || uploading}>
            {uploading ? "Uploading…" : "Upload & plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
