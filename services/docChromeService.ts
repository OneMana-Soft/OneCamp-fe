// A doc's page chrome (docs programme B6): its look, a doc in the trash as its
// page shows it, and an editor's invites. (What links to it is read by
// components/entityLink/LinkedFromSection, on the doc's first load.) Calls for the
// backend's controllers/Doc/docChromeController.go. Loaded with the pieces
// that use it, never with the doc's first load, so the endpoints live here and
// not in services/endPoints.ts.
//
// Every write corrects the cached answers it changes at once (patchCached) and
// asks for them again after (appMutate), whether it worked or not: the doc's
// own answer, its access, and the lists and tree that name it.

import axiosInstance from "@/lib/axiosInstance"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { docInfoKey } from "@/lib/docCache"
import { refreshDocGraph } from "@/services/docGraphService"
import { DocAccessEndpoint, docAccessKey } from "@/services/docAccessService"
import { PostEndpointUrl } from "@/services/endPoints"
import type { DocInfoResponse } from "@/types/doc"
import type { UserProfileDataInterface } from "@/types/user"
import type { DocAccessChange, DocAccessExplanation } from "@/types/docAccess"
import type { DocLookChange, DocPageFields } from "@/types/docChrome"

const DocChromeEndpoint = {
  Look: "/doc/look",
  Trashed: "/doc/trashed",
  Invite: "/doc/access/invite",
} as const

const unwrap = <T>(res: { data?: { data?: T } }): T => res.data?.data as T

export const trashedKey = (docId: string) => `${DocChromeEndpoint.Trashed}/${docId}`

/** A look change as the doc's own answer holds it: "" takes a field away. Pure. */
export function lookFields(change: Omit<DocLookChange, "doc_uuid">): { set: Partial<DocPageFields>; drop: (keyof DocPageFields)[] } {
  const set: Partial<DocPageFields> = {}
  const drop: (keyof DocPageFields)[] = []
  const text = (v: string | undefined, key: "doc_icon" | "doc_cover_key" | "doc_font") => {
    if (v === undefined) return
    if (v === "") drop.push(key)
    else (set as Record<string, unknown>)[key] = v
  }
  text(change.icon, "doc_icon")
  text(change.cover, "doc_cover_key")
  text(change.font, "doc_font")
  if (change.cover === "") drop.push("doc_cover_offset")
  else if (change.cover_offset !== undefined) set.doc_cover_offset = change.cover_offset
  if (change.full_width !== undefined) set.doc_full_width = change.full_width
  if (change.small_text !== undefined) set.doc_small_text = change.small_text
  return { set, drop }
}

/** Puts a look change into the doc's cached answer, so every view of it shows it at once. */
function patchDocLook(docId: string, change: Omit<DocLookChange, "doc_uuid">) {
  const { set, drop } = lookFields(change)
  patchCached<DocInfoResponse>(docInfoKey(docId), (answer) => {
    if (!answer?.data) return answer
    const data = { ...answer.data, ...set }
    for (const k of drop) delete data[k]
    return { ...answer, data }
  })
}

/** Changes a doc's look: shown at once, then saved; a failure puts the server's back. */
export async function setDocLook(change: DocLookChange): Promise<void> {
  const { doc_uuid, ...rest } = change
  patchDocLook(doc_uuid, rest)
  try {
    await axiosInstance.post(DocChromeEndpoint.Look, change)
  } catch (e) {
    void appMutate(docInfoKey(doc_uuid))
    throw e
  }
  // The tree, the lists and the breadcrumbs show the icon too.
  if (change.icon !== undefined) refreshDocGraph()
}

/** A doc a search found. */
export interface FoundDoc {
  doc_uuid: string
  doc_title: string
  doc_icon?: string
}

/**
 * Docs whose titles or bodies match, as the workspace's search finds them for
 * this person (it leaves out what they can't open): for the Move to dialog.
 */
export async function searchDocs(query: string, signal?: AbortSignal): Promise<FoundDoc[]> {
  const res = await axiosInstance.post("/search/unifiedSearch", { global_search_text: query }, { signal })
  const page: { type?: string; doc?: Partial<FoundDoc> }[] = res?.data?.data?.page ?? res?.data?.page ?? []
  const out: FoundDoc[] = []
  for (const hit of page) {
    const doc = hit?.doc
    if (hit?.type !== "doc" || !doc?.doc_uuid || out.some((d) => d.doc_uuid === doc.doc_uuid)) continue
    out.push({ doc_uuid: doc.doc_uuid, doc_title: doc.doc_title ?? "", doc_icon: doc.doc_icon })
  }
  return out
}

/** People in the workspace by name or email, for sharing and handing a doc on. */
export async function searchPeople(query: string): Promise<UserProfileDataInterface[]> {
  const res = await axiosInstance.post(PostEndpointUrl.SearchUserForDoc, { searchText: query })
  const found = res?.data?.data ?? res?.data
  return Array.isArray(found) ? found : []
}

/** An editor's invite: people and teams added, at their own level or below. */
export async function inviteToDoc(change: Pick<DocAccessChange, "doc_uuid" | "adds">): Promise<DocAccessExplanation> {
  try {
    return unwrap(await axiosInstance.post(DocChromeEndpoint.Invite, change))
  } finally {
    void appMutate((key) => typeof key === "string" && (key === docAccessKey(change.doc_uuid) || key.startsWith(DocAccessEndpoint.Requests)))
    refreshDocGraph()
  }
}
