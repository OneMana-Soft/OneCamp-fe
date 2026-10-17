"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { AlertCircle, ArrowUpRight, Download, Loader2, RotateCcw, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import axiosInstance from "@/lib/axiosInstance"
import { formatUploadBytes } from "@/lib/utils/uploadLimit"
import { docFileOf, viewableFileUrl } from "@/lib/docFiles"
import { isComposingKey } from "@/lib/keys/ime"
import { fileHref } from "@/lib/codec/mediaLink"
import { FileGlyph } from "@/components/fileIcon/fileTypeIcon"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"
import { imageUploadsOf, UPLOAD_GIVE_UP_MS, uploadStartedAt } from "../image/uploads"
import { useImageUpload } from "../image/components/image-placeholder"
import { ix } from "@/lib/ui/interactive"

/** A PDF is shown in the doc up to this size; a bigger one opens on its own. */
const INLINE_PDF_BYTES = 40 << 20

const BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-ui-sm font-medium text-ink-2 outline-none transition-colors duration-[90ms] hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand max-sm:h-10 [&_svg]:size-3.5"

/** Saves the file, through the member's address or the guest's link (blockActions.ts). */
const download = (src: string, name: string, guest: boolean) => void import("../links-media/blockActions").then((m) => m.downloadFile(src, name, guest))

/**
 * A file in a doc (editor.md P1-10): a video or audio player, a PDF to read in
 * place, or a file with its name, size and a download. While it uploads, the
 * tab that's uploading it shows its progress, and a failure with Try again
 * (small-details E5); anyone else sees that it is on its way.
 */
export function FileBlockView({ node, editor, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const guest = useGuestReader()
  const id = typeof node.attrs.id === "string" ? node.attrs.id : ""
  const upload = useImageUpload(imageUploadsOf(editor, "fileBlock"), id)
  const name = String(node.attrs.name || "File")
  const size = typeof node.attrs.size === "number" ? formatUploadBytes(node.attrs.size) : ""
  // An address that isn't safe to follow is no file at all (a hand-written doc can hold anything).
  const src = typeof node.attrs.src === "string" && fileHref(node.attrs.src) ? node.attrs.src : ""
  const kind = String(node.attrs.kind || "file")
  const ring = selected && "ring-2 ring-brand ring-offset-2 ring-offset-sheet"

  if (!src || upload?.status === "uploading" || upload?.status === "failed") {
    return (
      <NodeViewWrapper data-file-block="" data-file-upload={upload?.status ?? "elsewhere"} contentEditable={false} className="select-none my-1">
        <Uploading
          name={name}
          size={size}
          mime={node.attrs.mime}
          progress={upload?.status === "uploading" ? upload.progress : null}
          failed={upload?.status === "failed"}
          started={uploadStartedAt(id)}
          canEdit={editor.isEditable}
          ring={ring}
          onRetry={() => (src ? retryReplace(editor, id) : editor.commands.retryFileUpload(id))}
          onRemove={() => {
            imageUploadsOf(editor, "fileBlock")?.remove(id)
            if (!src) deleteNode()
          }}
        />
      </NodeViewWrapper>
    )
  }

  const url = viewableFileUrl(src, guest)
  const caption = (
    <Caption value={node.attrs.caption} editable={editor.isEditable} label={`Caption for ${name}`} onChange={(caption) => updateAttributes({ caption: caption || null })} />
  )

  if (kind === "video") {
    return (
      <NodeViewWrapper data-file-block="video" contentEditable={false} className="select-none my-1">
        <figure className={cn("overflow-hidden rounded-[12px]", ring)}>
          <RecoveringMedia kind="video" src={url} label={name} />
        </figure>
        {caption}
      </NodeViewWrapper>
    )
  }

  const head = (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2">
      <FileGlyph name={name} fileType={node.attrs.mime} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui-sm font-medium text-ink">{name}</span>
        {size ? <span className="block text-meta text-ink-3">{size}</span> : null}
      </span>
      {kind === "pdf" ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={BUTTON}>
          <ArrowUpRight aria-hidden="true" />
          Open
        </a>
      ) : null}
      <button type="button" className={BUTTON} onClick={() => download(src, name, guest)} aria-label={`Download ${name}`}>
        <Download aria-hidden="true" />
        <span className="max-sm:sr-only">Download</span>
      </button>
    </div>
  )

  return (
    <NodeViewWrapper data-file-block={kind} contentEditable={false} className="select-none my-1">
      <div className={cn("overflow-hidden rounded-[12px] bg-raised shadow-e1", ring)}>
        {head}
        {kind === "audio" ? <RecoveringMedia kind="audio" src={url} label={name} /> : null}
        {kind === "pdf" ? <PdfView src={src} guest={guest} name={name} tooBig={(node.attrs.size || 0) > INLINE_PDF_BYTES} /> : null}
      </div>
      {kind === "pdf" ? caption : null}
    </NodeViewWrapper>
  )
}

const retryReplace = (editor: NodeViewProps["editor"], id: string) =>
  void import("../links-media/blockActions").then(async (m) => {
    const { docUploadOf } = await import("./fileBlock")
    const upload = docUploadOf(editor)
    if (upload) await m.replaceUpload(editor, id, "fileBlock", upload)
  })

