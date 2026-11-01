/**
 * What a grid's fill handle writes (tables G1, gsheets-grid-01): one column's
 * next values after the source cells (or before them, up), in top-to-bottom
 * order. Pure.
 *
 * - Numbers (a number, duration or rating column): two or more in an even
 *   step continue it, rounded to the sources' decimal places; one is copied.
 * - Dates (YYYY-MM-DD in a date column): one steps a day at a time; dates on
 *   the same day of the month, an even number of months apart, continue by
 *   months on the first date's day, clamped to a short month's end; dates an
 *   even number of days apart continue by days.
 * - Text ending in a number after a word ("Item 9", "Q09", "A1"), in a text
 *   column: that number steps (one source: by one), keeping its zero padding.
 * - Anything else repeats in turn: words, options, ticks, mixed sources.
 * Filling up runs the same sequence backwards.
 */
import type { FieldType } from "@/services/tableService"

export interface FillOptions {
  /** Fill the cells above the source, not below. */
  up?: boolean
  /** The column's kind: numbers and dates step only in their own kinds; text steps a trailing number. */
  kind?: FieldType
  /** Copy the sources as they are, in turn, never stepping them (Ctrl+D, as Sheets). */
  copy?: boolean
}

const NUMBER_KINDS: readonly FieldType[] = ["number", "duration", "rating"]
const TEXT_KINDS: readonly FieldType[] = ["text", "long_text"]
const DAY_MS = 86_400_000
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/
/** Text whose end is a number after something with a letter in it. */
const WORD_NUMBER = /^(.*\p{L}.*?)(\d+)$/u

export function fillSeries(source: unknown[], count: number, opts: FillOptions = {}): unknown[] {
  if (count <= 0) return []
  if (!source.length) return new Array<unknown>(count).fill(null)
  const dir = opts.up ? -1 : 1
  const src = opts.up ? [...source].reverse() : source
  const out = opts.copy ? repeat(src, count) : (numbers(src, count, opts.kind) ?? dates(src, count, opts.kind, dir) ?? texts(src, count, opts.kind, dir) ?? repeat(src, count))
  return opts.up ? out.reverse() : out
}

function repeat(src: unknown[], count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => src[i % src.length])
}

/** The one step between every neighbour, or null when the steps differ. */
function evenStep(values: number[], same: (a: number, b: number) => boolean): number | null {
  const step = values[1] - values[0]
  for (let i = 2; i < values.length; i++) if (!same(values[i] - values[i - 1], step)) return null
  return step
}

function decimalsOf(x: number): number {
  const s = String(x)
  if (s.includes("e")) return 10
  return s.split(".")[1]?.length ?? 0
}

function numbers(src: unknown[], count: number, kind?: FieldType): unknown[] | null {
  if (kind && !NUMBER_KINDS.includes(kind)) return null
  if (!src.every((v) => typeof v === "number" && Number.isFinite(v))) return null
  const vals = src as number[]
  if (vals.length === 1) return repeat(vals, count)
  const places = Math.max(...vals.map(decimalsOf))
  const round = (x: number) => Number(x.toFixed(places))
  const step = evenStep(vals, (a, b) => round(a) === round(b))
  if (step === null) return repeat(vals, count)
  const last = vals[vals.length - 1]
  return Array.from({ length: count }, (_, i) => round(last + step * (i + 1)))
}

interface Day {
  y: number
  m: number
  d: number
}

function dayOf(v: unknown): Day | null {
  const m = typeof v === "string" ? ISO_DAY.exec(v) : null
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}

const pad = (n: number, width: number) => String(n).padStart(width, "0")
const isoOf = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

function dates(src: unknown[], count: number, kind: FieldType | undefined, dir: number): unknown[] | null {
  if (kind !== "date") return null
  const days = src.map(dayOf)
  if (days.some((d) => d === null)) return null
  const ds = days as Day[]
  const stamp = (d: Day) => Date.UTC(d.y, d.m - 1, d.d)
  const byDays = (from: Day, step: number) =>
    Array.from({ length: count }, (_, i) => new Date(stamp(from) + step * (i + 1) * DAY_MS).toISOString().slice(0, 10))
  const last = ds[ds.length - 1]
  if (ds.length === 1) return byDays(last, dir)
  const months = ds.map((d) => d.y * 12 + (d.m - 1))
  const monthStep = ds.every((d) => d.d === ds[0].d) ? evenStep(months, (a, b) => a === b) : null
  if (monthStep) {
    return Array.from({ length: count }, (_, i) => {
      const at = months[months.length - 1] + monthStep * (i + 1)
      const y = Math.floor(at / 12)
      const m = (at % 12) + 1
      return isoOf(y, m, Math.min(ds[0].d, daysIn(y, m)))
    })
  }
  const step = evenStep(ds.map(stamp), (a, b) => a === b)
  return step === null ? repeat(src, count) : byDays(last, step / DAY_MS)
}

function texts(src: unknown[], count: number, kind: FieldType | undefined, dir: number): unknown[] | null {
  if (kind && !TEXT_KINDS.includes(kind)) return null
  const parts = src.map((v) => (typeof v === "string" ? WORD_NUMBER.exec(v) : null))
  if (parts.some((p) => p === null)) return null
  const ps = parts as RegExpExecArray[]
  const prefix = ps[0][1]
  if (ps.some((p) => p[1] !== prefix)) return null
  const nums = ps.map((p) => Number(p[2]))
  const step = nums.length === 1 ? dir : evenStep(nums, (a, b) => a === b)
  if (step === null) return null
  const digits = ps[ps.length - 1][2]
  const width = digits.length > 1 && digits.startsWith("0") ? digits.length : 0
  const last = nums[nums.length - 1]
  return Array.from({ length: count }, (_, i) => {
    const n = last + step * (i + 1)
    return n < 0 ? src[i % src.length] : `${prefix}${pad(n, width)}`
  })
}
