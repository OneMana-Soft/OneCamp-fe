// Docs & Files (docs F1): the calls that put files, folders and links in the
// doc tree, and colour its rows. Folders and links are made as a page is
// (createDoc v2, with node_kind); a file is uploaded into a folder or the top
// of a space, and replaced by a new version. A version's bytes come through
// the doc's file route (GET /doc/getFile/{file}/{attachment}), unchanged.
//
// Every write corrects the cached tree levels and lists it changes, or asks
// for them again (refreshDocGraph), as the doc graph's own writes do; an
// upload leaves that to its batch (uploadFiles).

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { subpagePrivate } from "@/lib/docCache"
import { patchCached, appMutate } from "@/lib/swrMutate"
import { DocGraphEndpoint, createDoc, refreshDocGraph, type Envelope } from "@/services/docGraphService"
import { GetEndpointUrl } from "@/services/endPoints"
import type { CampHue } from "@/lib/campHue"
import type { DocChildren, DocColor, DocColorRequest, DocCreateRequest, DocFileVersion, DocFileVersions, DocList, DocSpace, TreeNodeJSON } from "@/types/docGraph"
import type { DocInfoInterface } from "@/types/doc"

export const DocFilesEndpoint = {
  Files: "/doc/files",
  Color: "/doc/color",
} as const

/** The most nodes one colour write takes (the server's cap). */
export const COLOR_BATCH = 200

/** A file's versions, newest first. */
export const versionsKey = (fileId: string) => `${DocFilesEndpoint.Files}/${fileId}/versions`

/** Where one version's address is asked for: it answers { url }, signed for a few minutes. */
export const versionFileKey = (fileId: string, attachmentId: string) => `${GetEndpointUrl.GetDocMedia}/${fileId}/${attachmentId}`

const unwrap = <T>(res: { data?: Envelope<T> }): T => res.data?.data as T

/** Where an upload goes: a folder (or a page), or the top of a space; after a sibling, or last. */
export interface UploadPlace {
  parent?: string
  space?: DocSpace
  after?: string
}

