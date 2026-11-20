import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"

/**
 * State that starts from a source and follows it: what `derive` makes of the
 * source, until the person changes it here (the setter), and again from each
 * new source (by identity, as SWR keeps an unchanged answer's object).
 *
 * It takes the place of an effect that copies an answer into useState. That
 * copy drew the whole component twice for each answer, once with the old
 * state and once more with the copy (V-1099: the phone's task page drew its
 * body twice per answer). Here the value is worked out while drawing, so an
 * answer draws once.
 *
 * `derive` reads only the source; it runs once per source.
 */
export function useSyncedState<S, T>(source: S, derive: (source: S) => T): [T, Dispatch<SetStateAction<T>>] {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- derive reads only the source
  const derived = useMemo(() => derive(source), [source])
  // A change made here, and the source it was made against.
  const [local, setLocal] = useState<{ from: S; value: T } | null>(null)
  const value = local !== null && Object.is(local.from, source) ? local.value : derived
  const latest = useRef({ source, value })
  latest.current = { source, value }
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setLocal((prev) => {
      const { source: from, value: now } = latest.current
      const base = prev !== null && Object.is(prev.from, from) ? prev.value : now
      return { from, value: typeof next === "function" ? (next as (prev: T) => T)(base) : next }
    })
  }, [])
  return [value, set]
}
