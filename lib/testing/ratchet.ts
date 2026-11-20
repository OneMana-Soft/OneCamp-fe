import { readFileSync, writeFileSync } from "node:fs"

/**
 * A guard's per-file ratchet (the house's "may only go down", as in
 * app/interaction.test.ts), kept in a JSON file beside the guard: what each
 * file still owes, by key (a retired word, a rule), counted on the tree the
 * guard landed on. A count over its baseline fails.
 *
 * `node scripts/ds/baselines.mjs [guard...]` rewrites the baselines by
 * running each guard's own count: a key the baseline knew may only go down in
 * each file, and a new key (a word just retired, a rule just added) takes in
 * its uses once, as they are.
 */

/** file → key → times found. */
export type Counts = Record<string, Record<string, number>>

export interface Baseline {
  /** The keys when it was written: a key not here is new, and its uses are taken in once. */
  keys: string[]
  files: Counts
}

/** The env flag scripts/ds/baselines.mjs sets: the guards write their baselines instead of checking them. */
export const WRITING = process.env.DS_BASELINE === "write"

/**
 * Whether a baseline above today's count fails as well (the house's two-way
 * pin). Off while the areas' first heads land (UX-PROGRAM, Nov 2026): a head
 * built before a guard landed lowers counts the guard's baseline doesn't know
 * about yet, and merging it must not go red for doing the work. A count over
 * its baseline always fails; the baselines are lowered by the script. Turned
 * on with the bans at zero (DS-PLAN H22).
 */
export const STALE_FAILS = false

const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))

export function readBaseline(path: string): Baseline {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** The next baseline: a known key may only go down in each file; a new key's uses are taken in as they are. */
export function nextBaseline(old: Baseline, now: Counts, keys: readonly string[]): Baseline {
  const known = new Set(old.keys)
  const files: Counts = {}
  for (const [file, counts] of Object.entries(now)) {
    const keep: Record<string, number> = {}
    for (const [key, n] of Object.entries(counts)) {
      const allowed = known.has(key) ? Math.min(n, old.files[file]?.[key] ?? 0) : n
      if (allowed > 0) keep[key] = allowed
    }
    if (Object.keys(keep).length) files[file] = sorted(keep)
  }
  return { keys: [...keys].sort(), files: sorted(files) }
}

/** Writes the next baseline over the old one (or the first, from today's counts). */
export function writeBaseline(path: string, now: Counts, keys: readonly string[]): void {
  let old: Baseline = { keys: [], files: {} }
  try {
    old = readBaseline(path)
  } catch {
    // the first baseline: every key is new
  }
  writeFileSync(path, `${JSON.stringify(nextBaseline(old, now, keys), null, 2)}\n`)
}

export interface Over {
  file: string
  key: string
  n: number
  allowed: number
}

/** What today's counts break: over (a file says more than its baseline), stale (a file says less, or a key is new or gone). */
export function compare(base: Baseline, now: Counts, keys: readonly string[]): { over: Over[]; stale: string[] } {
  const over: Over[] = []
  const stale: string[] = []
  for (const [file, counts] of Object.entries(now)) {
    for (const [key, n] of Object.entries(counts)) {
      const allowed = base.files[file]?.[key] ?? 0
      if (n > allowed) over.push({ file, key, n, allowed })
    }
  }
  for (const [file, counts] of Object.entries(base.files)) {
    for (const [key, n] of Object.entries(counts)) if ((now[file]?.[key] ?? 0) < n) stale.push(`${file}: ${key} ${now[file]?.[key] ?? 0} < ${n}`)
  }
  for (const key of keys) if (!base.keys.includes(key)) stale.push(`new key ${key}`)
  for (const key of base.keys) if (!keys.includes(key)) stale.push(`gone key ${key}`)
  return { over, stale }
}

/** Adds one find to a tally. */
export function tally(counts: Counts, file: string, key: string, n = 1): void {
  if (n <= 0) return
  const row = (counts[file] ??= {})
  row[key] = (row[key] ?? 0) + n
}
