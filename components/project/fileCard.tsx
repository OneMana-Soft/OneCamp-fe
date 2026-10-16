"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { Check, Download, Link, MoreHorizontal, Play, RotateCcw, Trash2, X } from "@/lib/icons"
import { useConfirm } from "@/hooks/useConfirm"
import { useMediaFetch } from "@/hooks/useFetch"
import { downloadFile } from "@/lib/utils/file/downloadFile"
import { shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { GetMediaURLRes } from "@/types/file"

/** "2.4 MB", "860 KB", "14 KB": one decimal under 10, none above. */
export function fileSize(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return ""
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)} ${units[i]}`
}

/**
 * A file name in two parts for a middle cut: the head, which may give way,
 * and the tail ("v3.pdf": the extension and the two characters before it),
 * which always shows. Pure.
 */
export function nameParts(name: string): [string, string] {
  const dot = name.lastIndexOf(".")
  const keep = dot > 0 && name.length - dot <= 8 ? name.length - dot + 2 : 6
  if (name.length <= keep) return ["", name]
  return [name.slice(0, name.length - keep), name.slice(name.length - keep)]
}

/**
 * "Launch-brief-v3-fin…ew.pdf": the middle goes, cut by the width there is,
 * so the start and the extension stay. A count of characters cut it at 24
 * and then the card's own ellipsis cut it again, losing the extension.
 */
function MiddleName({ name }: { name: string }) {
  const [head, tail] = nameParts(name)
  return (
    <span className="flex min-w-0" data-middle-name="">
      <span className="truncate">{head}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  )
}

function dateOf(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : shortDate(d)
}

function durationOf(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return ""
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

interface FileProps {
  file: AttachmentMediaReq
  /** The media URL endpoint for this file (the project's media path plus its uuid). */
  mediaPath: string
  onOpen: () => void
  canDelete?: boolean
  onDelete?: () => void
}

/** The file's signed URL, for its preview, Download and Copy link. */
function useFileUrl(file: AttachmentMediaReq, mediaPath: string) {
  const media = useMediaFetch<GetMediaURLRes>(file.attachment_uuid ? mediaPath : "")
  return { url: media.data?.url, failed: !!media.isError }
}

/** Download, Copy link, and (for an admin) Delete, asked first. */
function FileMenu({ file, url, canDelete, onDelete, triggerClassName }: { file: AttachmentMediaReq; url?: string; canDelete?: boolean; onDelete?: () => void; triggerClassName?: string }) {
  const confirm = useConfirm()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-7 text-ink-2", triggerClassName)} aria-label="Attachment options" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem disabled={!url} onSelect={() => url && downloadFile(url, file.attachment_file_name)}>
          <Download className="mr-2 size-4" /> Download
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!url} onSelect={() => url && void navigator.clipboard?.writeText(url)}>
          <Link className="mr-2 size-4" /> Copy link
        </DropdownMenuItem>
        {canDelete && onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                // Asked first: it goes for everyone on the project.
                confirm({
                  title: `Delete the file “${file.attachment_file_name}”?`,
                  description: "It is removed from this project for everyone. This can't be undone.",
                  confirmText: "Delete file",
                  destructive: true,
                  onConfirm: onDelete,
                })
              }
              className="text-danger-ink focus:text-danger-ink"
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A file as a card (content.md F02): 176 px square on the raised ground at
 * e1, r12, no border. A 112 px preview (the image itself, a video with a play
 * disc and its length, or the file's glyph on sunken), then the name with its
 * middle cut so the extension stays, and "2.4 MB · 9 Oct". Under the pointer
 * it rises to e2 and a mini toolbar shows on the preview (Download, ⋯).
 * Clicking opens the lightbox; the name is the keyboard's way in.
 */
export function FileCard({ file, mediaPath, onOpen, canDelete, onDelete }: FileProps) {
  const { url, failed } = useFileUrl(file, mediaPath)
  const [broken, setBroken] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  // A preview that can't load falls back to the file's glyph.
  const isImage = file.attachment_type === "image" && !broken && !failed
  const isVideo = file.attachment_type === "video"
  const meta = [fileSize(file.attachment_size), dateOf(file.attachment_created_at)].filter(Boolean).join(" · ")
  return (
    <div
      data-file-card=""
      className="group relative flex h-44 flex-col overflow-hidden rounded-xl bg-raised shadow-e1 transition-[translate,box-shadow] duration-[140ms] ease-[var(--ease-out)] hover:-translate-y-px hover:shadow-e2 focus-within:shadow-e2 motion-reduce:hover:translate-y-0"
    >
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onOpen} className="relative flex h-28 shrink-0 items-center justify-center overflow-hidden bg-sunken">
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL
          <img
            src={url}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            className={cn("size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
          />
        ) : isImage ? (
          <span className="size-full animate-pulse bg-press" />
        ) : isVideo ? null : (
          <FileGlyph name={file.attachment_file_name} fileType={file.attachment_raw_type} />
        )}
        {isVideo ? (
          <>
            <span className="absolute inset-0 m-auto inline-flex size-7 items-center justify-center rounded-[14px] bg-pop/90 text-ink shadow-e2">
              <Play className="size-3.5 translate-x-px" />
            </span>
            {durationOf(file.attachment_duration) ? (
              <span className="absolute bottom-2 right-2 rounded-[5px] bg-black/50 px-1.5 text-micro font-medium leading-[18px] text-white tabular-nums">
                {durationOf(file.attachment_duration)}
              </span>
            ) : null}
          </>
        ) : null}
      </button>
      {/* The mini toolbar on the preview. */}
      <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-pop/95 p-0.5 opacity-0 shadow-e2 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
        <Button variant="ghost" size="icon" className="size-7 text-ink-2" aria-label={`Download ${file.attachment_file_name}`} disabled={!url} onClick={() => url && downloadFile(url, file.attachment_file_name)}>
          <Download className="size-3.5" />
        </Button>
        <FileMenu file={file} url={url} canDelete={canDelete} onDelete={onDelete} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          title={file.attachment_file_name}
          aria-label={file.attachment_file_name}
          className="min-w-0 rounded-sm text-left text-ui-sm font-medium text-ink outline-none after:absolute after:inset-x-0 after:top-0 after:h-28 focus-visible:ring-2 focus-visible:ring-brand"
        >
          <MiddleName name={file.attachment_file_name} />
        </button>
        <span className="truncate text-meta text-ink-3 tabular-nums">{meta}</span>
      </div>
    </div>
  )
}

/**
 * A file as a row (F01's list view, and every file on a phone): 44 px (56 on
 * a phone) with a hairline, the glyph or thumbnail, the name, the type, the
 * size on the right, the date, and ⋯ under the pointer.
 */
export function FileRow({ file, mediaPath, onOpen, canDelete, onDelete }: FileProps) {
  const { url } = useFileUrl(file, mediaPath)
  const [broken, setBroken] = React.useState(false)
  const ext = (file.attachment_file_name.split(".").pop() || "").toUpperCase()
  return (
    <div data-file-row="" className="group flex h-11 items-center gap-3 border-b border-line px-1 max-sm:h-14">
      <span className="relative inline-flex size-8 shrink-0 overflow-hidden rounded-md">
        {file.attachment_type === "image" && url && !broken ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL */}
            <img src={url} alt="" onError={() => setBroken(true)} className="size-full object-cover" />
            {/* An edge, so a white poster on the white sheet still reads as a tile. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_var(--line-2)]" />
          </>
        ) : (
          <FileGlyph name={file.attachment_file_name} fileType={file.attachment_raw_type} size={32} />
        )}
      </span>
      <button
        type="button"
        onClick={onOpen}
        aria-label={file.attachment_file_name}
        title={file.attachment_file_name}
        className="min-w-0 flex-1 truncate rounded-sm text-left text-ui text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {file.attachment_file_name}
      </button>
      <span className="w-14 shrink-0 text-meta text-ink-3 max-sm:hidden">{ext.length <= 5 ? ext : ""}</span>
      <span className="w-16 shrink-0 text-right text-meta text-ink-3 tabular-nums" data-file-size="">
        {fileSize(file.attachment_size)}
      </span>
      <span className="w-14 shrink-0 text-right text-meta text-ink-3 tabular-nums max-sm:hidden">{dateOf(file.attachment_created_at)}</span>
      <FileMenu file={file} url={url} canDelete={canDelete} onDelete={onDelete} triggerClassName="pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100" />
    </div>
  )
}

/**
 * A file on its way up (F04): the card's shape with its glyph faded on the
 * sunken preview and a 28 px ring with the percentage; "Uploading · 1.2 of
 * 2.4 MB" and × under it. Done, a moss check springs in. Failed, the ring is
 * a danger disc, the footer says so, and Retry and Remove sit on the card.
 */
export function UploadingFileCard({
  name,
  progress,
  size,
  failed,
  view = "grid",
  onCancel,
  onRetry,
  onRemove,
}: {
  name: string
  progress: number
  size?: number
  failed?: boolean
  view?: "grid" | "list"
  onCancel: () => void
  onRetry?: () => void
  onRemove: () => void
}) {
  const done = progress >= 100 && !failed
  const sent = size ? fileSize((size * Math.min(progress, 100)) / 100) : ""
  const status = failed ? "Upload failed" : done ? "Uploaded" : size ? `Uploading · ${sent.replace(/ [A-Z]+$/, "")} of ${fileSize(size)}` : `Uploading · ${progress}%`
  const ring = failed ? (
    <span className="inline-flex size-7 items-center justify-center rounded-[14px] bg-destructive text-ui-sm font-semibold text-destructive-foreground" aria-hidden="true">
      !
    </span>
  ) : done ? (
    <span className="content-pop-in inline-flex size-7 items-center justify-center rounded-[14px] bg-[var(--camp-moss-a2)] text-white" aria-hidden="true">
      <Check className="size-4" />
    </span>
  ) : (
    <ProgressRing value={progress} size={28} weight={3} label={`Uploading ${name}`}>
      <span className="text-micro font-semibold leading-none tracking-tight tabular-nums text-ink">{progress}</span>
    </ProgressRing>
  )
  const actions = failed ? (
    <span className="flex shrink-0 items-center gap-0.5">
      {onRetry ? (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-meta" onClick={onRetry}>
          <RotateCcw className="size-3" aria-hidden="true" /> Retry
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-meta" onClick={onRemove}>
        Remove
      </Button>
    </span>
  ) : done ? null : (
    <Button variant="ghost" size="icon" className="size-6 shrink-0 text-ink-3" aria-label={`Cancel uploading ${name}`} onClick={onCancel}>
      <X className="size-3.5" />
    </Button>
  )

  if (view === "list") {
    return (
      <div data-uploading-file="" data-failed={failed || undefined} className="content-row-in flex h-11 items-center gap-3 border-b border-line px-1 max-sm:h-14">
        <span className="inline-flex size-8 shrink-0 items-center justify-center">{ring}</span>
        <span className="min-w-0 flex-1 truncate text-ui text-ink">{name}</span>
        <span className={cn("shrink-0 text-meta tabular-nums", failed ? "text-danger-ink" : "text-ink-3")}>{status}</span>
        {actions}
      </div>
    )
  }
  return (
    <div data-uploading-file="" data-failed={failed || undefined} className="content-row-in relative flex h-44 flex-col overflow-hidden rounded-xl bg-raised shadow-e1">
      <div className="relative flex h-28 shrink-0 items-center justify-center bg-sunken">
        <FileGlyph name={name} className="opacity-50" />
        <span className="absolute inset-0 flex items-center justify-center">{ring}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2.5">
        <span className="min-w-0 text-ui-sm font-medium text-ink" title={name}>
          <MiddleName name={name} />
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <span className={cn("min-w-0 flex-1 truncate text-meta tabular-nums", failed ? "text-danger-ink" : "text-ink-3")} role={failed ? "alert" : undefined}>
            {status}
          </span>
          {actions}
        </span>
      </div>
    </div>
  )
}
