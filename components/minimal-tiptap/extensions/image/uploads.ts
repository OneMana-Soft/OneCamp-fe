"use client"

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"

import { randomId } from "../../utils"

/**
 * IMAGES ON THEIR WAY UP.
 *
 * An image used to go into the document with a `blob:` address while its
 * upload ran, and the address changed to the uploaded one when it finished.
 * The document is shared: collaborators received an address only the author's
 * tab could open, their own copies tried to upload it again and failed, and if
 * the author's upload failed or the tab closed first, the `blob:` address was
 * saved for good, a broken image for everyone.
 *
 * Now the document only ever holds a placeholder: an image node with no
 * address yet and an upload id in its `id`. Everything about the upload (the
 * file, a local preview, the progress, a failure) stays in this tab, in the
 * editor's storage, and the node gets its real address in one step when the
 * upload finishes. A failed upload keeps its placeholder, with Retry and
 * Remove, for its author. No `blob:` value is ever written to the document.
 *
 * The id says when the upload started ("up-<ms>-<rand>"), so another tab can
 * tell an image still on its way from one whose upload never finished.
 */

/** "done": the node has its address; the preview stays until the real image has loaded. */
export type ImageUploadStatus = "uploading" | "failed" | "done"

export interface ImageUpload {
  id: string
  file: File
  /** A local preview of the file. This tab's only: never in the document. */
  preview: string
  /** 0 to 1. */
  progress: number
  status: ImageUploadStatus
}

export interface ImageUploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** What an upload function returns: the address, or the address and the stored object's id. */
export type ImageUploadResult = string | { id: string | number; src: string }

export type ImageUploadFn = (file: File, editor: Editor, options?: ImageUploadOptions) => Promise<ImageUploadResult>

/**
 * Thrown by an upload function for a file that can never go up (over the
 * workspace's limit, say): there is nothing to retry, so its placeholder goes.
 * The upload function has already told the person why.
 */
export class ImageNotUploadable extends Error {
  readonly permanent = true
}

const UPLOAD_ID = /^up-([0-9a-z]+)-/

/** A new upload id, carrying when the upload started. */
export function newUploadId(now = Date.now()): string {
  return `up-${now.toString(36)}-${randomId()}`
}

/** When the upload with this id started, or null for an id that isn't an upload's. */
export function uploadStartedAt(id: unknown): number | null {
  const m = typeof id === "string" ? UPLOAD_ID.exec(id) : null
  if (!m) return null
  const at = parseInt(m[1], 36)
  return Number.isFinite(at) ? at : null
}

/**
 * How long another tab waits for an upload it can't see before it says the
 * upload didn't finish. Generous: a large image on a slow connection.
 */
export const UPLOAD_GIVE_UP_MS = 5 * 60_000

/**
 * An image node that is still a placeholder: no address of its own yet. (An
 * old document may hold a `blob:` address from before; it is a placeholder
 * too, one that can never finish.)
 */
export function isImagePlaceholder(attrs: { src?: unknown }): boolean {
  const src = attrs.src
  return typeof src !== "string" || src.trim() === "" || src.startsWith("blob:")
}

/** This tab's uploads, by upload id. One per editor (the image extension's storage). */
export class ImageUploads {
  private uploads = new Map<string, ImageUpload>()
  private listeners = new Map<string, Set<() => void>>()
  private aborts = new Map<string, AbortController>()

  get(id: string | null | undefined): ImageUpload | undefined {
    return id ? this.uploads.get(id) : undefined
  }

  /** Calls `fn` when the upload with this id changes; returns the unsubscribe. */
  subscribe(id: string, fn: () => void): () => void {
    const set = this.listeners.get(id) ?? new Set()
    set.add(fn)
    this.listeners.set(id, set)
    return () => {
      set.delete(fn)
      if (!set.size) this.listeners.delete(id)
    }
  }

  add(file: File, id = newUploadId()): ImageUpload {
    const upload: ImageUpload = { id, file, preview: URL.createObjectURL(file), progress: 0, status: "uploading" }
    this.uploads.set(id, upload)
    this.notify(id)
    return upload
  }

  update(id: string, patch: Partial<Pick<ImageUpload, "progress" | "status">>) {
    const current = this.uploads.get(id)
    if (!current) return
    this.uploads.set(id, { ...current, ...patch })
    this.notify(id)
  }

  /** A fresh abort signal for the upload's next attempt. */
  attempt(id: string): AbortSignal {
    this.aborts.get(id)?.abort()
    const controller = new AbortController()
    this.aborts.set(id, controller)
    return controller.signal
  }

