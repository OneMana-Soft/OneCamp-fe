"use client"

import * as React from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

import { AlertCircle, ImageOff, Link2, Loader2, RotateCcw, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

import { imageUploadsOf, UPLOAD_GIVE_UP_MS, uploadStartedAt, type ImageUpload, type ImageUploads } from "../uploads"
import { keepAsLink, keepRemoteImage, remotePicturesOf, type RemotePicture } from "../remoteImage"

/** The picture this tab is keeping from a link (remoteImage.ts), kept current. */
function useRemotePicture(editor: NodeViewProps["editor"], id: string): RemotePicture | undefined {
  const store = remotePicturesOf(editor)
  return React.useSyncExternalStore(
    React.useCallback((onChange) => (id ? store.subscribe(id, onChange) : () => {}), [store, id]),
    () => store.get(id),
    () => undefined,
  )
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "the link"
  }
}

/** The upload with this id in this tab, kept current. */
export function useImageUpload(uploads: ImageUploads | undefined, id: string): ImageUpload | undefined {
  return React.useSyncExternalStore(
    React.useCallback((onChange) => (uploads && id ? uploads.subscribe(id, onChange) : () => {}), [uploads, id]),
    () => uploads?.get(id),
    () => undefined,
  )
}

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-ui-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand [&_svg]:size-3.5"

/**
 * An image that has no address yet (uploads.ts): the document's placeholder
 * while its upload runs.
 *
 * - In the tab that's uploading it: the picture itself, dimmed, with its
 *   progress; on a failure, why, with Retry and Remove.
 * - Anywhere else: "Uploading…" while the upload can still be going, then
 *   "didn't finish", with Remove for an editor. (An old document's `blob:`
 *   image is one that never finished.)
 */
export function ImagePlaceholder({ editor, node, selected, deleteNode }: NodeViewProps) {
  const id = typeof node.attrs.id === "string" ? node.attrs.id : ""
  const uploads = imageUploadsOf(editor)
  const upload = useImageUpload(uploads, id)
  const remote = useRemotePicture(editor, id)
  const name = String(node.attrs.fileName || node.attrs.title || "image")
  const canEdit = editor.isEditable

  // Another tab's upload: still on its way, until it can't be.
  const startedAt = uploadStartedAt(id)
  const legacyBlob = typeof node.attrs.src === "string" && node.attrs.src.startsWith("blob:")
  const [now, setNow] = React.useState(() => Date.now())
  const stillComing = !legacyBlob && startedAt !== null && now - startedAt < UPLOAD_GIVE_UP_MS
  React.useEffect(() => {
    if (upload || !stillComing || startedAt === null) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(1000, startedAt + UPLOAD_GIVE_UP_MS - Date.now()))
    return () => clearTimeout(t)
  }, [upload, stillComing, startedAt])

  const remove = () => {
    if (id) uploads?.remove(id)
    deleteNode()
  }

  const frame = cn(
    "relative w-full overflow-hidden rounded-[10px] bg-sunken",
    selected && "outline outline-2 outline-offset-1 outline-brand",
  )

  if (upload) {
    const failed = upload.status === "failed"
    const pct = Math.round(upload.progress * 100)
    return (
      <NodeViewWrapper className="relative" data-image-upload={failed ? "failed" : "uploading"} contentEditable={false}>
        <div className={frame}>
          {/* The file itself, from this tab only: the document has no address for it yet. */}
          <img src={upload.preview} alt="" className={cn("mx-auto block max-h-[600px] max-w-full object-contain", failed ? "opacity-30" : "opacity-60")} />
          {failed ? (
            <div role="group" aria-label={`${name} didn't upload`} className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p role="alert" className="flex items-center gap-1.5 text-ui-sm font-medium text-ink">
                <AlertCircle className="size-4 text-danger-ink" aria-hidden="true" />
                Couldn&apos;t upload {name}. {upload.message ?? "Check your connection and try again."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor.commands.retryImageUpload(id)}
                  className={cn(BUTTON, "bg-raised text-ink shadow-e1 hover:bg-hover")}
                >
                  <RotateCcw aria-hidden="true" />
                  Try again
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={remove} className={cn(BUTTON, "text-ink-2 hover:bg-hover hover:text-ink")}>
                  <Trash2 aria-hidden="true" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-4 bottom-4 h-1 overflow-hidden rounded-xs bg-press">
              <div
                role="progressbar"
                aria-label={`Uploading ${name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-full origin-left bg-brand transition-transform duration-[160ms] ease-[var(--ease-out)]"
                style={{ transform: `scaleX(${Math.max(0.04, upload.progress)})` }}
              />
            </div>
          )}
        </div>
      </NodeViewWrapper>
    )
  }

  // A picture typed as a link, on its way into the doc (N28).
  if (remote) {
    const failed = remote.status === "failed"
    return (
      <NodeViewWrapper className="relative" data-image-upload={failed ? "link-failed" : "link"} contentEditable={false}>
        <div className={cn(frame, "flex min-h-24 flex-col items-center justify-center gap-2 p-4 text-center text-ui-sm")}>
          <p role={failed ? "alert" : "status"} className={cn("flex items-center gap-1.5", failed ? "font-medium text-ink" : "text-ink-3")}>
            {failed ? <AlertCircle className="size-4 shrink-0 text-danger-ink" aria-hidden="true" /> : <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {failed ? remote.message || "That picture couldn't be added." : `Keeping the picture from ${hostOf(remote.url)} with the doc…`}
          </p>
          {failed ? (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void keepRemoteImage(editor, id, remote.url, remote.docId)} className={cn(BUTTON, "bg-raised text-ink shadow-e1 hover:bg-hover")}>
                <RotateCcw aria-hidden="true" />
                Try again
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => keepAsLink(editor, id)} className={cn(BUTTON, "text-ink-2 hover:bg-hover hover:text-ink")}>
                <Link2 aria-hidden="true" />
                Keep as a link
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={remove} className={cn(BUTTON, "text-ink-2 hover:bg-hover hover:text-ink")}>
                <Trash2 aria-hidden="true" />
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="relative" data-image-upload={stillComing ? "elsewhere" : "unfinished"} contentEditable={false}>
      <div className={cn(frame, "flex min-h-24 flex-col items-center justify-center gap-2 p-4 text-center text-ui-sm text-ink-3")}>
        {stillComing ? (
          <p role="status" className="flex items-center gap-1.5">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Uploading {name}…
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1.5">
              <ImageOff className="size-4" aria-hidden="true" />
              This image didn&apos;t finish uploading.
            </p>
            {canEdit ? (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={remove} className={cn(BUTTON, "text-ink-2 hover:bg-hover hover:text-ink")}>
                <Trash2 aria-hidden="true" />
                Remove
              </button>
            ) : null}
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}
