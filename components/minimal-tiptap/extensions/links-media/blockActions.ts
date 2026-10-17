"use client"

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import axiosInstance from "@/lib/axiosInstance"
import { toast } from "@/hooks/use-toast"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { docFileOf, viewableFileUrl } from "@/lib/docFiles"
import { isSafeHref } from "@/lib/utils/safeHref"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { ImageNotUploadable, findImageById, imageUploadsOf, refusalOf, type ImageUploadFn } from "../image/uploads"
import { docUploadOf, fileKindOf, pickFiles } from "../file-block/fileBlock"
import { uploadLimitNow } from "../file-block/uploadLimit"
import { fillPreview } from "../smart-paste/linkActions"
import { trackPos } from "../smart-paste/smartPaste"
import { blocksWithIds, type BlockAt } from "../block-commands/blockIds"
import { blockAt } from "./contrib"

export type BlockActionId = "replace" | "crop" | "alt" | "link" | "refresh" | "toBookmark" | "toEmbed" | "toLink" | "open" | "download"

/** The picture a dialog works on (crop, alt text, link), handed over by the action that opened it. */
let pending: { editor: Editor; at: ReturnType<typeof trackPos>; mode: "alt" | "link" } | null = null

/** The picture a crop or words dialog was opened for. */
interface PendingImage {
  /** The picture as the dialog opened on it: what the dialog shows first. */
  node: PMNode
  mode: "alt" | "link"
  /** Sets attributes on the picture wherever it is now; when it's gone, says that this (what) wasn't saved. */
  save(attrs: Record<string, unknown>, what: string): void
  /** The dialog has closed. */
  done(): void
}

/** The picture the crop or words dialog was opened for, if it is still there. */
export function takePendingImage(): PendingImage | null {
  const p = pending
  pending = null
  if (!p) return null
  const pos = p.at.pos()
  const node = pos === null ? null : p.editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "image") {
    p.at.stop()
    return null
  }
  const { editor, at } = p
  return {
    node,
    mode: p.mode,
    save(attrs, what) {
      const now = pictureNow(editor, at.pos(), node)
      if (!now) {
        toast({ title: `Couldn't save the ${what}`, description: "The picture was deleted while you were editing it.", variant: "destructive" })
        return
      }
      editor.view.dispatch(editor.state.tr.setNodeMarkup(now.pos, undefined, { ...now.node.attrs, ...attrs }))
    },
    done: at.stop,
  }
}

/**
 * Where a picture is now, while its dialog was open. Another person's change
 * comes in as the whole doc replaced (y-prosemirror), which no position
 * survives, so it's found by its block id; one with no id yet is where its
 * position was followed to.
 */
function pictureNow(editor: Editor, followed: number | null, was: PMNode): BlockAt | null {
  const { doc } = editor.state
  const id = was.attrs.blockId
  let at: BlockAt | null = null
  if (typeof id === "string" && id) at = blocksWithIds(doc, [id])[0] ?? null
  else if (followed !== null) {
    const node = doc.nodeAt(followed)
    at = node ? { pos: followed, node } : null
  }
  return at?.node.type.name === "image" ? at : null
}

/** The block replaced by a paragraph holding its link. */
function toLink(editor: Editor, pos: number, node: PMNode) {
  const href = String(node.attrs.href || node.attrs.src || "")
  if (!isSafeHref(href)) return
  const { schema } = editor.state
  const text = String(node.attrs.title || href)
  editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, schema.nodes.paragraph.create(null, schema.text(text, [schema.marks.link.create({ href })]))))
}

/**
 * Replaces a picture or a file in place: the new one uploads while the old one
 * stays, with its progress on it, and takes its place in one step. One that
 * can't go up (over the limit) leaves the old one as it was.
 */
