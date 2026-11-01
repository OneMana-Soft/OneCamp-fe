import { dateTimeFormat } from "@/lib/utils/date/clock"
import { zoneHere } from "@/lib/utils/zoneHere"

/**
 * Whether two zone names are one name to this runtime (Chromium reads Asia/Kolkata as Asia/Calcutta). The question for
 * what to save: a zone picked under a name of its own is saved as picked, though its clock be another's (London, Dublin).
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const here = zoneHere(a)
  return here !== "" && here === zoneHere(b)
}

/**
 * Whether two zone names are one zone, never by spelling (V-135); a blank or unreadable name is none. Chromium and
 * Firefox read a zone's names as one. WebKit (Safari, every iOS browser) keeps each as given, so there two names are one
 * zone when their time is called alike and their clocks have agreed since 1970 (IANA's rule for a second name): read
 * each month to 2037, each change to the minute, once a pair. London and Dublin stay two, as in Chromium and on the
 * server (helpers.SameZone): their clocks have agreed since 1970, but "British Summer Time" is not "Irish Standard Time".
 */
export function sameZone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !zoneHere(a) || !zoneHere(b)) return false
  if (sameName(a, b)) return true
  if ((readsNames ??= sameName("Asia/Calcutta", "Asia/Kolkata"))) return false
  const pair = a < b ? `${a} ${b}` : `${b} ${a}`
  let same = pairs.get(pair)
  if (same === undefined) pairs.set(pair, (same = calledAlike(a, b) && clocksAgree(a, b)))
  return same
}

let readsNames: boolean | undefined
const pairs = new Map<string, boolean>()
const CLOCK: Intl.DateTimeFormatOptions = { hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }
const CALLED: Intl.DateTimeFormatOptions = { timeZoneName: "long" }
const MINUTE = 60_000

// Whether two zones' time is called alike in mid-January and in mid-July this year. Intl calls a zone's time the same
// under any of its names, so one zone's names always are; the question is cheap, so it goes before the clocks' walk.
function calledAlike(a: string, b: string): boolean {
  const [ca, cb] = [dateTimeFormat("en-US", { ...CALLED, timeZone: a }), dateTimeFormat("en-US", { ...CALLED, timeZone: b })]
  const year = new Date().getUTCFullYear()
  const called = (clock: Intl.DateTimeFormat, at: number) => clock.formatToParts(at).find((p) => p.type === "timeZoneName")?.value
  return [0, 6].every((month) => called(ca, Date.UTC(year, month, 15, 12)) === called(cb, Date.UTC(year, month, 15, 12)))
}

// Minutes ahead of UTC on a zone's clock at `at`, a whole minute.
function offset(clock: Intl.DateTimeFormat, at: number): number {
  const p: Record<string, number> = {}
  for (const { type, value } of clock.formatToParts(at)) p[type] = Number(value)
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at) / MINUTE
}

// The first minute after `from` at which the clock reads otherwise, or `to`.
function changeAt(clock: Intl.DateTimeFormat, from: number, to: number): number {
  const was = offset(clock, from)
  let [lo, hi] = [from, to]
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / (2 * MINUTE)) * MINUTE
    if (offset(clock, mid) === was) lo = mid
    else hi = mid
  }
  return offset(clock, hi) === was ? to : hi
}

function clocksAgree(a: string, b: string): boolean {
  const [ca, cb] = [dateTimeFormat("en-US", { ...CLOCK, timeZone: a }), dateTimeFormat("en-US", { ...CLOCK, timeZone: b })]
  const now = Date.now() - (Date.now() % MINUTE)
  if (offset(ca, now) !== offset(cb, now)) return false
  let at = Date.UTC(1970, 0, 1)
  let [oa, ob] = [offset(ca, at), offset(cb, at)]
  for (let month = 1; at < Date.UTC(2038, 0, 1); month++) {
    if (oa !== ob) return false
    const next = Date.UTC(1970, month, 1)
    const [na, nb] = [offset(ca, next), offset(cb, next)]
    if ((na !== oa || nb !== ob) && changeAt(ca, at, next) !== changeAt(cb, at, next)) return false
    ;[at, oa, ob] = [next, na, nb]
  }
  return oa === ob
}
