/**
 * A doc's versions as the history sheet reads them (docs programme B8, on A4's
 * Snapshot Service: router/docsVersions.go). The addresses live here, with the
 * sheet, and not in services/endPoints.ts: every route loads that file, and
 * these are needed only once the sheet opens (as A9 keeps PROPOSALS_URL).
 *
 *   GET  /doc/versions?doc_uuid=&before=         versions, newest first, a page at a time (next is the cursor), and who they credit
 *   GET  /doc/versions/{id}?doc_uuid=            a version's body
 *   POST /doc/versions {doc_uuid, name, pinned}   keep the doc as it is now
 *   POST /doc/versions/{id}/name {doc_uuid, name, pinned}
 *   POST /doc/versions/{id}/restore {doc_uuid}    live, for everyone
 */

import { getGroupDateHeading } from "@/lib/utils/date/getMessageGroupDate"
import { clockTime } from "@/lib/utils/date/clock"
import { fullDateTime } from "@/lib/utils/date/shortDate"

export const VERSIONS_URL = "/doc/versions"

export const versionsKey = (docId: string, before?: string) =>
  `${VERSIONS_URL}?doc_uuid=${encodeURIComponent(docId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`
export const versionBodyKey = (docId: string, versionId: string) =>
  `${VERSIONS_URL}/${encodeURIComponent(versionId)}?doc_uuid=${encodeURIComponent(docId)}`
export const versionNameUrl = (versionId: string) => `${VERSIONS_URL}/${encodeURIComponent(versionId)}/name`
export const versionRestoreUrl = (versionId: string) => `${VERSIONS_URL}/${encodeURIComponent(versionId)}/restore`

/** Someone whose edits a version holds: a person, or an agent with the person who asked it. */
export interface VersionContributor {
  user_uuid?: string
  agent_uuid?: string
  asker_uuid?: string
}

export interface DocVersion {
  id: string
  /** "doc", or "agent_run": the body before an agent's run. */
  kind: string
  name?: string
  pinned: boolean
  size_bytes?: number
  /** interval, idle, mass_delete, manual (before a restore), saved, before_write. */
  reason?: string
  run_id?: string
  contributors: VersionContributor[] | null
  created_at: string
}

export interface VersionPerson {
  name: string
  profile_key?: string
}

export interface VersionList {
  versions: DocVersion[] | null
  people: Record<string, VersionPerson> | null
  /** The cursor for the page of earlier versions, while there are more. */
  next?: string
}

/** Pages of a history as one list, newest first, each version once; next is the last page's. Pure. */
export function mergeVersionLists(pages: Array<VersionList | undefined>): VersionList | undefined {
  const there = pages.filter((p): p is VersionList => !!p)
  if (!there.length) return undefined
  const seen = new Set<string>()
  const versions: DocVersion[] = []
  let people: Record<string, VersionPerson> = {}
  for (const p of there) {
    for (const v of p.versions ?? []) {
      if (!seen.has(v.id)) {
        seen.add(v.id)
        versions.push(v)
      }
    }
    people = { ...people, ...(p.people ?? {}) }
  }
  return { versions, people, next: there[there.length - 1].next }
}

/** Someone a version credits, as the sheet draws them. */
export interface Credit {
  key: string
  /** "Maya Chen", or "Release Captain for Sam Rivera". */
  label: string
  /** Whose face: the person, or the agent. */
  face: { id: string; name: string; profileKey?: string; agent: boolean }
}

const nameOf = (people: VersionList["people"], id: string | undefined, fallback: string) => (id && people?.[id]?.name) || fallback