export async function replaceUpload(editor: Editor, id: string, type: "image" | "fileBlock", upload: ImageUploadFn) {
  const uploads = imageUploadsOf(editor, type)
  const u = uploads?.get(id)
  if (!uploads || !u) return
  uploads.update(id, { status: "uploading", progress: 0, message: undefined })
  const signal = uploads.attempt(id)
  try {
    const res = await upload(u.file, editor, { signal, onProgress: (f) => uploads.update(id, { progress: Math.max(0, Math.min(1, f)) }) })
    const src = typeof res === "string" ? res : res.src
    if (signal.aborted || editor.isDestroyed) return
    const at = findImageById(editor.state.doc, id, type)
    if (!at || !src) return void uploads.remove(id)
    const file = type === "fileBlock" ? { name: u.file.name, size: u.file.size, mime: u.file.type || null, kind: fileKindOf(u.file) } : { crop: null, width: null, height: null, fileName: u.file.name }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, src, ...file }))
    uploads.update(id, { status: "done", progress: 1 })
    if (type === "fileBlock") uploads.remove(id)
  } catch (e) {
    if (signal.aborted || editor.isDestroyed) return
    if (e instanceof ImageNotUploadable) uploads.remove(id)
    else uploads.update(id, { status: "failed", message: refusalOf(e) })
  }
}

async function replace(editor: Editor, pos: number, node: PMNode) {
  const image = node.type.name === "image"
  const [file] = await pickFiles(image ? "image/*" : "", false)
  const upload = docUploadOf(editor)
  if (!file || !upload || editor.isDestroyed) return
  const limit = uploadLimitNow()
  if (limit && exceedsUploadLimit(file.size, limit.bytes)) {
    toast({ title: image ? "Image too large" : "File too large", description: uploadLimitMessage(file.size, limit.mb, file.name), variant: "destructive" })
    return
  }
  const type = image ? "image" : "fileBlock"
  const uploads = imageUploadsOf(editor, type)
  if (!uploads) return
  const u = uploads.add(file)
  // The node keeps its address until the new one has one; its id says which upload is its.
  const at = editor.state.doc.nodeAt(pos) === node ? pos : null
  if (at === null) return void uploads.remove(u.id)
  editor.view.dispatch(editor.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, id: u.id }).setMeta("addToHistory", false))
  await replaceUpload(editor, u.id, type, upload)
}

/** Saves a doc's file under its name: through the member's file address, or the guest's link. */
export async function downloadFile(src: string, name: string, guest = false) {
  const file = docFileOf(src)
  let url = viewableFileUrl(src, guest)
  try {
    if (file && !guest) url = (await axiosInstance.get<{ url?: string }>(`/doc/getFile/${file.docId}/${file.objectUuid}`, { silent: true } as Record<string, unknown>)).data?.url || url
    const blob = await (await fetch(url)).blob()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = name || "file"
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
  } catch {
    if (isSafeHref(url)) window.open(url, "_blank", "noopener,noreferrer")
  }
}

/** Runs a block action from the block menu (contrib.ts). */
export function runBlockAction(id: BlockActionId, ctx: ActionContext) {
  const b = blockAt(ctx)
  if (!b) return
  const { editor, pos, node } = b
  const href = String(node.attrs.href || node.attrs.src || "")
  switch (id) {
    case "replace":
      return void replace(editor, pos, node)
    case "crop":
    case "alt":
    case "link":
      pending?.at.stop()
      pending = { editor, at: trackPos(editor, pos, 1), mode: id === "crop" ? "alt" : id }
      return ctx.bus.emit("openDialog", { id: id === "crop" ? "media.crop" : "media.text" })
    case "refresh":
      return void fillPreview(editor, trackPos(editor, pos, 1), href)
    // The same block, as the other kind: it keeps its id (and what is anchored to it).
    case "toBookmark": {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, editor.schema.nodes.bookmark, { blockId: node.attrs.blockId, href }))
      return void fillPreview(editor, trackPos(editor, pos, 1), href)
    }
    case "toEmbed":
      return void editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, editor.schema.nodes.webEmbed, { blockId: node.attrs.blockId, src: href }))
    case "toLink":
      return toLink(editor, pos, node)
    case "open":
      if (/^https?:\/\//i.test(href) && isSafeHref(href)) window.open(href, "_blank", "noopener,noreferrer")
      return
    case "download":
      return void downloadFile(href, String(node.attrs.fileName || node.attrs.name || node.attrs.alt || ""))
  }
}
