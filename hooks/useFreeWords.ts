"use client"

import { useEffect, useMemo, useState } from "react"

import { reloadForNewBuild } from "@/lib/newBuild"

type Grammar = typeof import("@/lib/search/query")

let grammar: Grammar | undefined

/**
 * The words of a search without its filters (from:, in:, dates): what the
 * AI's answer, the connected apps and Who knows search for. Every filter is
 * written with a colon (field:value), so a search without one is all words,
 * known from the first frame. One with a colon needs the grammar, a chunk of
 * its own shared with the filter chips, so the search page stays under its
 * source ceiling (app/firstLoad.test.ts): until it is here its words are
 * undefined, and nothing searches for half-read text. When it can't come
 * (offline), they're none, so what waits for them, the results first, draws
 * without them instead of waiting for ever. The page's next visit asks again.
 */
export function useFreeWords(text: string): string | undefined {
  const [loaded, setLoaded] = useState(grammar)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loaded) return
    let alive = true
    void import("@/lib/search/query").then(
      (m) => {
        grammar = m
        if (alive) setLoaded(m)
      },
      async (e: unknown) => {
        // A deploy since the page loaded: the new build's code, once, when the
        // server says the old is gone (lib/chunkRecovery). Else no words.
        if (await reloadForNewBuild(e)) return
        if (alive) setFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [loaded])
  return useMemo(() => {
    if (!text.includes(":")) return text.trim()
    return loaded ? loaded.freeWords(text) : failed ? "" : undefined
  }, [loaded, failed, text])
}
