/**
 * What the history sheet asks of the server: keep a version, name or pin one,
 * restore one. Each says its own failure in place (the sheet, the confirm), so
 * the global toast stays quiet, and each throws an Error whose message is the
 * server's words (what happened and what to do), never a status code.
 */

import axiosInstance from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { VERSIONS_URL, versionNameUrl, versionRestoreUrl, versionsKey, type DocVersion, type VersionList } from "./versions"

async function post<T>(url: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  try {
    const res = await axiosInstance.post(url, body, { suppressErrorToast: true })
    return res.data?.data as T
  } catch (e) {
    throw new Error(apiErrorMessage(e, fallback))
  }
}

/** Keeps the doc as it is now; a named version is kept until someone unnames it. */
export function saveVersion(docId: string, name: string): Promise<DocVersion> {
  return post<DocVersion>(VERSIONS_URL, { doc_uuid: docId, name: name.trim(), pinned: false }, "The version wasn't saved. Try again in a moment.")
}

/** Names a version and pins or unpins it ("" unnames it). */
export function nameVersion(docId: string, versionId: string, name: string, pinned: boolean): Promise<void> {
  return post<void>(versionNameUrl(versionId), { doc_uuid: docId, name: name.trim(), pinned }, "That change to the version wasn't saved. Try again in a moment.")
}

/** Makes a version the doc, live, for everyone; the doc as it was is kept first. */
export function restoreVersion(docId: string, versionId: string): Promise<void> {
  return post<void>(versionRestoreUrl(versionId), { doc_uuid: docId }, "The doc wasn't restored. Nothing changed; try again in a moment.")
}

/** The page of versions before a cursor (a long history, a page at a time). */
export async function earlierVersions(docId: string, before: string): Promise<VersionList> {
  try {
    const res = await axiosInstance.get(versionsKey(docId, before), { suppressErrorToast: true })
    return (res.data?.data ?? { versions: [], people: {} }) as VersionList
  } catch (e) {
    throw new Error(apiErrorMessage(e, "Earlier versions didn't load. Try again in a moment."))
  }
}
