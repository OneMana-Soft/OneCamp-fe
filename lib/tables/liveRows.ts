// What a table's live messages ask of the rows a page holds (tables L1, Live
// Rows #65; notion-db-16, gsheets-collab-01). A message names rows and, for
// a change of cells, their fields: never values, as every reader of the
// table's topic hears the same one. The page reads what changed under its
// reader's own access, in one read by id a burst (GET rows?ids=&fields=),
// and puts it where it's held:
//  a. cells that change no rule of the view (its filter, sorts and groups)
//     go into the rows held, and no window is read;
//  b. a row deleted leaves without a read; one made or brought back in a
//     view in the table's own order is read by id and put in its place;
//  c. a row whose change may move it is placed with the view's own order
//     (applyRules viewOrder), and only the windows it can move are read again.
// Pure. lib/tables/useTableRows names a burst's rows as it hears them
// (lib/tables/heardRows); this says what the burst reads, and liveRun reads
// it and puts the answers in, and the view's run with them: one
// chunk, fetched when the first message is heard (V-693).

import { isComputed, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { filterRules, fitRules, namesMe, type ViewRules } from "@/lib/tables/viewRules"
import type { Named } from "@/lib/tables/heardRows"

/** The fields a read by id names at most (the server's ParseFieldIDs): past them, whole rows. */
export const MOST_FIELDS = 500

/** The fields a view's rules read (its filter, sorts and groups); every: a rule reads what any change may change (a formula, a rollup, the row's last change). */
export interface Ruled {
  ids: ReadonlySet<string>
  every: boolean
}

/** A view without rules: no change moves a row. */
export const NOT_RULED: Ruled = { ids: new Set(), every: false }

/** What a row's change changes beside its cells: a formula's or a rollup's answer, who changed it last and when. */
const followsEveryChange = (f: TableField) => isComputed(f) || f.type === "modified_time" || f.type === "modified_by"

/** The fields a view's rules read, of those the table has (applyRules' fitRules). */
export function ruledBy(rules: ViewRules, fields: TableField[]): Ruled {
  const fit = fitRules(rules, fields)
  return readsOf([...fit.sort, ...(fit.groups ?? [])].map((s) => s.field).concat(filterRules(fit.filters).map((r) => r.field)), fields)
}

/** What reads the fields given (a view's rules, its bar's sums): every change, when one is worked out from the row or stamps its change. */
export function readsOf(read: readonly string[], fields: TableField[]): Ruled {
  const ids = new Set(read)
  if (ids.size === 0) return NOT_RULED
  return { ids, every: fields.some((f) => ids.has(f.id) && followsEveryChange(f)) }
}

/** Whether a row's change may move it in a view: it named a field a rule reads, or the whole row, or a rule reads what every change changes. */
export function hitsRules(named: Named, ruled: Ruled): boolean {
  if (ruled.ids.size === 0) return false
  if (named === "row" || ruled.every) return true
  for (const f of named) if (ruled.ids.has(f)) return true
  return false
}

/** One read by id: the rows, and the fields named (null: whole rows). */
export interface ByIdRead {
  ids: string[]
  fields: string[] | null
}

/**
 * The one read by id a burst asks for. A row held is read for the cells
 * named; a row not held, only when its change may bring it into the view
 * (hitsRules), or when it was made (made: those to be put in place), whole,
 * as nothing of it is held. The read names the fields only when every row it
 * reads is held and named them, at most MOST_FIELDS; else it reads whole rows.
 * Null: nothing to read. Pure.
 */
export function readById(updated: ReadonlyMap<string, Named>, made: ReadonlySet<string>, held: ReadonlySet<string>, ruled: Ruled): ByIdRead | null {
  const ids: string[] = []
  const fields = new Set<string>()
  let whole = false
  for (const [id, named] of updated) {
    if (held.has(id)) {
      ids.push(id)
      if (named === "row") whole = true
      else for (const f of named) fields.add(f)
    } else if (!made.has(id) && hitsRules(named, ruled)) {
      ids.push(id)
      whole = true
    }
  }
  for (const id of made) {
    if (held.has(id)) continue
    ids.push(id)
    whole = true
  }
  if (ids.length === 0) return null
  return { ids, fields: whole || fields.size === 0 || fields.size > MOST_FIELDS ? null : [...fields] }
}

/** A burst as heard (lib/tables/heardRows): rows changed, with the fields named; rows made or brought back; rows deleted. */
export interface Burst {
  rows: ReadonlyMap<string, Named>
  made?: ReadonlySet<string>
  gone?: ReadonlySet<string>
}

/**
 * What a burst meets: the rows held (with those kept at the view's end,
 * pinned), the view's rules and the table's fields (null: a view held whole,
 * in the table's own order), the bar's sums; fixed: a view that can't place
 * a row its change moves (groups collapsed, a run that can't jump).
 */
export interface BurstView {
  held: ReadonlySet<string>
  pinned: ReadonlySet<string>
  rules: ViewRules | null
  fields: TableField[] | null
  sums: readonly { field: string }[]
  fixed: boolean
}

/** What a burst asks for (planBurst). */
export interface BurstPlan {
  /** Rows whose change may move them in the view (hitsRules), but those kept at its end. */
  moved: ReadonlySet<string>
  /** Rows the view can't place itself (made where its rules place them, or moved where it can't place them): its windows are read again, and nothing by id. */
  unplaced: boolean
  /** Rows made or brought back that are placed by id: in a view in the table's own order only. */
  made: ReadonlySet<string>
  /** The one read by id (readById), or null. */
  ask: ByIdRead | null
  /** Whether the burst may change what the bar sums, or the groups. */
  resum: boolean
}

const NONE: ReadonlySet<string> = new Set()

/** What a burst asks of a view (useTableRows' run, tables L1): the rows that may move, whether its windows are read again, the one read by id, and whether the sums are asked again. Pure. */
export function planBurst(burst: Burst, view: BurstView): BurstPlan {
  const { rules, fields } = view
  const ruled = rules && fields ? ruledBy(rules, fields) : NOT_RULED
  const moved = new Set([...burst.rows].filter(([id, n]) => !view.pinned.has(id) && hitsRules(n, ruled)).map(([id]) => id))
  const unplaced = (ruled.ids.size > 0 && !!burst.made?.size) || (moved.size > 0 && (view.fixed || namesMe(rules?.filters ?? [])))
  const made = burst.made && !ruled.ids.size ? burst.made : NONE
  if (unplaced) return { moved, unplaced, made, ask: null, resum: false }
  // A row made or deleted, held or not, may change what the bar sums, and the groups; a row changed, where it named a field they or the rules read.
  const sums = fields ? readsOf(view.sums.map((a) => a.field.replace(/^field:/, "")), fields) : NOT_RULED
  const resum = made.size > 0 || !!burst.gone?.size || [...burst.rows.values()].some((n) => hitsRules(n, ruled) || hitsRules(n, sums))
  return { moved, unplaced, made, ask: readById(burst.rows, made, view.held, ruled), resum }
}

/**
 * A held row with the cells a read by id answered (fields named): each of
 * its cells put in, one answered null cleared; its stamps (version, when and
 * by whom it changed, its AI cells kept) the answer's. Its comment count and
 * page, which that answer leaves out, stay. The row held, when nothing changed.
 */
export function withCells(held: TableRow, cells: TableRow): TableRow {
  const values = parseRowValues(held)
  let changed = false
  for (const [k, v] of Object.entries(parseRowValues(cells))) {
    if (v === null) {
      if (k in values) {
        delete values[k]
        changed = true
      }
    } else if (JSON.stringify(values[k]) !== JSON.stringify(v)) {
      values[k] = v
      changed = true
    }
  }
  const same = !changed && held.version === cells.version && held.updated_at === cells.updated_at && held.updated_by === cells.updated_by && String(held.ai_kept ?? "") === String(cells.ai_kept ?? "")
  if (same) return held
  return { ...cells, values: changed ? JSON.stringify(values) : held.values, comments: held.comments, page: held.page }
}
