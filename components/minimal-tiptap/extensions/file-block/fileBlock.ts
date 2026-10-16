"use client"

import { Node, mergeAttributes, type Editor } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { TextSelection } from "@tiptap/pm/state"
import { toast } from "@/hooks/use-toast"
import { exceedsUploadLimit, uploadLimitMessage } from "@/lib/utils/uploadLimit"
import { FILE_KINDS } from "@/lib/codec/mediaLink"
import { lazyNodeView } from "../lazyNodeView"
import { dataAttr, linkChildren } from "../link/dataAttr"
import { ImageUploads, findImageById, imageUploadsOf, runImageUpload, startImageUploads, type ImageUploadFn } from "../image/uploads"
import { uploadLimitNow } from "./uploadLimit"

const FileBlockView = lazyNodeView(() => import("./file-block-view").then((m) => m.FileBlockView), 56)

export type FileKind = "file" | "video" | "audio" | "pdf"

/** What a file is drawn as: a player for video and audio, a viewer for a PDF, else a file chip. Pure. */
export function fileKindOf(file: { type?: string; name?: string }): FileKind {
  const t = (file.type || "").toLowerCase()
  if (t.startsWith("video/")) return "video"
  if (t.startsWith("audio/")) return "audio"
  if (t === "application/pdf" || /\.pdf$/i.test(file.name || "")) return "pdf"
  return "file"
}

/** What a picker for a kind accepts. */
export const ACCEPT: Record<FileKind, string> = { video: "video/*", audio: "audio/*", pdf: "application/pdf,.pdf", file: "" }

/** The doc's upload: the image extension's, which the doc's page gives (its attachments). */
export function docUploadOf(editor: Editor): ImageUploadFn | undefined {
  return editor.extensionManager.extensions.find((e) => e.name === "image")?.options.uploadFn as ImageUploadFn | undefined
}

/** Opens the browser's file picker; resolves with what was picked (nothing when it was closed). */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = multiple
    if (accept) input.accept = accept
    input.onchange = () => resolve(Array.from(input.files || []))
    input.click()
  })
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileBlock: {
      /** Puts each file in as a block with no address yet at pos, and uploads it. */
      insertFileBlocks: (files: File[], pos?: number) => ReturnType
      /** Tries a failed upload again. */
      retryFileUpload: (id: string) => ReturnType
    }
  }
}

interface FileBlockStorage {
  /**
   * This tab's uploads (by the block's id, never in the document), for each
   * editor. Tiptap 2 gives an extension instance one storage, shared by every
   * editor built with it, and this block loads lazily: one instance for every
   * editor. Uploads kept in the storage itself were every editor's, and one
   * editor going (a doc left, the doc beside it closed) forgot the others'.
   */
  byEditor: WeakMap<Editor, ImageUploads>
}

/**
 * A file in a doc (editor.md P1-10): a video or audio player, a PDF viewer, or
 * a file chip with its name, size and a download. It uploads as an image does
 * (image/uploads.ts): the document holds the block with no address while the
 * file goes up, the progress and a failure (with Try again) show in the tab
 * that is uploading it, and the address arrives in one step. A file over the
 * workspace's upload limit is refused before anything is sent, with the
 * limit's message (N27).
 */
export const FileBlock = Node.create<Record<string, never>, FileBlockStorage>({
  name: "fileBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { byEditor: new WeakMap() }
  },

  onBeforeCreate() {
    this.storage.byEditor.set(this.editor, new ImageUploads())
  },

  onDestroy() {
    this.storage.byEditor.get(this.editor)?.destroy()
  },

  addAttributes() {
    return {
      kind: {
        default: "file",
        parseHTML: (el) => {
          const k = el.getAttribute("data-kind") || ""
          return FILE_KINDS.includes(k) ? k : "file"
        },
        renderHTML: (attrs) => ({ "data-kind": FILE_KINDS.includes(attrs.kind) ? attrs.kind : "file" }),
      },
      src: dataAttr("src", "data-src"),
      id: dataAttr("id", "data-id"),
      name: dataAttr("name", "data-name"),
      size: dataAttr("size", "data-size", true),
      mime: dataAttr("mime", "data-mime"),
      caption: dataAttr("caption", "data-caption"),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "file" }, HTMLAttributes), ...linkChildren("fileBlock", node.attrs)]
  },

  addCommands() {
    return {
      insertFileBlocks:
        (files, pos) =>
        ({ tr, dispatch, commands, editor }) => {
          const upload = docUploadOf(editor)
          const limit = uploadLimitNow()
          const fit = files.filter((f) => {
            if (!limit || !exceedsUploadLimit(f.size, limit.bytes)) return true
            toast({ title: "File too large", description: uploadLimitMessage(f.size, limit.mb, f.name), variant: "destructive" })
            return false
          })
          const uploads = imageUploadsOf(editor, this.name)
          if (!upload || !uploads || !fit.length) return false
          if (!dispatch) return true
          const added = fit.map((file) => uploads.add(file))
          const nodes = added.map((u) => ({
            type: this.name,
            attrs: { id: u.id, src: null, name: u.file.name, size: u.file.size, mime: u.file.type || null, kind: fileKindOf(u.file) },
          }))
          if (!commands.insertContentAt(pos ?? tr.selection.from, nodes, { updateSelection: false })) {
            for (const u of added) uploads.remove(u.id)
            return false
          }
          // The caret goes after the files, so the next key types there.
          const last = findImageById(tr.doc, added[added.length - 1].id, this.name)
          if (last) {
            const after = last.pos + last.node.nodeSize
            try {
              if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, editor.schema.nodes.paragraph.create())
              tr.setSelection(TextSelection.create(tr.doc, after + 1))
            } catch {
              // Somewhere a paragraph can't go: the selection stays put.
            }
          }
          startImageUploads(editor, added.map((u) => u.id), upload, this.name)
          return true
        },

      retryFileUpload:
        (id) =>
        ({ editor }) => {
          const upload = docUploadOf(editor)
          if (!upload || !imageUploadsOf(editor, this.name)?.get(id)) return false
          void runImageUpload(editor, id, upload, this.name)
          return true
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockView)
  },
})
