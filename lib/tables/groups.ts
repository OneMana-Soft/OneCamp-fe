// A grouped view's places (tables V2b), as the grid and the phone's list draw
// them: each group's header, then the rows of the groups at its last level.
// The rows given are the view's own, in its order, without the rows of the
// groups collapsed when they were read: the server leaves those out of a
// view's windows, and the browser out of the rows it holds (openRows). Pure.

import { format } from "date-fns"
import type { GroupCount } from "@/lib/querySpec/types"
import type { Granularity, GroupRule } from "@/lib/tables/viewRules"
import { fieldKind, filterKind } from "@/lib/fieldTypes/registry"
import { formatNumber, numberFormatOf } from "@/lib/tables/cellFormat"
import { shortDate } from "@/lib/utils/date/shortDate"
import { dayDate } from "@/lib/utils/timeZone"
import type { TableField } from "@/services/tableService"

/** A group as a view lays it out: the server's count and totals, or the browser's, with where its rows start among those held. */
export type GroupOf = GroupCount & { from?: number }

/** A view's groups: their levels, every group's count, the ones this reader collapsed. */
export interface Grouping {
  levels: GroupRule[]
  /** Depth first, every level's; null while they're counted. */
  counts: GroupOf[] | null
  shut: readonly string[][]
  /** The groups collapsed when the rows given were read (a view read in windows). Without it, the rows given are every row the browser holds. */
  read?: readonly string[][]
  onShut: (shut: string[][]) => void
  /** The browser holds only part of the table (read in the browser, past the rows it holds): each group's count and totals are of its rows loaded alone, and its header says so. */
  partial?: boolean
}

/** A place in a grouped view: a group's header, or a row (its index among the rows given, -1 for one not read yet, and its number in the view). */
export type GroupPlace = { group: GroupOf; depth: number; shut: boolean } | { row: number; n: number }

export interface GroupLayout {
  /** Headers, the rows of open groups, then the rows added here. */
  length: number
  at(place: number): GroupPlace
  header(place: number): boolean
  /** How many of the rows given must be read to draw every place up to this one. */
  readTo(place: number): number
  /** The place of the row given at this index; -1 for one in a group collapsed since it was read. */
  placeOf(row: number): number
}

const pathKey = (path: readonly string[]) => JSON.stringify(path)

interface Part {
  at: number
  n: number
  group?: GroupOf
  depth: number
  shut: boolean
  /** Its first row's index among the rows given; -1 when they weren't read with them. */
  from: number
  /** Its first row's number in the view. */
  view: number
  /** How many of the rows given come before it. */
  held: number
  tail?: true
}

/**
 * The places of a view grouped `levels` deep, its groups as `groups` counts
 * them, `shut` collapsed now and `read` when its `given` rows were read (the
 * last `tail` of them added here, after every group). A collapsed group keeps
 * its header and hides its rows and groups; a group opened since its rows were
 * read draws them as on their way, until the view reads them again.
 */
