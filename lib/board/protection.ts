// Protected objects on a board (miro-44: Miro's Protected Lock, there on its Enterprise plan, here on every plan), the
// browser's half. The collaboration server keeps the record, a map "protected" beside the elements: an element's id ->
// { by, name, at }, who protected it and when. Only the API's POST /board/protect writes it, for the board's owner or a
// workspace admin, with an audit row, and the server puts back any tab's change to a protected element (its own
// live/ops/protect.js). Here: the record as the board's tools read it, what a press on Protect or Lift does for a
// selection, and the words for each. Pure, but for useProtection.

import * as React from "react"
import useSWR from "swr"
import type * as Y from "yjs"
import { GetEndpointUrl } from "@/services/endPoints"

/** The record's map in the board's document (the server's PROTECTED). */
export const PROTECTED = "protected"
/** The most objects one press protects or lifts (the API's business.MaxProtect). */
export const MAX_PROTECT = 500

/** Who protected an element, and when (ms). */
export interface Protection {
  by: string
  name: string
  at: number
}

/** The board's protected elements, by id. */
export type ProtectionRecord = ReadonlyMap<string, Protection>

const NONE: ProtectionRecord = new Map()

/** The record as the board's document holds it; an entry that isn't one still counts as protected, by nobody named. */
export function readProtection(map: Pick<Y.Map<unknown>, "size" | "forEach">): ProtectionRecord {
  if (map.size === 0) return NONE
  const out = new Map<string, Protection>()
  map.forEach((v, id) => {
    const p = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof Protection, unknown>>
    out.set(id, { by: typeof p.by === "string" ? p.by : "", name: typeof p.name === "string" ? p.name : "", at: typeof p.at === "number" ? p.at : 0 })
  })
  return out
}

/** The board's record, read again whenever it changes (a protect or a lift, from any tab). */
export function useProtection(doc: Y.Doc): ProtectionRecord {
  const map = React.useMemo(() => doc.getMap<unknown>(PROTECTED), [doc])
  const [record, setRecord] = React.useState<ProtectionRecord>(() => readProtection(map))
  React.useEffect(() => {
    const read = () => setRecord(readProtection(map))
    read()
    map.observe(read)
    return () => map.unobserve(read)
  }, [map])
  return record
}

/**
 * Whether this reader may protect and lift: getBoardInfo's board_can_protect (the board's owner or a workspace admin),
 * read from the board page's own answer in SWR's cache, so no second request and no byte on the route's first load.
 */
export function useCanProtect(boardId: string): boolean {
  const { data } = useSWR<{ data?: { board_can_protect?: boolean } | null }>(boardId ? `${GetEndpointUrl.GetBoardInfo}/${boardId}` : null, null)
  return data?.data?.board_can_protect === true
}

type Selected = { id: string; isDeleted?: boolean; containerId?: string | null }

/**
 * What a press does for a selection: lift the protection of the protected ones when any is, else protect them all.
 * A shape's words go with it (the server protects and lifts them together), so they're never named or counted apart.
 */
export function protectionPlan(selected: readonly Selected[], record: ProtectionRecord): { protect: boolean; ids: string[] } {
  const chosen = new Set(selected.map((e) => e.id))
  const own = selected.filter((e) => !e.isDeleted && !(e.containerId && chosen.has(e.containerId)))
  const held = own.filter((e) => record.has(e.id))
  return held.length > 0 ? { protect: false, ids: held.map((e) => e.id) } : { protect: true, ids: own.map((e) => e.id) }
}

const objects = (n: number) => (n === 1 ? "1 object" : `${n.toLocaleString()} objects`)

/** A press's name, with what it acts on: "Protect 3 objects", "Lift protection from 1 object". */
export function protectionLabel(protect: boolean, n: number): string {
  return protect ? `Protect ${objects(n)}` : `Lift protection from ${objects(n)}`
}

/** Who protected these, for the bar and a badge: "Protected by Ann", "Protected by Ann and others". */
export function protectedBy(ids: readonly string[], record: ProtectionRecord): string {
  const names = Array.from(new Set(ids.flatMap((id) => (record.has(id) ? [record.get(id)!.name.trim() || "the board's owner"] : []))))
  if (names.length === 0) return ""
  return names.length === 1 ? `Protected by ${names[0]}` : `Protected by ${names[0]} and others`
}

/** The toast once a press has worked: `changed` is how many the server changed. */
export function protectionDone(protect: boolean, changed: number): { title: string; description: string } {
  if (changed === 0) return { title: protect ? "Already protected" : "Already unprotected", description: "Nothing changed." }
  return protect
    ? { title: `Protected ${objects(changed)}`, description: "Only the board's owner and admins can change or lift it now." }
    : { title: `Lifted protection from ${objects(changed)}`, description: "Anyone who can edit the board can change it again." }
}

/** The first of these ids that is protected, or null: a change this tab made to one is put back by the server. */
export function firstProtected(ids: Iterable<string>, record: ProtectionRecord): string | null {
  if (record.size === 0) return null
  for (const id of ids) if (record.has(id)) return id
  return null
}

/** What a tab is told when the server puts back its change to a protected element. */
export function putBackCopy(p: Protection | undefined, canProtect: boolean): { title: string; description: string } {
  const who = p?.name.trim() ? ` ${p.name.trim()} protected it.` : ""
  return canProtect
    ? { title: "This is protected", description: `Lift its protection first, then change it.${who}` }
    : { title: "This is protected", description: `Only the board's owner and admins can change it or lift its protection.${who}` }
}
