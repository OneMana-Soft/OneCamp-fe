/**
 * lib/celebrate's API for every screen, its bursts (a chunk) fetched when the
 * page is idle or first wanted, so no first screen carries them. A finish's
 * books (streak, Camp had once, buzz) are kept at once. Before the bursts are
 * in, a tier's finish (Spark, Ring, Camp; work.md W04) skips its sparks, which
 * could only come late from a row that has moved on; a moment's burst
 * (celebrate, celebrateOnce) plays when they land, if its element is still on
 * the page.
 */
import type { CelebrateOptions } from "@/lib/celebrate"
import { feedback, type FeedbackKind } from "@/lib/ui/feedback"

type Bursts = typeof import("@/lib/celebrate")

let bursts: Bursts | undefined
let loading: Promise<Bursts | undefined> | undefined

/** Loads lib/celebrate once; a failed load is tried again. */
export function warmBursts(): Promise<Bursts | undefined> {
  return (loading ??= import("@/lib/celebrate").then(
    (m) => (bursts = m),
    () => (loading = undefined),
  ))
}

/** lib/celebrate once it is in; until then undefined (and loading). */
export function loadedBursts(): Bursts | undefined {
  if (!bursts) void warmBursts()
  return bursts
}

let warmed = false

/** Fetches lib/celebrate when the page is idle; once a page. */
export function warmBurstsWhenIdle(): void {
  if (warmed || typeof window === "undefined") return
  warmed = true
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(() => void warmBursts(), { timeout: 3000 })
  else window.setTimeout(() => void warmBursts(), 1500)
}

/** A moment's burst: now, or when lib/celebrate lands if `el` is still on the page. */
function whenIn(el: Element | null | undefined, play: (b: Bursts) => unknown): void {
  const b = loadedBursts()
  if (b) play(b)
  else void warmBursts().then((m) => m && (!el || el.isConnected) && play(m))
}

export function celebrate(el: Element | null | undefined, opts?: CelebrateOptions): void {
  whenIn(el, (b) => (opts ? b.celebrate(el, opts) : b.celebrate(el)))
}

export function celebrateOnce(key: string, el: Element | null | undefined, opts?: Parameters<Bursts["celebrateOnce"]>[2]): void {
  whenIn(el, (b) => (opts ? b.celebrateOnce(key, el, opts) : b.celebrateOnce(key, el)))
}

export function celebrateTask(el: Element | null | undefined): void {
  const b = loadedBursts()
  if (b) b.celebrateTask(el)
  else taskFinish()
}

export function celebrateRing(el: Element | null | undefined): void {
  const b = loadedBursts()
  if (b) b.celebrateRing(el)
  else buzz("impact")
}

/** True when the Camp moment is this person's now (the caller shows its toast). */
export function celebrateCamp(el: Element | null | undefined, kind: CampKind, uuid: string): boolean {
  const b = loadedBursts()
  return b ? b.celebrateCamp(el, kind, uuid) : campFinish(kind, uuid)
}

const coarse = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches

/** A tier's buzz (mobile F3), vibration only: a spark a selection, a ring an impact, Camp a success. */
export function buzz(kind: FeedbackKind): void {
  if (coarse()) feedback(kind)
}

let lastSpark = 0

/** Notes a finish: its spark count, 8 and a buzz, or 6 and none within 2 s of the last. */
export function taskFinish(): number {
  const now = Date.now()
  const streak = now - lastSpark < 2000
  lastSpark = now
  if (!streak) buzz("selection")
  return streak ? 6 : 8
}

/** Whether this person finished something in the last few seconds: a bigger finish that follows is theirs. */
export function sparkedRecently(withinMs = 4000): boolean {
  return lastSpark > 0 && Date.now() - lastSpark < withinMs
}

export type CampKind = "project" | "goal" | "cycle"

const CELEBRATED = "oc_celebrated"

/** Whether this person has had the Camp moment for this project or goal. */
export function hasCelebrated(kind: CampKind, uuid: string): boolean {
  try {
    return window.localStorage.getItem(`${CELEBRATED}:${kind}:${uuid}`) === "1"
  } catch {
    return false
  }
}

/** Camp's decision: true, remembered and buzzed, when the moment is this person's now; false if they had it. */
export function campFinish(kind: CampKind, uuid: string): boolean {
  if (!uuid || hasCelebrated(kind, uuid)) return false
  try {
    window.localStorage.setItem(`${CELEBRATED}:${kind}:${uuid}`, "1")
  } catch {
    /* private mode: it may repeat, which is harmless */
  }
  buzz("success")
  return true
}
