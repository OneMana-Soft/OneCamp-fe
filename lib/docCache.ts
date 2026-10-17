import type { Dispatch } from "@reduxjs/toolkit"

import { appMutate, cachedData, patchCached } from "@/lib/swrMutate"
import { docCommentsKey } from "@/lib/docCommentsCache"
import { GetEndpointUrl } from "@/services/endPoints"
import { addUserDoc, removeUserDoc, updateUserDocTitle } from "@/store/slice/userSlice"
import type { DocInfoInterface, DocInfoListInterfaceResp, DocInfoResponse } from "@/types/doc"

/**
 * What a doc's create, rename, delete and share change on screen, in one
 * place. Each wrote to the server and left the rest: a renamed doc kept its
 * old title in the docs list, the phone's bar and the comment page until a
 * reload; a deleted one stayed in the list (and opened to "not found"); a
 * new one wasn't in the list it was made from; and a doc made private stayed
 * under "Shared" (memory: onecamp-swr-seeding — patchCached for an entry
 * that may be on its way, appMutate to ask again, never mutate(key, undefined)).
 */

export const docInfoKey = (docId: string) => `${GetEndpointUrl.GetDocInfo}/${docId}`

// The docs home's lists (/doc/list) answer in the same shape. Named here, not
// imported from services/docGraphService: this module is on the doc's page.
const LIST_PATHS: string[] = [GetEndpointUrl.GetUserPrivateDocList, GetEndpointUrl.GetUserPublicDocList, "/doc/list"]

/** A level of the page tree (/doc/children), whose rows are { uuid, title }. */
const isTreeKey = (key: string) => key.startsWith("/doc/children?")
type TreeAnswer = { data?: { nodes?: { uuid?: string; title?: string }[]; count?: number } }
const patchTree = (docId: string, change: (n: { uuid?: string; title?: string }) => object | null) =>
    patchCached<TreeAnswer>(isTreeKey, (a) => {
        const nodes = a?.data?.nodes
        if (!nodes?.some((n) => n.uuid === docId)) return a
        const next = nodes.flatMap((n) => (n.uuid === docId ? [change(n)].filter(Boolean) : [n])) as typeof nodes
        return { ...a, data: { ...a.data, nodes: next, count: Math.max(0, (a.data?.count ?? nodes.length) - (nodes.length - next.length)) } }
    })

/** A page of a docs list (private, shared, or the docs home's), any page and size. */
function isDocListKey(key: string): boolean {
    return LIST_PATHS.some((path) => key === path || key.startsWith(`${path}?`) || key.startsWith(`${path}/`))
}

/** Changes one doc wherever a docs list page has it; the same page when none does. */
function patchListedDoc(page: DocInfoListInterfaceResp, docId: string, change: (doc: DocInfoInterface) => DocInfoInterface | null): DocInfoListInterfaceResp {
    const docs = page?.data?.docs
    if (!docs?.some((d) => d.doc_uuid === docId)) return page
    const next: DocInfoInterface[] = []
    for (const d of docs) {
        if (d.doc_uuid !== docId) next.push(d)
        else {
            const changed = change(d)
            if (changed) next.push(changed)
        }
    }
    const removed = docs.length - next.length
    return { ...page, data: { ...page.data, docs: next, count: Math.max(0, (page.data.count ?? docs.length) - removed) } }
}

const withInfo = (docId: string, change: (doc: DocInfoInterface) => DocInfoInterface) =>
    patchCached<DocInfoResponse>(docInfoKey(docId), (answer) => (answer?.data ? { ...answer, data: change(answer.data as DocInfoInterface) } : answer))

/** Ask again for every docs list page (where a doc goes, or which list, is the server's to say). */
const refetchLists = () => void appMutate((key: unknown) => typeof key === "string" && isDocListKey(key))

/**
 * Whether a page made inside this doc is sent as private: as the doc is, when
 * the caller knows it (a tree's row says), else as the doc's info in the cache
 * says (its page has it), else private. The server makes a subpage as private
 * as its parent whatever it's told, but one without nested pages (v2.72) makes
 * it at the top, open to the whole workspace unless it's told it is private.
 */
export function subpagePrivate(parentId: string, known?: boolean): boolean {
    return known ?? cachedData<DocInfoResponse>(docInfoKey(parentId))?.data?.doc_private ?? true
}

export function docCreated(dispatch: Dispatch, doc: { doc_uuid: string; doc_title: string }) {
    dispatch(addUserDoc({ doc: { doc_uuid: doc.doc_uuid, doc_title: doc.doc_title } }))
    refetchLists()
}

export function docRenamed(dispatch: Dispatch, docId: string, title: string) {
    dispatch(updateUserDocTitle({ doc_uuid: docId, doc_title: title }))
    withInfo(docId, (doc) => (doc.doc_title === title ? doc : { ...doc, doc_title: title }))
    patchCached<DocInfoResponse>(docCommentsKey(docId), (answer) =>
        answer?.data && answer.data.doc_title !== title ? { ...answer, data: { ...answer.data, doc_title: title } } : answer,
    )
    patchCached<DocInfoListInterfaceResp>(isDocListKey, (page) =>
        patchListedDoc(page, docId, (doc) => (doc.doc_title === title ? doc : { ...doc, doc_title: title })),
    )
    patchTree(docId, (n) => (n.title === title ? n : { ...n, title }))
}

export function docDeleted(dispatch: Dispatch, docId: string) {
    dispatch(removeUserDoc({ doc_uuid: docId }))
    patchCached<DocInfoListInterfaceResp>(isDocListKey, (page) => patchListedDoc(page, docId, () => null))
    patchTree(docId, () => null)
}

/** A doc came back from the trash: ask again for it, its comments and the lists it belongs in. */
export function docRestored(docId: string) {
    void appMutate(docInfoKey(docId))
    void appMutate(docCommentsKey(docId))
    refetchLists()
}

/** Who can open the doc changed: its access answers, and which list it's in. */
export function docShared(docId: string, access?: { doc_private: boolean; doc_public_comment: boolean }) {
    if (access) {
        withInfo(docId, (doc) =>
            doc.doc_private === access.doc_private && doc.doc_public_comment === access.doc_public_comment ? doc : { ...doc, ...access },
        )
        refetchLists()
    }
    // Not the permissions answer: the share dialog keeps it current itself
    // (asked for again while open, it would undo a change still on its way).
    void appMutate(docInfoKey(docId))
    void appMutate(docCommentsKey(docId))
}
