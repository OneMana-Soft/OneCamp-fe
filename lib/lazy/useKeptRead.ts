"use client"

import * as React from "react"

// A read for a lazy view or dialog, which imports none of the shared core
// (app/releasesLazy.test, app/slaLazy.test): its page hands it the HTTP client
// and the view reads through it here. Releases (P10-1b) and a project's SLA
// settings and policies (linear-24 W2) read this way.
// What was last read, by path, while the page lives.
const kept = new Map<string, unknown>()
// Who draws each path now: a write's answer kept by one reader reaches every
// reader of its path mounted on the page (V-1227), and no reader of another.
const readers = new Map<string, Set<(got: unknown) => void>>()

function hear(path: string, show: (got: unknown) => void) {
  const heard = readers.get(path) ?? new Set<(got: unknown) => void>()
  readers.set(path, heard.add(show))
  return () => {
    heard.delete(show)
    if (!heard.size && readers.get(path) === heard) readers.delete(path)
  }
}

/**
 * A read through the page's client: what was kept for its path at once, then
 * the server's; again when the window is shown again, and on again(). A read
 * that fails keeps what is on screen and says failed. keep() takes a write's
 * answer as the read's, with no read again, for every reader of the path
 * mounted on the page; again() answers its own reader (a read can land after a
 * newer write, and every reader reads again when shown).
 */
export function useKeptRead<T>(path: string | null, load: () => Promise<T>) {
  const [data, setData] = React.useState<T | undefined>(() => (path ? (kept.get(path) as T | undefined) : undefined))
  const [failed, setFailed] = React.useState(false)
  const [shown, setShown] = React.useState(path)
  if (shown !== path) {
    setShown(path)
    setData(path ? (kept.get(path) as T | undefined) : undefined)
    setFailed(false)
  }
  const again = React.useCallback(async () => {
    if (!path) return
    try {
      const got = await load()
      kept.set(path, got)
      setData(got)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [path, load])
  const keep = React.useCallback(
    (got: T) => {
      if (!path) {
        setData(got)
        setFailed(false)
        return
      }
      kept.set(path, got)
      readers.get(path)?.forEach((show) => show(got))
    },
    [path],
  )
  React.useEffect(() => {
    if (!path) return
    return hear(path, (got) => {
      setData(got as T)
      setFailed(false)
    })
  }, [path])
  React.useEffect(() => {
    void again()
    const onShow = () => document.visibilityState === "visible" && void again()
    window.addEventListener("focus", onShow)
    document.addEventListener("visibilitychange", onShow)
    return () => {
      window.removeEventListener("focus", onShow)
      document.removeEventListener("visibilitychange", onShow)
    }
  }, [again])
  return { data, failed, again, keep }
}
