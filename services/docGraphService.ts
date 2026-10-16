// The doc graph: the page tree, the doc lists, the trash and places (stars
// and pins). Calls for the backend's controllers/Doc/{docTreeController,
// docListController,placesController}.go, the cache keys their answers live
// under, and the docs tree's adapter for components/tree.
//
// Every write corrects the cached answers it changes (patchCached) or asks
// for them again (appMutate); none leaves a list behind.

import type { Dispatch } from "@reduxjs/toolkit"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { docRenamed } from "@/lib/docCache"
import { PostEndpointUrl } from "@/services/endPoints"
import { appMutate, patchCached } from "@/lib/swrMutate"
import type { TreeAdapter, TreeLevel, TreeNode } from "@/components/tree/useTree"
import type { TreeMove } from "@/components/tree/treeDnd"
import type {
  DocAncestors,
  DocChildren,
  DocCreateRequest,
  DocDeleteResult,
  DocDuplicateResult,
  DocList,
  DocListScope,
  DocListSort,
  DocMovePreview,
  DocMoveRequest,
  DocMoveResult,
  DocMoveTarget,
  DocRestoreResult,
  DocSpace,
  DocTrash,
  Place,
  PlaceKind,
  TreeNodeJSON,
} from "@/types/docGraph"
import type { DocInfoInterface } from "@/types/doc"

/** The doc graph's endpoints. */
export const DocGraphEndpoint = {
  Children: "/doc/children",
  Ancestors: "/doc/ancestors",
  Move: "/doc/move",
  MovePreview: "/doc/move/preview",
  List: "/doc/list",
  Create: "/doc/createDoc",
  Delete: "/doc/delete",
  Trash: "/doc/trash",
  Restore: "/doc/restore",
  Purge: "/doc/purge",
  Duplicate: "/doc/duplicate",
  Places: "/places",
} as const

/** An answer: { msg, data }. */
export interface Envelope<T> {
  msg?: string
  data?: T
}

const unwrap = <T>(res: { data?: Envelope<T> }): T => res.data?.data as T

/** A write's options. ownErrors: the caller says a failure itself, so the app's toast stays quiet. */
export interface WriteOptions {
  ownErrors?: boolean
}

const configOf = (opts?: WriteOptions) => (opts?.ownErrors ? OWN_ERRORS : undefined)

// Cache keys

/** One level of the tree: a page's children, or the top of a space. */
export function childrenKey(parent: string | null, opts: { space?: DocSpace; limit?: number } = {}): string {
  const q = new URLSearchParams()
  if (parent) q.set("parent", parent)
  else q.set("space", opts.space ?? "workspace")
  if (opts.limit) q.set("limit", String(opts.limit))
  return `${DocGraphEndpoint.Children}?${q.toString()}`
}

/** The path down to a page. */
export const ancestorsKey = (docId: string) => `${DocGraphEndpoint.Ancestors}/${docId}`

/** One page of one list. */
export function listKey(scope: DocListScope, opts: { sort?: DocListSort; owner?: string; space?: DocSpace; cursor?: string; limit?: number } = {}): string {
  const q = new URLSearchParams({ scope })
  if (opts.sort) q.set("sort", opts.sort)
  if (opts.owner) q.set("owner", opts.owner)
  if (opts.space) q.set("space", opts.space)
  if (opts.cursor) q.set("cursor", opts.cursor)
  if (opts.limit) q.set("limit", String(opts.limit))
  return `${DocGraphEndpoint.List}?${q.toString()}`
}

export const trashKey = (cursor?: string) => (cursor ? `${DocGraphEndpoint.Trash}?cursor=${encodeURIComponent(cursor)}` : DocGraphEndpoint.Trash)

export const placesKey = (kind: PlaceKind = "star", resourceKind?: string) =>
  `${DocGraphEndpoint.Places}?kind=${kind}${resourceKind ? `&resource_kind=${encodeURIComponent(resourceKind)}` : ""}`

const startsWith = (prefix: string) => (key: unknown) => typeof key === "string" && key.startsWith(prefix)