export function groupLayout(groups: GroupOf[], levels: number, shut: readonly string[][], read: readonly string[][], given: number, tail: number): GroupLayout {
  const isShut = new Set(shut.map(pathKey))
  const wasShut = new Set(read.map(pathKey))
  const known = given - tail
  const parts: Part[] = []
  let place = 0
  let held = 0
  let view = 0
  // The depth of the collapsed group the groups that follow are in, now and when read.
  let hidden = Infinity
  let gone = Infinity
  for (const group of groups) {
    const depth = group.key.length
    if (depth <= hidden) hidden = Infinity
    if (depth <= gone) gone = Infinity
    const shown = hidden === Infinity
    const kept = gone === Infinity
    const key = pathKey(group.key)
    const s = isShut.has(key)
    if (shown) parts.push({ at: place++, n: 1, group, depth, shut: s, from: -1, view, held })
    if (shown && s) hidden = depth
    const w = kept && wasShut.has(key)
    if (w) gone = depth
    if (depth !== levels) continue
    const inHeld = kept && !w
    if (shown && !s) {
      parts.push({ at: place, n: group.count, depth, shut: false, from: inHeld ? held : -1, view, held })
      place += group.count
    }
    if (inHeld) held += group.count
    view += group.count
  }
  if (tail) {
    parts.push({ at: place, n: tail, depth: 0, shut: false, from: known, view, held, tail: true })
    place += tail
  }
  const partAt = (p: number): Part => {
    let lo = 0
    let hi = parts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (parts[mid].at <= p) lo = mid
      else hi = mid - 1
    }
    return parts[lo]
  }
  return {
    length: place,
    at(p) {
      const part = partAt(p)
      if (part.group) return { group: part.group, depth: part.depth, shut: part.shut }
      const k = p - part.at
      const row = part.from < 0 || (!part.tail && part.from + k >= known) ? -1 : part.from + k
      return { row, n: part.view + k }
    },
    header: (p) => !!partAt(p).group,
    readTo(p) {
      const part = partAt(p)
      return part.group || part.tail || part.from < 0 ? part.held : part.from + (p - part.at) + 1
    },
    placeOf(row) {
      const part = parts.find((x) => !x.group && x.from >= 0 && row >= x.from && row < x.from + x.n)
      return part ? part.at + (row - part.from) : -1
    },
  }
}

/** The rows the browser holds that a view's open groups show, in its order: the rows of the groups collapsed left out. */
export function openRows<T>(rows: T[], groups: GroupOf[], shut: readonly string[][], levels: number): T[] {
  if (!shut.length) return rows
  const isShut = new Set(shut.map(pathKey))
  const out: T[] = []
  let hidden = Infinity
  for (const g of groups) {
    const depth = g.key.length
    if (depth <= hidden) hidden = Infinity
    if (hidden !== Infinity) continue
    if (isShut.has(pathKey(g.key))) hidden = depth
    else if (depth === levels) for (let i = g.from ?? 0; i < (g.from ?? 0) + g.count; i++) out.push(rows[i])
  }
  return out
}

/** A grouped view's rows to draw and their places: those the browser holds of its open groups, or the windows read, then the rows added here. */
export function groupedBody<T>(rows: T[], grouping: Grouping, counts: GroupOf[], tail: number): { rows: T[]; layout: GroupLayout } {
  const { levels, shut, read } = grouping
  const end = rows.length - tail
  const given = read ? rows : [...openRows(rows.slice(0, end), counts, shut, levels.length), ...rows.slice(end)]
  return { rows: given, layout: groupLayout(counts, levels.length, shut, read ?? shut, given.length, tail) }
}

/** The groups collapsed after a reader opens or collapses one: none the view no longer has. */
export function toggleShut(shut: readonly string[][], path: string[], groups: { key: string[] }[]): string[][] {
  const key = pathKey(path)
  const live = new Set(groups.map((g) => pathKey(g.key)))
  const was = shut.some((p) => pathKey(p) === key)
  return [...shut.filter((p) => pathKey(p) !== key && live.has(pathKey(p))), ...(was ? [] : [path])]
}

/** A group's name: a choice's label, a tick or not, a number as its field writes it, a date's period ("Week of 19 Oct", "Q4 2026"). */
export function groupLabel(f: TableField, key: string, granularity?: Granularity): string {
  if (key === "") return "Empty"
  const kind = filterKind(f)
  if (kind === "checkbox") return key === "true" ? "Ticked" : "Not ticked"
  if (kind === "number") {
    const n = Number(key)
    const own = fieldKind(f.type).numberText
    if (own) return own(n, f)
    const shown = formatNumber(n, numberFormatOf(f))
    return shown ? `${shown.prefix}${shown.text}${shown.suffix}` : key
  }
  const day = kind === "date" ? dayDate(key) : undefined
  if (!day) return key
  if (granularity === "week") return `Week of ${shortDate(day)}`
  if (granularity === "month") return format(day, "MMMM yyyy")
  if (granularity === "quarter") return format(day, "QQQ yyyy")
  if (granularity === "year") return format(day, "yyyy")
  return shortDate(day)
}
