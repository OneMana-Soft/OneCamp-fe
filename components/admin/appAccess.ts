import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorStatus } from "@/lib/utils/apiError"

/**
 * An installed app as an identity, as Admin › Apps shows it (platform P-API,
 * design/platform/API_CONTRACT.md §3.1; the server's business/App). An app
 * acts as its own user and never with an admin's powers. Its scopes are the
 * most any of its tokens may carry; its places are where those tokens may
 * open a doc or a table by its address, and only where its user may open it
 * too. Every change here is in the audit log. This module is the feature's
 * own: its routes and types live here, not in services/endPoints.ts.
 */

export interface AppPlace {
  kind: string
  id: string
  /** Its title, when the admin reading may open it (a list never names what its reader can't). */
  title?: string
  /** Whether the app's user may open it now; absent where nothing decides that kind yet. */
  app_opens?: boolean
}

export interface AppAudience {
  places: AppPlace[]
  public: boolean
}

export interface AppIdentity {
  app_id: string
  slug: string
  name: string
  icon_url?: string
  enabled: boolean
  /** Its own user, made with its first token. */
  bot_user_id?: string
  /** The version of its scopes and audience this read holds, which a change is made from (If-Match). */
  access_version: string
  scopes: string[]
  audience: AppAudience
}

export interface AppToken {
  id: string
  name: string
  token_prefix: string
  scopes: string[]
  expires_at?: string | null
  last_used_at?: string | null
  created_at: string
}

export interface AppAccess {
  identity: AppIdentity
  tokens: AppToken[]
}

/** How many tokens an app holds at once (business/App MaxTokensPerApp). */
export const MAX_APP_TOKENS = 3

/** An app token's life (the server takes 1 to 366 days; there is no "never"). */
export const APP_TOKEN_LIFE = [
  { value: "30", label: "30 d", title: "30 days" },
  { value: "90", label: "90 d", title: "90 days" },
  { value: "365", label: "1 y", title: "1 year" },
] as const

/** The kinds of place Admin › Apps adds: those the /v1 routes reach by address. */
export const ADDABLE_KINDS = ["doc", "table"] as const
export type AddableKind = (typeof ADDABLE_KINDS)[number]

const NOUNS: Record<string, string> = { doc: "doc", table: "table", task: "task", project: "project", channel: "channel" }

export const appAccessRoutes = {
  identity: (appId: string) => `/admin/apps/${appId}/identity`,
  access: (appId: string) => `/admin/apps/${appId}/access`,
  tokens: (appId: string) => `/admin/apps/${appId}/tokens`,
  rotate: (appId: string, tokenId: string) => `/admin/apps/${appId}/tokens/${tokenId}/rotate`,
  revoke: (appId: string, tokenId: string) => `/admin/apps/${appId}/tokens/${tokenId}`,
}

/** The identity read's answer, whatever came back; null when it isn't one. Pure. */
export function readAppAccess(answer: unknown): AppAccess | null {
  const data = (answer as { data?: { identity?: AppIdentity; tokens?: AppToken[] } } | undefined)?.data
  const id = data?.identity
  if (!id || typeof id.app_id !== "string") return null
  return {
    identity: {
      ...id,
      scopes: Array.isArray(id.scopes) ? id.scopes : [],
      audience: { places: Array.isArray(id.audience?.places) ? id.audience.places : [], public: !!id.audience?.public },
    },
    tokens: Array.isArray(data?.tokens) ? data.tokens.filter((t): t is AppToken => !!t && typeof t.id === "string") : [],
  }
}

/** A kind as a noun: "doc", "table". Pure. */
export const placeNoun = (kind: string) => NOUNS[kind] ?? kind

/**
 * What a place's row reads: its title; for a table the admin's own list of
 * tables names (tables have no title reader yet); else what it is, unnamed.
 * Pure.
 */
export function placeTitle(p: AppPlace, tableNames?: ReadonlyMap<string, string>): string {
  if (p.title) return p.title
  const fromList = p.kind === "table" ? tableNames?.get(p.id) : undefined
  if (fromList) return fromList
  return `A ${placeNoun(p.kind)} you can't open`
}

/** Whether the app's user may open a place, as its row says it; null when nothing decides it. Pure. */
export function placeReach(p: AppPlace): { tone: "success" | "warning"; word: string } | null {
  if (p.app_opens === true) return { tone: "success", word: "Its user can open it" }
  if (p.app_opens === false) return { tone: "warning", word: "Its user can't open it" }
  return null
}

const samePlace = (a: AppPlace, b: AppPlace) => a.kind === b.kind && a.id.toLowerCase() === b.id.toLowerCase()

/** The audience with a place added (once). Pure. */
export function withPlace(audience: AppAudience, place: AppPlace): AppAudience {
  if (audience.places.some((p) => samePlace(p, place))) return audience
  return { ...audience, places: [...audience.places, place] }
}

/** The audience without a place. Pure. */
export function withoutPlace(audience: AppAudience, place: AppPlace): AppAudience {
  return { ...audience, places: audience.places.filter((p) => !samePlace(p, place)) }
}

/** Whether two lists hold the same scopes, in any order. Pure. */
export function sameScopes(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((s) => set.has(s))
}

/** What the server is sent: places as kind and id only. */
function audienceBody(audience: AppAudience) {
  return { places: audience.places.map(({ kind, id }) => ({ kind, id })), public: audience.public }
}

/** What a change to an app's access sends: its scopes and its audience, whole. */
export type AccessEdit = (now: AppIdentity) => { scopes: string[]; audience: AppAudience }

/**
 * Changes an app's access from what the server holds now, not from the
 * sheet's last read. The server takes scopes and places whole, so a change
 * built on an older read would put back a place another admin, or another
 * tab, had just taken away, and give the app that reach again. The put names
 * the version it was built on (If-Match), and the server refuses it, 412, when
 * another change landed between this read and the put: the change is made
 * once more on the app as it is then, and a second refusal is the caller's to
 * say. The callers say a failure themselves, so the put raises no toast.
 */
export async function changeAppAccess(appId: string, edit: AccessEdit): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const res = await axiosInstance.get(appAccessRoutes.identity(appId), OWN_ERRORS)
    const now = readAppAccess(res.data)
    if (!now) throw new Error("Couldn't read what the app may do just now.")
    const { scopes, audience } = edit(now.identity)
    try {
      await axiosInstance.put(
        appAccessRoutes.access(appId),
        { scopes, audience: audienceBody(audience) },
        { ...OWN_ERRORS, headers: { "If-Match": `"${now.identity.access_version}"` } },
      )
      return
    } catch (e) {
      if (attempt === 2 || apiErrorStatus(e) !== 412) throw e
    }
  }
}

export async function mintAppToken(appId: string, input: { name: string; scopes: string[]; expires_in_days: number }): Promise<{ token: AppToken; plaintext: string }> {
  const res = await axiosInstance.post<{ data: { token: AppToken; plaintext: string } }>(appAccessRoutes.tokens(appId), input)
  return res.data.data
}

export async function rotateAppToken(appId: string, tokenId: string): Promise<string> {
  const res = await axiosInstance.post<{ data: { plaintext: string } }>(appAccessRoutes.rotate(appId, tokenId))
  return res.data.data.plaintext
}

export async function revokeAppToken(appId: string, tokenId: string): Promise<void> {
  await axiosInstance.delete(appAccessRoutes.revoke(appId, tokenId))
}
