// The summary bar's columns (tables T6b): each field's values over the rows a
// view shows, kept from one change to the next, so a footer is worked out
// again only when its own column changes.
//
// WHY. SummaryCell worked every footer out from every row on each change, and
// read each row's values again for each (a JSON parse a row a column): 981 ms
// a commit at 100,000 rows (FLUIDITY-LEAD's fluid-07 profile, 20 Oct 2026).
// Here a commit reads the one row it replaced, and only the columns whose
// value changed are new objects; the rest stay the same objects, which a
// memoised footer skips. Rows added or taken away change every column. The
// values keep no order, as a summary needs none: a sort changes no column.

import { parseRowValues, type TableRow } from "@/services/tableService"

/** One field's values over the rows, in no particular order: a new object only when they change. */
export interface FooterColumn {
  readonly values: readonly unknown[]
}

/** Whether a cell's value is the same after a row was written again (a list or a link compares by what it holds). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export class FooterColumns {
  #rows: readonly TableRow[] = []
  #fields: readonly string[] = []
  /** Each row's slot by its id, and the row each slot was read from. */
  #slot = new Map<string, number>()
  #at: TableRow[] = []
  /** Each field's values, by slot. */
  #cols = new Map<string, unknown[]>()
  #out = new Map<string, FooterColumn>()
  /** The columns this read has copied to change (copy on write: a column handed out never changes). */
  #fresh = new Set<string>()

  readonly #valuesOf: (r: TableRow) => Record<string, unknown>

  constructor(valuesOf: (r: TableRow) => Record<string, unknown> = parseRowValues) {
    this.#valuesOf = valuesOf
  }

  /** The columns of the fields named, over rows. */
  read(rows: readonly TableRow[], fields: readonly string[]): ReadonlyMap<string, FooterColumn> {
    const sameFields = fields.length === this.#fields.length && fields.every((f, i) => f === this.#fields[i])
    if (rows === this.#rows && sameFields) return this.#out
    if (sameFields) this.#update(rows)
    else this.#build(rows, fields)
    this.#rows = rows
    // A new map when a column changed: the one handed out before stays as it was.
    if (this.#fresh.size) this.#out = new Map(this.#out)
    for (const f of this.#fresh) this.#out.set(f, { values: this.#cols.get(f) ?? [] })
    this.#fresh.clear()
    return this.#out
  }

  /** Every row read afresh: the first read, and a change of fields. */
  #build(rows: readonly TableRow[], fields: readonly string[]) {
    this.#fields = fields
    this.#slot = new Map()
    this.#at = []
    this.#cols = new Map(fields.map((f) => [f, []]))
    this.#out = new Map()
    for (const f of fields) this.#fresh.add(f)
    this.#add(rows)
  }

  #update(next: readonly TableRow[]) {
    const prev = this.#rows
    // A commit: the same rows in the same places, one or a few written again.
    if (next.length === prev.length) {
      const written: number[] = []
      let i = 0
      for (; i < next.length; i++) {
        if (next[i] === prev[i]) continue
        if (next[i].id !== prev[i].id) break
        written.push(i)
      }
      if (i === next.length) {
        for (const w of written) this.#write(next[w], this.#slot.get(next[w].id)!)
        return
      }
    }
    // Anything else, by id: rows written again, added and taken away.
    const seen = new Uint8Array(this.#at.length)
    const added: TableRow[] = []
    for (const r of next) {
      const s = this.#slot.get(r.id)
      if (s === undefined) {
        added.push(r)
        continue
      }
      seen[s] = 1
      if (this.#at[s] !== r) this.#write(r, s)
    }
    for (let s = seen.length - 1; s >= 0; s--) if (!seen[s]) this.#remove(s)
    this.#add(added)
  }

  /** A column to change in this read: copied once, so the one handed out before stays as it was. */
  #writable(f: string): unknown[] {
    let col = this.#cols.get(f)!
    if (!this.#fresh.has(f)) {
      col = col.slice()
      this.#cols.set(f, col)
      this.#fresh.add(f)
    }
    return col
  }

  /** A row written again: the columns whose value changed. */
  #write(r: TableRow, s: number) {
    this.#at[s] = r
    const vals = this.#valuesOf(r)
    for (const f of this.#fields) {
      const v = vals[f]
      if (!same(this.#cols.get(f)![s], v)) this.#writable(f)[s] = v
    }
  }

  #add(rows: readonly TableRow[]) {
    if (!rows.length) return
    const cols = this.#fields.map((f) => this.#writable(f))
    for (const r of rows) {
      this.#slot.set(r.id, this.#at.length)
      this.#at.push(r)
      const vals = this.#valuesOf(r)
      for (let c = 0; c < cols.length; c++) cols[c].push(vals[this.#fields[c]])
    }
  }

  /** A row taken away: the last slot moves into its place. */
  #remove(s: number) {
    const last = this.#at.length - 1
    this.#slot.delete(this.#at[s].id)
    if (s !== last) {
      this.#at[s] = this.#at[last]
      this.#slot.set(this.#at[s].id, s)
    }
    this.#at.pop()
    for (const f of this.#fields) {
      const col = this.#writable(f)
      col[s] = col[last]
      col.pop()
    }
  }
}
