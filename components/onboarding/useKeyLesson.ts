"use client"

/**
 * The guided first run's key lesson, taught by doing (design-15, as Linear's
 * command-menu lesson is): pressing a key presses its chip and ticks its row.
 * Apart from KeyboardTip's own (it shows after a wait, and marks itself seen),
 * so only the run, loaded when it opens, carries this one.
 */
import { useEffect, useState } from "react"
import { rowOf, type Row as KeyRow } from "@/components/onboarding/keysTip"

/** The rows pressed now and tried so far, while `active`. */
export function useKeyLesson(active: boolean): { pressed: KeyRow | null; done: Set<KeyRow> } {
  const [pressed, setPressed] = useState<KeyRow | null>(null)
  const [done, setDone] = useState<Set<KeyRow>>(() => new Set())
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const row = rowOf(e)
      if (!row) return
      setPressed(row)
      setDone((d) => (d.has(row) ? d : new Set(d).add(row)))
    }
    const onUp = () => setPressed(null)
    document.addEventListener("keydown", onKey)
    document.addEventListener("keyup", onUp)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("keyup", onUp)
    }
  }, [active])
  return { pressed, done }
}
