/** An answer's list, or none when it isn't one (a read that failed, or a shape it never had). Pure. */
export const listOf = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** One empty list for every "none", so an effect that depends on one doesn't run again each render. */
const NONE: readonly never[] = Object.freeze([])

/**
 * An answer's list as a screen reads it: undefined while the answer hasn't come,
 * so a section draws its loading rows for that alone, and a list once it has,
 * [] for none however the server wrote it (null, nothing or []). A null read as
 * "not read yet" kept a project's empty Milestones loading for ever (V-51, V-52). Pure.
 */
export function listOnceRead<A, T>(answer: A | undefined, pick: (answer: A) => unknown): T[] | undefined {
  if (answer === undefined) return undefined
  const list = pick(answer)
  return Array.isArray(list) ? (list as T[]) : (NONE as unknown as T[])
}
