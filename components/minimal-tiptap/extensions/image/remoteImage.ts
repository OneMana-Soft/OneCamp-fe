"use client"

import type { Editor } from "@tiptap/core"
import { docFileUrl } from "@/lib/docFiles"
import { storeFromLink } from "@/services/unfurlService"
import { findImageById } from "./uploads"

/**
 * A picture typed as a link, ![alt](https://…), on its way into the doc
 * (N28): the server fetches it once (POST /unfurl/store) and keeps it as the
 * doc's own upload, and the image gets that address in one step. Until then
 * the document holds the image with no address, as an upload's placeholder
 * does (uploads.ts), and this tab knows where it's from. A link the server
 * can't keep says why on the picture, with Try again, Keep as a link and
 * Remove.
 */

export interface RemotePicture {
  url: string
  docId: string
  status: "saving" | "failed"
  /** The server's words for why it wasn't kept. */
  message?: string
}

/** This tab's pictures on their way from a link, by the image's id. */
class RemotePictures {
  private items = new Map<string, RemotePicture>()
  private listeners = new Map<string, Set<() => void>>()

  get(id: string): RemotePicture | undefined {
    return this.items.get(id)
  }

  set(id: string, p: RemotePicture | null) {
    if (p) this.items.set(id, p)
    else this.items.delete(id)
    for (const fn of this.listeners.get(id) ?? []) fn()
  }

  subscribe(id: string, fn: () => void): () => void {
    const set = this.listeners.get(id) ?? new Set()
    set.add(fn)
    this.listeners.set(id, set)
    return () => set.delete(fn)
  }
}

/** The editor's pictures on their way from a link, made on first use. */
export function remotePicturesOf(editor: Editor): RemotePictures {
  const storage = editor.storage.image as { remote?: RemotePictures }
  return (storage.remote ??= new RemotePictures())
}

/** Fetches the picture at url into the doc, and gives the image with this id its address. */
export async function keepRemoteImage(editor: Editor, id: string, url: string, docId: string): Promise<void> {
  const pictures = remotePicturesOf(editor)
  pictures.set(id, { url, docId, status: "saving" })
  try {
    const stored = await storeFromLink(docId, url, "image")
    if (editor.isDestroyed) return
    const at = findImageById(editor.state.doc, id)
    pictures.set(id, null)
    if (!at) return
    const src = docFileUrl(docId, stored.object_uuid)
    editor.view.dispatch(editor.state.tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, src, fileName: stored.file_name }).setMeta("addToHistory", false))
  } catch (e) {
    if (editor.isDestroyed) return
    pictures.set(id, { url, docId, status: "failed", message: e instanceof Error ? e.message : undefined })
  }
}

/** Keeps the link as a link instead: the picture's words, linked, where the picture was. */
export function keepAsLink(editor: Editor, id: string) {
  const pictures = remotePicturesOf(editor)
  const p = pictures.get(id)
  const at = findImageById(editor.state.doc, id)
  pictures.set(id, null)
  if (!p || !at) return
  const text = (at.node.attrs.alt as string) || p.url
  const para = editor.schema.nodes.paragraph.create(null, editor.schema.text(text, [editor.schema.marks.link.create({ href: p.url })]))
  editor.view.dispatch(editor.state.tr.replaceWith(at.pos, at.pos + at.node.nodeSize, para))
}