  /** Forgets an upload: its request is abandoned and its preview freed. */
  remove(id: string) {
    const upload = this.uploads.get(id)
    this.aborts.get(id)?.abort()
    this.aborts.delete(id)
    if (!upload) return
    this.uploads.delete(id)
    URL.revokeObjectURL(upload.preview)
    this.notify(id)
  }

  /** Whether any upload is still running: leaving now would lose it. */
  pending(): boolean {
    for (const u of this.uploads.values()) if (u.status === "uploading") return true
    return false
  }

  destroy() {
    for (const id of [...this.uploads.keys()]) this.remove(id)
    this.listeners.clear()
  }

  private notify(id: string) {
    for (const fn of this.listeners.get(id) ?? []) fn()
  }
}

/** The editor's uploads, when its image extension (or the node type's, by editor: fileBlock.ts) keeps them. */
export function imageUploadsOf(editor: Editor | null | undefined, type = "image"): ImageUploads | undefined {
  const s = (editor?.storage as Record<string, { uploads?: ImageUploads; byEditor?: WeakMap<Editor, ImageUploads> }> | undefined)?.[type]
  return s?.uploads ?? (editor ? s?.byEditor?.get(editor) : undefined)
}

/** Whether the editor still has an image or a file uploading (the leave guard asks). */
export function hasPendingImageUploads(editor: Editor | null | undefined): boolean {
  return !!(imageUploadsOf(editor)?.pending() || imageUploadsOf(editor, "fileBlock")?.pending())
}

/** The position of the image (or the type's) node with this id, or null. */
export function findImageById(doc: PMNode, id: string, type = "image"): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === type && node.attrs.id === id) {
      found = { pos, node }
      return false
    }
    return true
  })
  return found
}

const addressOf = (res: ImageUploadResult): string => (typeof res === "string" ? res : res.src)

/**
 * Runs (or runs again) the upload for one placeholder, and gives the node its
 * address when it finishes. Positions move while an upload is in flight, so
 * the node is found again by its id; if it is gone (deleted meanwhile), the
 * result is dropped.
 */
export async function runImageUpload(editor: Editor, uploadId: string, uploadFn: ImageUploadFn, type = "image"): Promise<void> {
  const uploads = imageUploadsOf(editor, type)
  const upload = uploads?.get(uploadId)
  if (!uploads || !upload) return
  uploads.update(uploadId, { status: "uploading", progress: 0 })
  const signal = uploads.attempt(uploadId)
  try {
    const src = addressOf(
      await uploadFn(upload.file, editor, {
        signal,
        onProgress: (fraction) => uploads.update(uploadId, { progress: Math.max(0, Math.min(1, fraction)) }),
      }),
    )
    if (signal.aborted || editor.isDestroyed) return
    // An address only this tab can open is the very thing never to share.
    if (!src || src.startsWith("blob:") || src.startsWith("data:")) throw new Error("the upload returned no address")
    const at = findImageById(editor.state.doc, uploadId, type)
    if (!at) {
      uploads.remove(uploadId)
      return
    }
    // One step: the placeholder becomes the image. It keeps its id (unique,
    // and how the node view finds the preview). Not added to undo: undoing a
    // typed word must not turn an uploaded image back into a placeholder.
    const tr = editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, src }).setMeta("addToHistory", false)
    editor.view.dispatch(tr)
    // The node view shows the preview until the real image has loaded, then
    // lets it go (uploads.remove).
    uploads.update(uploadId, { status: "done", progress: 1 })
  } catch (error) {
    if (signal.aborted || editor.isDestroyed) return
    if (error instanceof ImageNotUploadable) {
      // Nothing to try again: the placeholder goes, quietly (not an undo step).
      const at = findImageById(editor.state.doc, uploadId, type)
      if (at) editor.view.dispatch(editor.state.tr.delete(at.pos, at.pos + at.node.nodeSize).setMeta("addToHistory", false))
      uploads.remove(uploadId)
      return
    }
    uploads.update(uploadId, { status: "failed" })
  }
}

/** The placeholder node for one upload: an image with no address yet. */
export function placeholderContent(upload: Pick<ImageUpload, "id" | "file">) {
  return {
    type: "image",
    attrs: { id: upload.id, src: null, title: upload.file.name, fileName: upload.file.name },
  }
}

/**
 * Starts the uploads for placeholders just put in the document. After the
 * current transaction: a command's own transaction is dispatched when the
 * command returns, and the upload finds its node in the editor's state.
 */
export function startImageUploads(editor: Editor, ids: string[], uploadFn: ImageUploadFn, type = "image") {
  queueMicrotask(() => {
    if (editor.isDestroyed) return
    for (const id of ids) void runImageUpload(editor, id, uploadFn, type)
  })
}
