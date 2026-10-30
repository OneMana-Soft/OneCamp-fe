"use client"

import { useEffect, useState } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { runWhenSettled } from "@/lib/ui/whenQuiet"
import { SHOW_AFTER_MS, keysTipSeen, knowsTheKeys, markSeen, onComputer } from "./keysTip"

const tip = lazyPart<{ showAfterMs: number }>(() => import("./KeyboardTip").then((m) => m.KeyboardTip))

/**
 * The keys tip's code, only when the tip may show: once per browser, on a
 * computer, fetched once the first screen has settled (lib/ui/whenQuiet). It
 * still rises 6 s into the visit, or as soon as its code is in after that.
 * Until then this listens for the keys itself: ⌘K or ? pressed first means
 * the person knows them, and the tip never comes.
 */
export function KeysTipLoader() {
  const [showAfterMs, setShowAfterMs] = useState<number | null>(null)
  useEffect(() => {
    if (keysTipSeen() || !onComputer()) return
    const started = performance.now()
    let cancel = () => {}
    const onKey = (e: KeyboardEvent) => {
      if (!knowsTheKeys(e)) return
      markSeen()
      stop()
    }
    const stop = () => {
      cancel()
      document.removeEventListener("keydown", onKey)
    }
    document.addEventListener("keydown", onKey)
    cancel = runWhenSettled([
      () =>
        tip.warm().then((ok) => {
          if (!ok || keysTipSeen()) return
          // The tip listens for itself from here.
          document.removeEventListener("keydown", onKey)
          setShowAfterMs(Math.max(0, SHOW_AFTER_MS - (performance.now() - started)))
        }),
    ])
    return stop
  }, [])
  return showAfterMs === null ? null : <tip.Part showAfterMs={showAfterMs} />
}