/** Who a version credits, people first in the order the server gave, each once. */
export function creditsOf(version: DocVersion, people: VersionList["people"]): Credit[] {
  const out: Credit[] = []
  const seen = new Set<string>()
  for (const c of version.contributors ?? []) {
    if (c.agent_uuid) {
      const key = `${c.agent_uuid}:${c.asker_uuid ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      const agent = nameOf(people, c.agent_uuid, "An agent")
      // An agent's edit is always someone's ask (I11): said with it.
      const label = c.asker_uuid ? `${agent} for ${nameOf(people, c.asker_uuid, "someone")}` : agent
      out.push({ key, label, face: { id: c.agent_uuid, name: agent, profileKey: people?.[c.agent_uuid]?.profile_key, agent: true } })
    } else if (c.user_uuid && !seen.has(c.user_uuid)) {
      seen.add(c.user_uuid)
      const name = nameOf(people, c.user_uuid, "Someone")
      out.push({ key: c.user_uuid, label: name, face: { id: c.user_uuid, name, profileKey: people?.[c.user_uuid]?.profile_key, agent: false } })
    }
  }
  return out
}

/** "Maya Chen", "Maya Chen and Sam Rivera", "Maya Chen, Sam Rivera and 2 more". */
export function creditLine(credits: Credit[]): string {
  if (credits.length === 0) return ""
  if (credits.length === 1) return credits[0].label
  if (credits.length === 2) return `${credits[0].label} and ${credits[1].label}`
  return `${credits[0].label}, ${credits[1].label} and ${credits.length - 2} more`
}

/** Why a version was kept, when it isn't the everyday reason; `warning` for a large deletion. */
export function reasonOf(version: DocVersion, credits: Credit[]): { label: string; warning?: boolean } | null {
  if (version.kind === "agent_run") {
    const agent = credits.find((c) => c.face.agent)?.face.name
    return { label: agent ? `Before ${agent}'s edit` : "Before an agent's edit" }
  }
  switch (version.reason) {
    case "mass_delete":
      return { label: "Before a large deletion", warning: true }
    case "manual":
      return { label: "Before a restore" }
    case "before_write":
      return { label: "Before an automatic edit" }
    case "saved":
      return version.name ? null : { label: "Saved" }
    default:
      return null
  }
}

/** A version's time as its row shows it ("2:32 PM"), and all of it for a screen reader. */
export function versionTime(version: DocVersion): { short: string; full: string } {
  const d = new Date(version.created_at)
  return { short: clockTime(d), full: fullDateTime(d) }
}

/** "Today, 2:32 PM", "Yesterday, 9:05 AM", "Thu 2 Oct, 4:10 PM": a version named in a sentence. */
export function versionWhen(version: DocVersion, now: Date = new Date()): string {
  return `${getGroupDateHeading(version.created_at, now)}, ${clockTime(new Date(version.created_at))}`
}

/** What the sheet calls a version: its name, else when it was kept. */
export function versionTitle(version: DocVersion, now: Date = new Date()): string {
  return version.name?.trim() || versionWhen(version, now)
}

/** Versions in days, newest first: "Today", "Yesterday", "Monday", "Thu 2 Oct". */
export function byDay(versions: DocVersion[], now: Date = new Date()): Array<{ day: string; versions: DocVersion[] }> {
  const out: Array<{ day: string; versions: DocVersion[] }> = []
  for (const v of versions) {
    const day = getGroupDateHeading(v.created_at, now)
    const last = out[out.length - 1]
    if (last?.day === day) last.versions.push(v)
    else out.push({ day, versions: [v] })
  }
  return out
}

/** The server's reason for refusing a read (no such version, no access, the doc in the trash); none for a failure it didn't explain. */
export function refusalWords(e: unknown): string | undefined {
  const res = (e as { response?: { status?: number; data?: { msg?: unknown } } } | null)?.response
  return res?.status && res.status < 500 && typeof res.data?.msg === "string" && res.data.msg ? res.data.msg : undefined
}

/** A value inside a quoted attribute selector (CSS.escape isn't everywhere). */
export const attrValue = (v: string) => v.replace(/["\\]/g, "\\$&")

/** The most a version's name may be (the server's limit). */
export const MAX_NAME = 120
