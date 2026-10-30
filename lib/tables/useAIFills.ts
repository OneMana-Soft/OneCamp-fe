"use client"

import * as React from "react"
import { listTableAIFills, type AIFill } from "@/services/tableService"
import { onAIFill } from "@/lib/tables/aiFills"

// The fills this tab started: when one ends, its person is told, with Undo.
const mine = new Set<string>()

/** Notes a fill this tab started, so its end is offered back (useAIFills' onEnded). */
export function noteMyFill(fill?: AIFill): void {
  if (fill && fill.state === "running") mine.add(fill.id)
}

// While a fill runs, its table's fills are read again this often too: the
// topic carries each move, but a page whose live link is down (or never came)
// still sees the fill move on, stop and end.
const POLL_MS = 10_000

/**
 * A table's running AI fills, by column: read once, then kept as the table's
 * topic says they move (lib/tables/aiFills), and read again every POLL_MS
 * while one runs. A fill this tab started that stops or ends is handed to
 * onEnded once.
 */
export function useAIFills(tableId: string, onEnded?: (fill: AIFill) => void): Map<string, AIFill> {
  const [byField, setByField] = React.useState<Map<string, AIFill>>(() => new Map())
  const ended = React.useRef(onEnded)
  ended.current = onEnded
  const running = React.useRef(0)
  running.current = byField.size
  const shown = React.useRef(byField)
  shown.current = byField
  React.useEffect(() => {
    let live = true
    // A fill's last word wins: a message that comes late never brings back
    // one that ended, nor moves one back.
    const over = new Set<string>()
    const take = (f: AIFill) => {
      if (over.has(f.id)) return
      setByField((prev) => {
        const was = prev.get(f.field_id)
        if (f.state === "running" && was?.id === f.id && was.asked > f.asked) return prev
        const next = new Map(prev)
        if (f.state === "running") next.set(f.field_id, f)
        else if (was?.id === f.id) next.delete(f.field_id)
        else return prev
        return next
      })
      if (f.state !== "running") {
        over.add(f.id)
        if (mine.delete(f.id)) ended.current?.(f)
      }
    }
    const off = onAIFill(tableId, take)
    const read = () => {
      // A fill shown before the read that the list no longer names has gone
      // stale (the server stops listing one with no move for an hour): it
      // goes, or its header would say "Filling" until the page is opened
      // again (CR-32's SF3). One heard while the read was out stays.
      const before = new Set([...shown.current.values()].map((f) => f.id))
      return listTableAIFills(tableId)
        .then((fills) => {
          if (!live) return
          for (const f of fills) take(f)
          const named = new Set(fills.map((f) => f.id))
          setByField((prev) => {
            const gone = [...prev].filter(([, f]) => before.has(f.id) && !named.has(f.id))
            if (!gone.length) return prev
            const next = new Map(prev)
            for (const [field] of gone) next.delete(field)
            return next
          })
        })
        .catch(() => {
          // progress is a nicety: the cells still come as they're written
        })
    }
    void read()
    const poll = setInterval(() => {
      if (running.current > 0) void read()
    }, POLL_MS)
    return () => {
      live = false
      off()
      clearInterval(poll)
    }
  }, [tableId])
  return byField
}
