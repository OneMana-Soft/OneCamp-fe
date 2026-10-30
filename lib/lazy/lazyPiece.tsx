"use client"

import React, { useEffect, useState, useSyncExternalStore } from "react"
import { lazyChunk } from "@/lib/loadChunk"

// A leaf on purpose. The primitives draw their pieces through lazyPiece (Button's
// disabled tip, a drawer's header, a menu's sub-step head), so every route that
// draws a button reaches this file: it pulls in nothing but lazyChunk, and
// lib/lazy/lazyPart builds on it, never the reverse.

/** A part or piece with no room to keep draws nothing while its code comes, or if it fails. */
export const Nothing = () => null

const RELOADING = new Promise<never>(() => {})

/**
 * The code, or null when it couldn't come (no network, a dropped connection),
 * with a warning. While the page reloads into a new build (the server said the
 * old build's file is gone), it never settles: the piece stays as it is until
 * the page goes.
 */
export function codeOrSaid<M>(chunk: ReturnType<typeof lazyChunk<M>>, who: string): Promise<M | null> {
  let failed = false
  return chunk
    .use((cause) => {
      failed = true
      console.warn(`[${who}] a piece's code didn't load; it says so in its place:`, cause)
    })
    .then((code) => code ?? (failed ? null : RELOADING))
}

/** What a lazy view draws when its code can't come: told how to ask again. */
export type LazyPieceFailed<P> = React.ComponentType<P & { retry: () => void }>

/** A lazy view: React.lazy's component, and warm() to fetch its code ahead without drawing it. */
export type LazyPiece<P> = React.FC<P> & { warm: () => void }

/**
 * React.lazy's place, for every piece of the app whose code comes when it's
 * first drawn (an editor's "@" list, a block's view, a menu): the same
 * component, drawn the same way (the server draws it whole; in the browser the
 * Suspense boundary around it shows its fallback while the code comes), but
 * its failure never reaches the page's error boundary.
 *
 * React.lazy threw a failed fetch to the nearest error boundary, which in an
 * editor is the page's: "Something broke on this page" took the doc's place,
 * with what was typed only in that page's memory, and React kept the failure,
 * so Try again threw again (V-64b). Here a piece whose code can't come draws
 * `failed` in its own room instead (nothing, by default), and asks again when
 * the browser is back online, when it's next drawn, or when `failed` calls
 * retry. The code comes through lazyChunk, so a deploy reloads the page once
 * instead (lib/chunkRecovery). lib/lazy/lazyPieceGuard.test.ts keeps React.lazy out
 * of the app.
 */
// React.lazy's own shape: any component, with the props it takes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPiece<T extends React.ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  { failed: Failed = Nothing }: { failed?: LazyPieceFailed<React.ComponentProps<T>> } = {},
): LazyPiece<React.ComponentProps<T>> {
  type P = React.ComponentProps<T>
  const chunk = lazyChunk(load)
  let down = false
  // ...and has been drawn: a first draw that waited for that try draws it, so it asks once, not twice.
  let drawn = false
  let version = 0
  const listeners = new Set<() => void>()
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const current = () => version

  function Down(props: P) {
    useEffect(() => {
      drawn = true
      window.addEventListener("online", retry)
      return () => window.removeEventListener("online", retry)
    }, [])
    return <Failed {...props} retry={retry} />
  }
  // React.lazy keeps what its loader gave, a failure too: each try is a lazy of its own.
  const attempt = (): React.ComponentType<P> => {
    down = drawn = false
    return React.lazy<React.ComponentType<P>>(() =>
      codeOrSaid(chunk, "lazyPiece").then((code) => {
        down = !code
        return code ?? { default: Down }
      }),
    )
  }
  let View = attempt()
  function retry() {
    View = attempt()
    version++
    listeners.forEach((l) => l())
  }

  function LazyPiece(props: P) {
    // A piece drawn after a failure asks again before it draws (its next use); those drawn already follow after this
    // render, never during it.
    useState(() => {
      if (!down || !drawn) return
      View = attempt()
      version++
      queueMicrotask(() => listeners.forEach((l) => l()))
    })
    useSyncExternalStore(subscribe, current, current)
    return <View {...props} />
  }
  return Object.assign(LazyPiece, { warm: chunk.warm })
}
