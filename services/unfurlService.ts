import axiosInstance from "@/lib/axiosInstance"

// Link previews and pictures kept from a link, read by the workspace's own
// server (GET /unfurl, POST /unfurl/store; the API's business/Unfurl, docs
// programme B4). A preview that can't be read is a card that says why, never
// an error: the doc shows a plain link. Every call here is quiet (no loading
// bar, no error toast); the block that asked says what happened.
//
// The paths live here until the integrator moves them into
// services/endPoints.ts (append-only, edited at merge).

export const UNFURL_URL = "/unfurl"
export const UNFURL_EMBEDS_URL = "/unfurl/embeds"
export const UNFURL_STORE_URL = "/unfurl/store"

/** A link's preview, as the server read it. */
export interface LinkCard {
  url: string
  title?: string
  description?: string
  site_name?: string
  /** Where the site's icon and picture are: never loaded from there, only kept (storeFromLink). */
  icon_url?: string
  image_url?: string
  kind?: string
  provider?: string
  author?: string
  fetched: boolean
  /** Why it wasn't read: blocked, unreachable, timeout, not_html, bad_status or sign_in. */
  reason?: string
}

const quiet = { silent: true, suppressErrorToast: true } as Record<string, unknown>

/** The link's preview card; a card with fetched false when the server couldn't read it or couldn't be reached. */
export async function unfurlLink(url: string, signal?: AbortSignal): Promise<LinkCard> {
  try {
    const res = await axiosInstance.get<{ data?: LinkCard }>(UNFURL_URL, { params: { url }, signal, ...quiet })
    return res.data?.data ?? { url, fetched: false }
  } catch (e) {
    if (signal?.aborted) throw e
    return { url, fetched: false, reason: "unreachable" }
  }
}

/** The hosts an admin added to the sites a doc may embed; null when the server couldn't be asked. */
export async function adminEmbedHosts(): Promise<string[] | null> {
  try {
    const res = await axiosInstance.get<{ data?: { hosts?: string[] } }>(UNFURL_EMBEDS_URL, quiet)
    return res.data?.data?.hosts ?? []
  } catch {
    return null
  }
}

/** A picture kept with a doc. */
export interface StoredPicture {
  object_uuid: string
  file_name: string
  content_type: string
  size: number
}

/** Why a picture wasn't kept, in the server's words (what happened and what to do). */
export class NotStored extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message)
  }
}

/**
 * Keeps the picture at a link with the doc, fetched once by the server, so
 * readers load it from this workspace and never from the site. Throws NotStored.
 */
export async function storeFromLink(docId: string, url: string, kind: "image" | "icon", signal?: AbortSignal): Promise<StoredPicture> {
  try {
    const res = await axiosInstance.post<{ data?: StoredPicture }>(UNFURL_STORE_URL, { doc_uuid: docId, url, kind }, { signal, ...quiet })
    if (!res.data?.data?.object_uuid) throw new NotStored("The picture couldn't be added. Try again in a moment.", "error")
    return res.data.data
  } catch (e) {
    if (e instanceof NotStored || signal?.aborted) throw e
    const data = (e as { response?: { data?: { msg?: string; reason?: string } } })?.response?.data
    throw new NotStored(data?.msg || "Your server couldn't be reached. Check your connection and try again.", data?.reason || "unreachable")
  }
}
