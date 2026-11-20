// A project's triage rota on the web (linear-21 H4; backend business/Triage rota.go, H2): who is on
// triage duty, in turns of whole weeks, as GET/PUT /project/{id}/triage/rota read and keep it. The
// server names people by id and works out who is on now and when that changes; the one join from an
// id to a name lives here, shared by the queue's on-duty line and the settings' rota. Pure, and kept
// out of lib/work/triage, which the project page's first load reads.
import { displayNameOf } from "@/lib/personName"
import { clockTime } from "@/lib/utils/date/clock"
import { listOf } from "@/lib/utils/listOf"

/** A rota as PUT takes it: people in turn order, a turn's length in weeks, the first turn's day (YYYY-MM-DD). */
export interface Rota {
  people: string[] | null
  weeks: number
  start: string
}

/** A rota as the server reads it back: who is on now ("" for nobody) and when that changes (RFC 3339, "" for never). */
export interface RotaView extends Rota {
  on_duty: string
  next_change: string
}

/** GET's answer; PUT's has no can_manage (V-1182), so the sheet keeps the one it read. */
export interface RotaRead {
  rota: RotaView
  can_manage?: boolean
}

/** business/Triage MaxRotaWeeks: a turn is 1 to 12 weeks. */
export const MAX_ROTA_WEEKS = 12

export const rotaPath = (projectId: string) => `/project/${projectId}/triage/rota`

/** One of the project's people as its members list reads them (the list ProjectRulesDialog reads). */
export interface RotaMember {
  user_uuid?: string
  user_name?: string
  user_full_name?: string
  is_bot?: boolean
}

/** Someone the rota still names who is no longer among the project's people: never a raw id. */
export const FORMER_MEMBER = "a former member"

/** The project's people by id, named as everywhere else in the app (displayNameOf: the display name, else the full name). */
export function memberNames(members: RotaMember[] | null | undefined): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of listOf<RotaMember>(members)) {
    const name = displayNameOf(m)
    if (m.user_uuid && name) names.set(m.user_uuid, name)
  }
  return names
}

export const nameOf = (id: string, names: Map<string, string>) => names.get(id) ?? FORMER_MEMBER

/** The turns in order, each named, marking who is on now. */
export function rotaTurns(r: Pick<RotaView, "people" | "on_duty">, names: Map<string, string>) {
  return listOf<string>(r.people).map((id) => ({ id, name: nameOf(id, names), now: id === r.on_duty }))
}

/** When duty next changes, in the reader's own time ("Mon 23 Nov, 05:30"), or "" for never. */
export function changeWords(iso: string, locale?: string): string {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ""
  return `${at.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}, ${clockTime(at)}`
}

/** Today in the reader's own calendar, as a rota's first day is written. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