/** After a change to which docs exist or where they are: the tree, paths, lists and the trash, read again. */
export function refreshDocGraph() {
  const graph = [DocGraphEndpoint.Children, DocGraphEndpoint.Ancestors, DocGraphEndpoint.List, DocGraphEndpoint.Trash]
  void appMutate((key) => graph.some((p) => startsWith(p)(key)))
}

// Reads

export async function getChildren(parent: string | null, opts: { space?: DocSpace; limit?: number } = {}): Promise<DocChildren> {
  return unwrap(await axiosInstance.get(childrenKey(parent, opts)))
}

export async function getAncestors(docId: string): Promise<DocAncestors> {
  return unwrap(await axiosInstance.get(ancestorsKey(docId)))
}

export async function getDocList(scope: DocListScope, opts: Parameters<typeof listKey>[1] = {}): Promise<DocList> {
  return unwrap(await axiosInstance.get(listKey(scope, opts)))
}

export async function getTrash(cursor?: string): Promise<DocTrash> {
  return unwrap(await axiosInstance.get(trashKey(cursor)))
}

export async function getPlaces(kind: PlaceKind = "star", resourceKind?: string): Promise<Place[]> {
  return unwrap<{ places: Place[] }>(await axiosInstance.get(placesKey(kind, resourceKind)))?.places ?? []
}

// Writes

export async function moveDoc(req: DocMoveRequest): Promise<DocMoveResult> {
  try {
    return unwrap<DocMoveResult>(await axiosInstance.post(DocGraphEndpoint.Move, req))
  } finally {
    refreshDocGraph()
  }
}

export async function previewDocMove(req: DocMoveRequest): Promise<DocMovePreview> {
  return unwrap(await axiosInstance.post(DocGraphEndpoint.MovePreview, req))
}

export async function createDoc(req: DocCreateRequest): Promise<DocInfoInterface> {
  const doc = unwrap<DocInfoInterface>(await axiosInstance.post(DocGraphEndpoint.Create, req))
  refreshDocGraph()
  return doc
}

/** Moves a page and everything under it to the trash; restoring it undoes that. */
export async function deleteDoc(docId: string, opts?: WriteOptions): Promise<DocDeleteResult> {
  const out = unwrap<DocDeleteResult>(await axiosInstance.post(DocGraphEndpoint.Delete, { doc_uuid: docId }, configOf(opts)))
  refreshDocGraph()
  return out
}

/** Brings back a page with what was deleted (or archived) with it. */
export async function restoreDoc(docId: string, opts?: WriteOptions): Promise<DocRestoreResult> {
  const out = unwrap<DocRestoreResult>(await axiosInstance.post(DocGraphEndpoint.Restore, { doc_uuid: docId }, configOf(opts)))
  refreshDocGraph()
  return out
}

/**
 * Renames a doc (POST /doc/updateDoc) and puts the new title everywhere it
 * shows: the sidebar, the doc's cached answers. The one rename path for the
 * breadcrumb, the title dialog and the page.
 */
export async function renameDoc(dispatch: Dispatch, docId: string, title: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.UpdateDoc, { doc_uuid: docId, doc_title: title })
  docRenamed(dispatch, docId, title)
}

export async function purgeDoc(docId: string, opts?: WriteOptions): Promise<number> {
  const out = unwrap<{ purged: number }>(await axiosInstance.post(DocGraphEndpoint.Purge, { doc_uuid: docId }, configOf(opts)))
  refreshDocGraph()
  return out?.purged ?? 0
}

export async function duplicateDoc(docId: string, withChildren: boolean, opts?: WriteOptions): Promise<DocDuplicateResult> {
  const out = unwrap<DocDuplicateResult>(await axiosInstance.post(DocGraphEndpoint.Duplicate, { doc_uuid: docId, with_children: withChildren }, configOf(opts)))
  refreshDocGraph()
  return out
}

const placesOfKind = (kind: PlaceKind) => (key: unknown) => startsWith(`${DocGraphEndpoint.Places}?kind=${kind}`)(key) || startsWith(listKey("starred"))(key)

