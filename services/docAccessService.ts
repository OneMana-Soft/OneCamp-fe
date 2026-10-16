// Who may do what with a doc: my level and why, the sharing panel and its
// changes, handing a doc on, an admin's recovery, the lock, and asking for
// access. Calls for the backend's controllers/Doc/docAccessController.go (docs
// programme A5), and the cache keys their answers live under.
//
// Every write asks again for the answers it changes (appMutate): a change to
// who may open a doc moves the doc's access, its requests, and the lists and
// tree that name it.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { refreshDocGraph } from "@/services/docGraphService"
import type {
  DocAccess,
  DocAccessChange,
  DocAccessExplanation,
  DocAccessRequest,
  DocAccessRequests,
  DocLock,
} from "@/types/docAccess"

/** The access endpoints. */
export const DocAccessEndpoint = {
  Access: "/doc/access",
  Update: "/doc/access/update",
  Preview: "/doc/access/preview",
  Transfer: "/doc/access/transfer",
  Request: "/doc/access/request",
  Answer: "/doc/access/answer",
  Requests: "/doc/access/requests",
  Lock: "/doc/lock",
  Recover: "/admin/docs/recover",
} as const

interface Envelope<T> {
  msg?: string
  data?: T
}

const unwrap = <T>(res: { data?: Envelope<T> }): T => res.data?.data as T

/** My access to a doc. */
export const docAccessKey = (docId: string) => `${DocAccessEndpoint.Access}/${docId}`

/** The requests I answer (on one doc, or every doc I have full access to) and my own. */
export const accessRequestsKey = (docId?: string) =>
  docId ? `${DocAccessEndpoint.Requests}?doc_uuid=${encodeURIComponent(docId)}` : DocAccessEndpoint.Requests

/** Asks again for everything a change to a doc's access moves. */
function refreshAccess(docId: string) {
  void appMutate((key) => typeof key === "string" && (key === docAccessKey(docId) || key.startsWith(DocAccessEndpoint.Requests)))
  refreshDocGraph()
}

export async function getDocAccess(docId: string): Promise<DocAccess> {
  return unwrap(await axiosInstance.get(docAccessKey(docId)))
}

/**
 * What a change would do, before it is made. Its asker says a failure itself
 * (the share dialog asks anyway), so the app's toast stays quiet.
 */
export async function previewDocAccess(change: DocAccessChange): Promise<DocAccessExplanation> {
  return unwrap(await axiosInstance.post(DocAccessEndpoint.Preview, change, OWN_ERRORS))
}

/** Makes a change: for the doc's owner and full access. */
export async function updateDocAccess(change: DocAccessChange): Promise<DocAccessExplanation> {
  try {
    return unwrap(await axiosInstance.post(DocAccessEndpoint.Update, change))
  } finally {
    refreshAccess(change.doc_uuid)
  }
}

/** Hands a doc to someone else in the workspace; its owner keeps full access. */
export async function transferDoc(docId: string, toUserId: string): Promise<void> {
  try {
    await axiosInstance.post(DocAccessEndpoint.Transfer, { doc_uuid: docId, to_user_uuid: toUserId })
  } finally {
    refreshAccess(docId)
  }
}

/** An admin takes over a doc, or hands it to someone, saying why. */
export async function recoverDoc(docId: string, reason: string, toUserId?: string): Promise<void> {
  try {
    await axiosInstance.post(DocAccessEndpoint.Recover, { doc_uuid: docId, reason, to_user_uuid: toUserId })
  } finally {
    refreshAccess(docId)
  }
}

/** Sets or lifts a doc's lock. */
export async function lockDoc(docId: string, lock: DocLock): Promise<Pick<DocAccess, "lock" | "locked" | "level">> {
  try {
    return unwrap(await axiosInstance.post(DocAccessEndpoint.Lock, { doc_uuid: docId, lock: lock || "none" }))
  } finally {
    refreshAccess(docId)
  }
}

/** Asks a doc's owner for access. */
export async function requestDocAccess(docId: string, level: DocAccessRequest["level_wanted"] = "view", note = ""): Promise<DocAccessRequest> {
  try {
    return unwrap(await axiosInstance.post(DocAccessEndpoint.Request, { doc_uuid: docId, level, note }))
  } finally {
    void appMutate((key) => typeof key === "string" && key.startsWith(DocAccessEndpoint.Requests))
  }
}

/** Approves a request (at the level asked for, or another, until a date) or declines it. */
export async function answerDocAccess(
  request: Pick<DocAccessRequest, "id" | "doc_uuid">,
  answer: { approve: boolean; level?: DocAccessRequest["level_granted"]; until?: string },
): Promise<DocAccessRequest> {
  try {
    return unwrap(await axiosInstance.post(DocAccessEndpoint.Answer, { request_id: request.id, ...answer }))
  } finally {
    refreshAccess(request.doc_uuid)
  }
}

export async function getAccessRequests(docId?: string): Promise<DocAccessRequests> {
  return unwrap(await axiosInstance.get(accessRequestsKey(docId)))
}