interface UploadOptions {
  /** 0 to 100 as the bytes go. */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

const progressOf = (onProgress?: (percent: number) => void) =>
  onProgress ? (e: { loaded: number; total?: number }) => onProgress(Math.min(100, Math.round((e.loaded / (e.total || e.loaded || 1)) * 100))) : undefined

/**
 * The form an upload sends (POST /doc/files), in createDoc v2's names: the
 * file, and where it goes, a parent or a space, never both. Pure, so a test
 * reads what is sent.
 */
export function uploadForm(file: File, place: UploadPlace): FormData {
  const form = new FormData()
  form.append("file", file)
  if (place.parent) form.append("parent_uuid", place.parent)
  else form.append("space", place.space ?? "private")
  if (place.after) form.append("after_uuid", place.after)
  return form
}

/**
 * Uploads one file into a folder or the top of a space: the server makes its
 * node and records the file as its first version, or makes nothing. Its
 * failure is the caller's to say (an upload row says it in place), and so is
 * reading the tree again: uploadFiles does it once for a whole batch.
 */
export async function uploadDocFile(file: File, place: UploadPlace, opts: UploadOptions = {}): Promise<TreeNodeJSON> {
  return unwrap<TreeNodeJSON>(await axiosInstance.post(DocFilesEndpoint.Files, uploadForm(file, place), { ...OWN_ERRORS, signal: opts.signal, onUploadProgress: progressOf(opts.onProgress) }))
}

/** The form "Replace with a new version" sends: the file, and the note when there is one. Pure. */
export function versionForm(file: File, note?: string): FormData {
  const form = new FormData()
  form.append("file", file)
  const said = note?.trim()
  if (said) form.append("note", said)
  return form
}

/**
 * Replace with a new version: the file's next version, with what changed. Its
 * versions, its row (name, size, how many) and the lists are read again.
 */
export async function uploadDocFileVersion(fileId: string, file: File, note?: string, opts: UploadOptions = {}): Promise<DocFileVersion> {
  try {
    return unwrap<DocFileVersion>(await axiosInstance.post(versionsKey(fileId), versionForm(file, note), { ...OWN_ERRORS, signal: opts.signal, onUploadProgress: progressOf(opts.onProgress) }))
  } finally {
    void appMutate(versionsKey(fileId))
    refreshDocGraph()
  }
}

/** A file's versions, newest first; [] when the answer has none. */
export const versionsOf = (answer: Envelope<DocFileVersions> | undefined): DocFileVersion[] => answer?.data?.versions ?? []

const isChildrenKey = (key: string) => key.startsWith(`${DocGraphEndpoint.Children}?`)
const isListKey = (key: string) => key.startsWith(`${DocGraphEndpoint.List}?`)

/** A tree row in a new colour; null takes the colour away. Pure. */
export function withColor(node: TreeNodeJSON, color: DocColor): TreeNodeJSON {
  if (color === null) {
    if (!node.color) return node
    const { color: _gone, ...rest } = node
    void _gone
    return rest
  }
  return node.color === color ? node : { ...node, color }
}

/** The cached tree levels and lists with these nodes in their new colour, at once. */
function showColor(ids: ReadonlySet<string>, color: DocColor) {
  const hue: CampHue | undefined = color ?? undefined
  patchCached<Envelope<DocChildren>>(isChildrenKey, (answer) => {
    const nodes = answer?.data?.nodes
    if (!nodes?.some((n) => n.uuid && ids.has(n.uuid) && n.color !== hue)) return answer
    return { ...answer, data: { ...answer.data!, nodes: nodes.map((n) => (n.uuid && ids.has(n.uuid) ? withColor(n, color) : n)) } }
  })
  patchCached<Envelope<DocList>>(isListKey, (answer) => {
    const docs = answer?.data?.docs
    if (!docs?.some((d) => ids.has(d.doc_uuid) && d.doc_color !== hue)) return answer
    return { ...answer, data: { ...answer.data!, docs: docs.map((d) => (ids.has(d.doc_uuid) ? { ...d, doc_color: hue } : d)) } }
  })
}

/**
 * Colours nodes (POST /doc/color, at most 200 a write): shown at once, then
 * sent; the tree and lists are read again either way, so a refusal puts them
 * back as the server has them. Its failure is the caller's to say.
 */
export async function colorDocs(ids: readonly string[], color: DocColor): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  showColor(new Set(unique), color)
  try {
    for (let at = 0; at < unique.length; at += COLOR_BATCH) {
      const req: DocColorRequest = { doc_uuids: unique.slice(at, at + COLOR_BATCH), color }
      await axiosInstance.post(DocFilesEndpoint.Color, req, OWN_ERRORS)
    }
  } finally {
    refreshDocGraph()
  }
}

/** Where a folder or a link is made: inside a node, or at the top of a space. */
export interface NodePlace {
  parentId?: string
  /** That node's privacy, when the caller knows it (a tree row): the new one is sent as that. */
  parentPrivate?: boolean
  space?: DocSpace
}

/**
 * The request a folder or a link is made with (createDoc v2). doc_private as
 * a page's is: its parent's inside one, private unless at the workspace's top.
 * Pure.
 */
export function nodeRequest(kind: "folder" | "link", title: string, place: NodePlace, linkUrl?: string): DocCreateRequest {
  const doc_title = title.trim()
  const base: DocCreateRequest = place.parentId
    ? { doc_title, parent_uuid: place.parentId, doc_private: subpagePrivate(place.parentId, place.parentPrivate) }
    : { doc_title, space: place.space ?? "private", doc_private: (place.space ?? "private") !== "workspace" }
  return kind === "link" ? { ...base, node_kind: "link", link_url: linkUrl } : { ...base, node_kind: "folder" }
}

/** Makes a folder. The server takes its parent's access for it, as for a page. */
export async function createFolder(title: string, place: NodePlace): Promise<DocInfoInterface> {
  return createDoc(nodeRequest("folder", title, place))
}

/** Adds a link (https only). Its title, if left empty, comes from the site once the server has read it. */
export async function createLink(url: string, title: string, place: NodePlace): Promise<DocInfoInterface> {
  return createDoc(nodeRequest("link", title, place, url))
}