/** Stars or pins a thing, after another of the same kind, or last. */
export async function addPlace(kind: PlaceKind, resourceKind: string, resourceId: string, afterId?: string, opts?: WriteOptions): Promise<Place> {
  try {
    return unwrap<Place>(await axiosInstance.post(DocGraphEndpoint.Places, { kind, resource_kind: resourceKind, resource_uuid: resourceId, after_uuid: afterId }, configOf(opts)))
  } finally {
    void appMutate(placesOfKind(kind))
  }
}

/** Takes a star or pin away: gone from the cached lists at once. */
export async function removePlace(kind: PlaceKind, resourceId: string, opts?: WriteOptions): Promise<void> {
  patchCached<Envelope<{ places: Place[] }>>(
    (key) => key.startsWith(`${DocGraphEndpoint.Places}?kind=${kind}`),
    (data) => {
      const places = data?.data?.places
      if (!places?.some((p) => p.resource_uuid === resourceId)) return data
      return { ...data, data: { ...data.data, places: places.filter((p) => p.resource_uuid !== resourceId) } }
    },
  )
  try {
    await axiosInstance.delete(`${DocGraphEndpoint.Places}?kind=${kind}&resource_uuid=${encodeURIComponent(resourceId)}`, configOf(opts))
  } finally {
    void appMutate(placesOfKind(kind))
  }
}

// The docs tree, for components/tree

/** A row of the docs tree: the tree's fields, and the page as the server sent it. */
export interface DocTreeRow extends TreeNode {
  node: TreeNodeJSON
}

const toRow = (node: TreeNodeJSON): DocTreeRow => ({ id: node.uuid ?? "", title: node.title ?? "", hasChildren: node.has_children, canEdit: node.can_edit, node })

/** What a children key names: a parent, or the top of a space. */
function childrenOf(key: string): { parent: string | null; space: string } | null {
  if (!key.startsWith(`${DocGraphEndpoint.Children}?`)) return null
  const q = new URLSearchParams(key.slice(DocGraphEndpoint.Children.length + 1))
  return { parent: q.get("parent"), space: q.get("space") ?? "workspace" }
}

/** A move in the docs tree of space, as the server reads it. Pure. */
export function treeMoveTarget(m: TreeMove, space: DocSpace): DocMoveTarget {
  return {
    doc_uuid: m.id,
    ...(m.to ? { parent_uuid: m.to } : { space }),
    ...(m.after ? { after_uuid: m.after } : { place: m.place ?? "last" }),
  }
}

/**
 * The docs tree's adapter: its levels are GET /doc/children answers, a move is
 * POST /doc/move. space is the section its top level shows. A move keeps the
 * page's own access; one that would change who can open it is asked about
 * before it is sent (planMove, in DocTree).
 */
export function docTreeAdapter(space: DocSpace = "workspace"): TreeAdapter<DocTreeRow, Envelope<DocChildren>> {
  return {
    key: (parent, limit) => childrenKey(parent, { space, limit }),
    isKey: (key, parent) => {
      const k = childrenOf(key)
      if (!k) return false
      if (parent === undefined) return true
      return parent === null ? !k.parent && k.space === space : k.parent === parent
    },
    read: (data): TreeLevel<DocTreeRow> => {
      const level = data?.data
      const nodes = (level?.nodes ?? []).filter((n) => n.uuid && !n.redacted)
      return { nodes: nodes.map(toRow), hidden: level?.hidden ?? 0, count: level?.count ?? nodes.length }
    },
    write: (data, nodes, countDelta) => {
      if (!data?.data) return data
      return { ...data, data: { ...data.data, nodes: nodes.map((n) => n.node), count: Math.max(0, (data.data.count ?? 0) + countDelta) } }
    },
    move: async (m) => {
      await axiosInstance.post(DocGraphEndpoint.Move, { ...treeMoveTarget(m, space), access: "keep" } satisfies DocMoveRequest)
    },
  }
}