function Uploading(p: {
  name: string
  size: string
  mime?: string | null
  progress: number | null
  failed: boolean
  started: number | null
  canEdit: boolean
  ring: string | false
  onRetry(): void
  onRemove(): void
}) {
  const [now, setNow] = React.useState(() => Date.now())
  const mine = p.progress !== null || p.failed
  const coming = !mine && p.started !== null && now - p.started < UPLOAD_GIVE_UP_MS
  React.useEffect(() => {
    if (mine || !coming || p.started === null) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(1000, p.started + UPLOAD_GIVE_UP_MS - Date.now()))
    return () => clearTimeout(t)
  }, [mine, coming, p.started])
  return (
    <div className={cn("relative overflow-hidden rounded-[12px] bg-sunken", p.ring)}>
      <div className="flex min-h-14 items-center gap-3 px-3 py-2">
        <FileGlyph name={p.name} fileType={p.mime} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui-sm font-medium text-ink">{p.name}</span>
          <span className={cn("flex items-center gap-1.5 text-meta", p.failed ? "text-danger-ink" : "text-ink-3")} role={p.failed ? "alert" : "status"}>
            {p.failed ? <AlertCircle className="size-3.5" aria-hidden="true" /> : mine || coming ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {p.failed ? "Couldn't upload it. Check your connection and try again." : mine || coming ? `Uploading${p.size ? ` · ${p.size}` : ""}…` : "This file didn't finish uploading."}
          </span>
        </span>
        {p.failed ? (
          <button type="button" className={BUTTON} onClick={p.onRetry}>
            <RotateCcw aria-hidden="true" />
            Try again
          </button>
        ) : null}
        {(p.failed || (!mine && !coming)) && p.canEdit ? (
          <button type="button" className={BUTTON} onClick={p.onRemove} aria-label={`Remove ${p.name}`}>
            <Trash2 aria-hidden="true" />
            <span className="max-sm:sr-only">Remove</span>
          </button>
        ) : null}
      </div>
      {p.progress !== null ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-press">
          <div
            role="progressbar"
            aria-label={`Uploading ${p.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.progress * 100)}
            className="h-full origin-left bg-brand transition-transform duration-[160ms] ease-[var(--ease-out)]"
            style={{ transform: `scaleX(${Math.max(0.04, p.progress)})` }}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * A player whose signed address may lapse mid-way: on an error it asks for the
 * file again and picks up where it was.
 */
function RecoveringMedia({ kind, src, label }: { kind: "video" | "audio"; src: string; label: string }) {
  const [attempt, setAttempt] = React.useState(0)
  const at = React.useRef(0)
  const props = {
    key: attempt,
    src: attempt ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src,
    controls: true,
    preload: "metadata",
    "aria-label": label,
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (at.current) e.currentTarget.currentTime = at.current
    },
    onError: (e: React.SyntheticEvent<HTMLMediaElement>) => {
      if (attempt >= 2) return
      at.current = e.currentTarget.currentTime || 0
      setAttempt((a) => a + 1)
    },
  }
  return kind === "video" ? (
    <video {...props} playsInline className="block max-h-[70vh] w-full bg-[#000]" />
  ) : (
    <audio {...props} className="block w-full px-3 pb-3" />
  )
}

/**
 * A PDF read in place: fetched when it nears the screen and shown as a PDF by
 * the browser's own viewer. The stored file is served for download, so it is
 * read as bytes and handed to the viewer typed as a PDF (nothing in it can
 * run as a page). One that can't be fetched, or is too big, says so and leaves
 * Open and Download.
 */
function PdfView({ src, guest, name, tooBig }: { src: string; guest: boolean; name: string; tooBig: boolean }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [near, setNear] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    const el = box.current
    if (!el || tooBig || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" })
    io.observe(el)
    return () => io.disconnect()
  }, [tooBig])

  React.useEffect(() => {
    if (!near) return
    let live = true
    let made: string | null = null
    void (async () => {
      try {
        // Only the doc's own file is read in place: fetching any other address would tell that site who reads the doc.
        const file = docFileOf(src)
        if (!file) throw new Error("not a doc file")
        let from = viewableFileUrl(src, guest)
        if (!guest) {
          const res = await axiosInstance.get<{ url?: string }>(`/doc/getFile/${file.docId}/${file.objectUuid}`, { silent: true, suppressErrorToast: true } as Record<string, unknown>)
          from = res.data?.url || from
        }
        const res = await fetch(from)
        if (!res.ok) throw new Error(String(res.status))
        made = URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: "application/pdf" }))
        if (live) setUrl(made)
      } catch {
        if (live) setFailed(true)
      }
    })()
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [near, src, guest])

  return (
    // Not on a phone: its browser can't show a PDF in the page, so the row's Open and Download are the way in.
    <div ref={box} className="h-[600px] border-t border-line bg-sunken max-sm:hidden">
      {url ? (
        <iframe src={`${url}#view=FitH`} title={name} className="size-full border-0" />
      ) : (
        <p className="flex h-full items-center justify-center gap-2 px-6 text-center text-ui-sm text-ink-3" role={failed ? "alert" : undefined}>
          {failed || tooBig ? null : <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {tooBig ? "This PDF is too big to read here. Open it or download it." : failed ? "This PDF can't be shown here. Open it or download it." : "Loading the PDF…"}
        </p>
      )}
    </div>
  )
}

/** A file's caption, under it: typed in place by an editor, read by everyone else. */
function Caption({ value, editable, label, onChange }: { value: unknown; editable: boolean; label: string; onChange(v: string): void }) {
  const text = typeof value === "string" ? value : ""
  if (!editable) return text ? <p className="mt-1.5 text-center text-meta text-ink-3">{text}</p> : null
  return (
    <input
      type="text"
      aria-label={label}
      placeholder="Add a caption"
      defaultValue={text}
      onBlur={(e) => e.target.value !== text && onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isComposingKey(e.nativeEvent)) (e.target as HTMLInputElement).blur()
      }}
      {...ix("field")}
      className="mt-1.5 w-full select-text rounded-sm bg-transparent text-center text-meta text-ink-3 placeholder:text-ink-3 focus:text-ink"
    />
  )
}
