// How a task waits on another. Most often finish to start: it can start once
// the other is done. Also start to start, finish to finish and start to
// finish, each with a lag in days after (or, below zero, before). The server
// keeps them as facets of the dependency's edge; one with none is finish to
// start with no lag.

import { addDays } from "date-fns"

export type DependencyKind = "fs" | "ss" | "ff" | "sf"

export const DEPENDENCY_KINDS: readonly DependencyKind[] = ["fs", "ss", "ff", "sf"]

/** The longest lag, either way, in days (the server's MaxLag). */
export const MAX_LAG = 365

/**
 * A dependency's facets as the server sends them, on the task at the other
 * end: under task_blocked_by on what a task waits on, under task_blocks on
 * what waits on it.
 */
export interface DependencyFacets {
  "task_blocked_by|kind"?: string
  "task_blocked_by|lag"?: number
  "task_blocks|kind"?: string
  "task_blocks|lag"?: number
}

export interface DependencyWay {
  kind: DependencyKind
  lag: number
}

const isKind = (k: unknown): k is DependencyKind => DEPENDENCY_KINDS.includes(k as DependencyKind)

/** How a dependency works, read from either end's facets. */
export function wayOf(edge: DependencyFacets): DependencyWay {
  const kind = edge["task_blocked_by|kind"] ?? edge["task_blocks|kind"]
  const lag = edge["task_blocked_by|lag"] ?? edge["task_blocks|lag"] ?? 0
  return { kind: isKind(kind) ? kind : "fs", lag: Number.isFinite(lag) ? lag : 0 }
}

/**
 * An entry with the facets the server would send for way in place of the ones
 * it had, under task_blocked_by or task_blocks: how the timeline and a panel
 * show a change at once.
 */
export function withWay<T extends object>(entry: T, under: "task_blocked_by" | "task_blocks", way: DependencyWay): T & DependencyFacets {
  const out: T & DependencyFacets = { ...entry }
  delete out[`${under}|lag`]
  out[`${under}|kind`] = way.kind
  if (way.lag) out[`${under}|lag`] = way.lag
  return out
}

/** Which end of each task a dependency ties: the waited-on task's, then the waiting task's. */
export function endsOf(kind: DependencyKind): { from: "start" | "end"; to: "start" | "end" } {
  return {
    from: kind === "ss" || kind === "sf" ? "start" : "end",
    to: kind === "fs" || kind === "ss" ? "start" : "end",
  }
}

export const KIND_LABEL: Record<DependencyKind, string> = {
  fs: "Finish to start",
  ss: "Start to start",
  ff: "Finish to finish",
  sf: "Start to finish",
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`

/** A lag in a few characters: "+2d", "−1d", or nothing. */
export function lagShort(lag: number): string {
  if (!lag) return ""
  return `${lag > 0 ? "+" : "−"}${Math.abs(lag)}d`
}

/** A dependency in a few words, for beside the other task's name: "Finish to start +2d". */
export function wayShort(way: DependencyWay): string {
  const lag = lagShort(way.lag)
  return lag ? `${KIND_LABEL[way.kind]} ${lag}` : KIND_LABEL[way.kind]
}

/**
 * A dependency in a sentence, naming both tasks: "Build can't start until 2
 * days after Design finishes."
 */
export function waySentence(way: DependencyWay, waiting: string, on: string): string {
  const { from, to } = endsOf(way.kind)
  const verb = to === "start" ? "start" : "finish"
  const theirs = from === "start" ? "starts" : "finishes"
  const when = way.lag > 0 ? `${days(way.lag)} after ` : way.lag < 0 ? `${days(-way.lag)} before ` : ""
  return `${waiting} can't ${verb} until ${when}${on} ${theirs}.`
}

/** A lag as typed: a whole number of days within MAX_LAG either way, or null. "" is none. */
export function parseLag(s: string): number | null {
  const t = s.trim().replace(/^[−–]/, "-")
  if (t === "") return 0
  if (!/^[+-]?\d+$/.test(t)) return null
  const n = Number(t)
  return Math.abs(n) <= MAX_LAG ? n : null
}

interface Days {
  start: Date
  end: Date
}

/**
 * Whether the waiting task's days keep to the dependency on the other's: the
 * day the dependency ties it to, plus the lag, is its first (or, for the
 * finishing kinds, last) day at the earliest. Both are spans of local
 * midnights, both ends included; finish to start begins the day after.
 */
export function wayKept(way: DependencyWay, waitedOn: Days, waiting: Days): boolean {
  const { from, to } = endsOf(way.kind)
  let earliest = addDays(from === "start" ? waitedOn.start : waitedOn.end, way.lag)
  if (way.kind === "fs") earliest = addDays(earliest, 1)
  return (to === "start" ? waiting.start : waiting.end) >= earliest
}
