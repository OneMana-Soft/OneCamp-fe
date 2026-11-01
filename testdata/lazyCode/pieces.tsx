import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { lazyChunk } from "@/lib/loadChunk"

// App code for lib/testing/lazyCodeWait.test.tsx (V-138), loading code the ways the app does. vitest.config.ts compiles
// it as app source, so each import() below is known to the tests' code wait while it's in flight, as any app import()
// is. The code each one brings takes its time on purpose (a top-level await), as a cold import does on a busy
// machine, and each module loads once per test file, so each test waits on its own.

/** A piece through lazyPiece (lazyChunk): its code takes 1.5 s. */
export const Slow = lazyPiece(() => import("./slow"))

/** A piece whose code (0.8 s) draws another piece (0.8 s more). */
export const Outer = lazyPiece(() => import("./outer"))

let came = 0
/** A piece whose code takes 1.5 s, noting when it came. */
export const Timed = lazyPiece(() => import("./timed").then((code) => ((came = performance.now()), code)))
/** When Timed's code came: 0 until it has. */
export const cameAt = () => came

/** next/dynamic over a plain import(), as boardWorkbench draws its template picker: 1.5 s. */
export const ByDynamic = dynamic(() => import("./byDynamic"), { ssr: false })

/** A plain import() in an effect, drawn when it comes, as boardExport brings Excalidraw: 1.5 s. */
export function ByEffect() {
  const [words, setWords] = useState<string | null>(null)
  useEffect(() => {
    let shown = true
    void import("./byEffect").then((code) => shown && setWords(code.words))
    return () => void (shown = false)
  }, [])
  return words === null ? null : <p>{words}</p>
}

/** Code that keeps coming while it's drawn: a new load every 300 ms, as a poll that loads code would. */
export function KeepsLoading() {
  useEffect(() => {
    const poll = setInterval(() => void lazyChunk(() => import("./target")).use(() => undefined), 300)
    return () => clearInterval(poll)
  }, [])
  return <p>here</p>
}
