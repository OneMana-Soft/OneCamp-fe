"use client"

import React, { useEffect, useSyncExternalStore } from "react"

/**
 * A part of a screen whose code is a chunk of its own: a chart or a query plan
 * in an AI answer, a late command answer, the invite form, the saved theme.
 * Its code is fetched the first time the part is drawn, or sooner through
 * warm(): an answer that opens a chart warms the chart while its numbers are
 * still streaming in.
 *
 * Three things a part of a screen needs that next/dynamic doesn't give it:
 *   - once its code is in, the part draws at once, with no placeholder frame;
 *   - while its code comes, the placeholder keeps the part's room;
 *   - when its code can't come (offline, a dropped connection), the part says
 *     so in its own room, with a way to try again, and the rest of the screen
 *     carries on. It tries again by itself when the browser is back online,
 *     and when another copy of the part is drawn. next/dynamic threw to the
 *     page's error boundary, so one chart that couldn't load took the whole
 *     page with it, and React kept that failure for the rest of the visit.
 *
 * The server draws the placeholder, as the browser's first render does, so
 * hydration matches. warm() is safe to call while rendering: it tells the
 * drawn parts only once the code has come or failed, never during a render.
 */
export interface LazyPart<P> {
  /** The part: drawn at once when its code is in; otherwise its placeholder, or its failure. */
  Part: React.FC<P>
  /** Fetches the part's code once (after a failure, again); true once it is in. */
  warm: () => Promise<boolean>
}

export interface LazyPartOptions<P> {
  /** Drawn while the code comes: keeps the part's room. */
  placeholder: React.ComponentType<P>
  /** Drawn when the code couldn't come; `retry` fetches it again. */
  failed: React.ComponentType<P & { retry: () => void }>
}

type State = "coming" | "in" | "failed"

const onServer = (): State => "coming"

export function lazyPart<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
  { placeholder: Placeholder, failed: Failed }: LazyPartOptions<P>,
): LazyPart<P> {
  let Loaded: React.ComponentType<P> | undefined
  let pending: Promise<boolean> | undefined
  let lastFailed = false
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const state = (): State => (Loaded ? "in" : lastFailed && !pending ? "failed" : "coming")

  function warm(): Promise<boolean> {
    if (Loaded) return Promise.resolve(true)
    if (typeof window === "undefined") return Promise.resolve(false)
    if (!pending) {
      const retrying = lastFailed
      pending = load()
        .then(
          (component) => {
            Loaded = component
            lastFailed = false
            return true
          },
          (error) => {
            lastFailed = true
            console.warn("[lazyPart] a part's code didn't load; it says so in its place:", error)
            return false
          },
        )
        .finally(() => {
          pending = undefined
          notify()
        })
      // A retry draws the placeholder again while it waits: said after this
      // render, as warm() may be called during one.
      if (retrying) queueMicrotask(notify)
    }
    return pending
  }

  const retry = () => void warm()

  function Part(props: P) {
    const now = useSyncExternalStore(subscribe, state, onServer)
    // The first part drawn fetches the code; one drawn after a failure tries
    // again, as the connection may be back without an "online" event.
    if (now === "coming") void warm()
    useEffect(() => {
      if (lastFailed) void warm()
    }, [])
    useEffect(() => {
      if (now !== "failed") return
      window.addEventListener("online", retry)
      return () => window.removeEventListener("online", retry)
    }, [now])
    if (now === "in" && Loaded) return <Loaded {...props} />
    if (now === "failed") return <Failed {...props} retry={retry} />
    return <Placeholder {...props} />
  }

  return { Part, warm }
}
