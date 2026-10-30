/**
 * A doc's "Anyone with the link" grant, published as a web page (docs programme
 * C6, D-25). One external-access model: publishing is an option of the link,
 * with the link's own expiry and revoke, under the workspace's guest-access
 * switch. The page itself is the server's, script-free, for a view link by its
 * token (/public/d/<token>) or its published address (/public/p/<slug>); the
 * web's /guest/d/<token> and /p/<slug> send the browser there.
 *
 * This module is the rest: publishing a link (its owner, in the share dialog's
 * "Anyone with the link" card), a password page's unlock (a public call, with
 * no session and no cookie), and a copy of a page into a member's own docs.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall, type PublicResult } from "@/services/publicApi"
import type { ResourceGuestLink } from "@/services/guestService"

/** How a page is reached: its published address, or its link's token. */
export type PageRef = { slug: string } | { token: string }

/** What publishing sends: every setting, so a change to one keeps the rest. */
export interface PublishSettings {
  /** The address; empty keeps the one there (or, the first time, makes one from the title). */
  slug?: string
  indexable: boolean
  allow_copies: boolean
  /** Left out keeps the password there; "" takes it off; anything else sets it. */
  password?: string
}

const backend = () => (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")

/** Publishes a doc's view link as a web page, or changes how: the link as it is now. */
export async function publishLink(linkId: string, settings: PublishSettings): Promise<ResourceGuestLink> {
  const res = await axiosInstance.put(`/guest/links/${encodeURIComponent(linkId)}/publish`, settings, OWN_ERRORS)
  return res.data.data as ResourceGuestLink
}

/** Takes a link's page off the web, at once; the link itself keeps working. */
export async function unpublishLink(linkId: string): Promise<ResourceGuestLink> {
  const res = await axiosInstance.delete(`/guest/links/${encodeURIComponent(linkId)}/publish`, OWN_ERRORS)
  return res.data.data as ResourceGuestLink
}

/** A published link's settings, to send back with a change to some of them. Pure. */
export function settingsOf(link: ResourceGuestLink, change: Partial<PublishSettings> = {}): PublishSettings {
  return { slug: link.slug, indexable: !!link.indexable, allow_copies: !!link.allow_copies, ...change }
}

/** Copies a page into the signed-in member's own docs: the copy's id. */
export async function copyPublishedPage(ref: PageRef, k?: string | null): Promise<string> {
  const res = await axiosInstance.post(`/guest/links/copy`, { ...ref, ...(k ? { k } : {}) }, OWN_ERRORS)
  return res.data.doc_uuid as string
}

/** A page's path on the server. Pure. */
export function pagePath(ref: PageRef): string {
  return "slug" in ref ? `/public/p/${encodeURIComponent(ref.slug)}` : `/public/d/${encodeURIComponent(ref.token)}`
}

/** The page itself, on the server; with a password page's unlock. Pure but for the build's address. */
export function pageAddress(ref: PageRef, k?: string | null): string {
  return `${backend()}${pagePath(ref)}${k ? `?k=${encodeURIComponent(k)}` : ""}`
}

export interface Unlocked {
  token: string
  /** The page, opened by the unlock. */
  url: string
  expires_in: number
}

/** What a published address answers now (docs C6): a live page, a password page, an expired one, or none. */
export type PageState = "live" | "locked" | "gone" | "missing"

/** Asks what an address answers, without the page: a public call, with no session and no cookie. */
export function pageState(slug: string): Promise<PublicResult<{ state: PageState }>> {
  return publicCall<{ state: PageState }>(`${pagePath({ slug })}/state`, { credentials: "omit" })
}

/** A password page's unlock for its password: a public call, with no session and no cookie. */
export function unlockPage(ref: PageRef, password: string): Promise<PublicResult<Unlocked>> {
  return publicCall<Unlocked>(`${pagePath(ref)}/unlock`, {
    method: "POST",
    body: JSON.stringify({ password }),
    credentials: "omit",
  })
}

/** An address as typed, as the server keeps it: lower case, words joined by dashes, at most 64 (business/Guest). Pure. */
export function tidySlug(typed: string): string {
  let out = ""
  let dash = false
  for (const ch of typed.trim().toLowerCase()) {
    if (out.length >= 64) break
    if (/[a-z0-9]/.test(ch)) {
      out += ch
      dash = false
    } else if (/[\s\-_./]/.test(ch) && out && !dash) {
      out += "-"
      dash = true
    }
  }
  return out.replace(/^-+|-+$/g, "")
}
