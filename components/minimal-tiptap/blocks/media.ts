"use client"

/**
 * Images, and files dropped or pasted, in every editor. An image is never
 * kept in the text as a data: address: it uploads (the host's upload when it
 * has one, else the public attachments), and one pasted inside HTML is moved
 * out to storage too (OffloadEmbeddedImages).
 */

import type { Editor } from "@tiptap/core"
import { Image as ImageIcon } from "@/lib/icons"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostFileUploadURL } from "@/services/endPoints"
import type { UploadFileInterfaceRes } from "@/types/file"
import { registerBlock } from "@/components/docEditor/registry/registry"
import type { BlockContext } from "@/components/docEditor/registry/types"
import { Image } from "../extensions/image/image"
import type { ImageUploadOptions } from "../extensions/image/uploads"
import { FileHandler } from "../extensions/file-handler"
import { OffloadEmbeddedImages } from "../extensions/offload-embedded-images/offloadEmbeddedImages"
import { EVERY_EDITOR, ORDER, SLASH_ORDER } from "./kinds"

const publicUrl = (objectUuid: string) => `${process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || ""}${GetEndpointUrl.PublicAttachmentURL}/${objectUuid}`

/** The default upload: a public attachment. Never falls back to embedding the bytes. */
async function uploadPublic(ctx: BlockContext, file: File, options?: ImageUploadOptions): Promise<{ id: string; src: string }> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("jsonData", JSON.stringify({ src_key: "public" }))
  try {
    const res = await axiosInstance.post<UploadFileInterfaceRes>(PostFileUploadURL.UploadFile, formData, {
      signal: options?.signal,
      onUploadProgress: (e) => {
        if (e.total) options?.onProgress?.(e.loaded / e.total)
      },
    })
    return { id: res.data.object_uuid, src: publicUrl(res.data.object_uuid) }
  } catch (error) {
    // NEVER embed the image as a base64 data URI on failure: the bytes would
    // be stored in the body and indexed as text (one such doc stopped the
    // search node). A failed image the author can retry is far better.
    console.error("Default image upload failed", error)
    ctx.toast({ title: "Couldn’t add the image", description: "The upload didn’t go through. Check your connection and try again.", variant: "destructive" })
    throw error instanceof Error ? error : new Error("image upload failed")
  }
}

// Each goes in as a placeholder and uploads (image/uploads.ts), never as a
// blob: address; other files become file blocks, in a doc. A drop lands
// between blocks, never splitting a line: after the line, or before a
// top-level one when on its start.
function place(editor: Editor, files: File[], pos?: number) {
  const $p = pos === undefined ? null : editor.state.doc.resolve(pos)
  if ($p?.parent.isTextblock && $p.depth) pos = !$p.parentOffset && $p.depth === 1 ? $p.before() : $p.after()
  const images = files.filter((f) => f.type.startsWith("image/"))
  if (images.length) editor.commands.insertImageFiles(images, pos)
  const rest = files.filter((f) => !f.type.startsWith("image/"))
  if (rest.length) (editor.commands as { insertFileBlocks?: (f: File[], p?: number) => boolean }).insertFileBlocks?.(rest, pos)
}

registerBlock({
  id: "image",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.image,
  create: (ctx) => [
    Image.configure({
      allowedMimeTypes: ["image/*"],
      // One cap, the workspace's, checked by the upload itself (N27).
      maxFileSize: 0,
      allowBase64: true,
      uploadFn: async (file, _editor, options) => (ctx.uploadFnRef?.current ? ctx.uploadFnRef.current(file, options) : uploadPublic(ctx, file, options)),
      onValidationError(errors) {
        errors.forEach((error) => ctx.toast({ title: "Image validation error", description: error.reason, variant: "destructive" }))
      },
    }),
  ],
  schema: [{ kind: "node", name: "image", attrs: ["align", "alt", "caption", "crop", "fileName", "height", "href", "id", "src", "title", "width"] }],
  slash: [
    {
      id: "image",
      title: "Image",
      description: "Upload or embed an image",
      aliases: ["img", "picture", "photo", "upload"],
      icon: ImageIcon,
      section: "Media and embeds",
      tint: "bg-camp-sky-tint text-camp-sky-ink ring-0",
      order: SLASH_ORDER.image,
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).toggleImage().run()
      },
    },
  ],
  // It breaks out of the reading column (styles/index.css "What is wide").
  wide: true,
})

registerBlock({
  id: "fileHandler",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.fileHandler,
  create: (ctx) => [
    FileHandler.configure({
      allowBase64: true,
      // A doc takes any file (a file block); the server checks what it is.
      allowedMimeTypes: ctx.allowedMimeTypes ?? (ctx.kind === "doc" ? [] : ["image/*"]),
      maxFileSize: 0,
      onDrop: (editor, files, pos) => (ctx.onActionFilesRef?.current ? ctx.onActionFilesRef.current(files, pos) : place(editor, files, pos)),
      onPaste: (editor, files) => (ctx.onActionFilesRef?.current ? ctx.onActionFilesRef.current(files) : place(editor, files)),
      onValidationError: (errors) => {
        errors.forEach((error) => ctx.toast({ title: "Image validation error", description: error.reason, variant: "destructive" }))
      },
    }),
  ],
  schema: [],
})

// Images that arrive INSIDE pasted HTML (<img src="data:…">) never touch the
// upload path: moved out to storage here, in every editor, through the
// editor's own upload.
registerBlock({
  id: "offloadImages",
  editors: EVERY_EDITOR,
  edition: "both",
  order: ORDER.offloadImages,
  create: (ctx) => [
    OffloadEmbeddedImages.configure({
      upload: async (file: File) => {
        if (ctx.uploadFnRef?.current) return (await ctx.uploadFnRef.current(file)).src
        const formData = new FormData()
        formData.append("file", file)
        formData.append("jsonData", JSON.stringify({ src_key: "public" }))
        const res = await axiosInstance.post<UploadFileInterfaceRes>(PostFileUploadURL.UploadFile, formData)
        return publicUrl(res.data.object_uuid)
      },
      onError: (message: string) => {
        ctx.toast({ title: "Image stayed embedded", description: message, variant: "destructive" })
      },
    }),
  ],
  schema: [],
})
