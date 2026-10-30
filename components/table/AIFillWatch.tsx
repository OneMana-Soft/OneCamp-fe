"use client"

import * as React from "react"
import { stopTableAIFill, type AIFill } from "@/services/tableService"
import { aiFillHeard } from "@/lib/tables/aiFills"
import { toast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useAIFills } from "@/lib/tables/useAIFills"
import { useMyId } from "@/hooks/useMyId"
import { formatLocale } from "@/lib/tables/numberFormat"

const n = (v: number) => formatLocale(v, {})

/** An ended fill's note: what it wrote and skipped, and whether it was stopped. Pure. */
export function fillEnded(f: AIFill): { title: string; description: string } {
  const skipped = Math.max(f.asked - f.filled, 0)
  const wrote = `Filled ${n(f.filled)} ${f.filled === 1 ? "cell" : "cells"}${skipped ? `, skipped ${n(skipped)}` : ""}`
  return f.state === "stopped"
    ? { title: "AI fill stopped", description: `${wrote}; ${n(Math.max(f.total - f.asked, 0))} left unfilled.` }
    : { title: "AI fill complete", description: `${wrote}.` }
}

/**
 * A table's AI fills, watched (useAIFills): a chunk of its own, mounted only
 * on a table with an AI column, so a table's first screen carries none of it.
 * It hands the grid the running fills by column, each marked mine when this
 * person started it (they may stop it; the server checks), and a fill this
 * tab started that ends, with its note.
 */
export function AIFillWatch({ tableId, onFills, onEnded }: { tableId: string; onFills: (byField: Map<string, AIFill>) => void; onEnded: (fill: AIFill, note: { title: string; description: string }) => void }) {
  const byField = useAIFills(tableId, (f) => onEnded(f, fillEnded(f)))
  const myId = useMyId()
  React.useEffect(() => {
    // Stop says so when it couldn't: the fill goes on (CR-32's SF2).
    const stop = (f: AIFill) =>
      stopTableAIFill(tableId, f.field_id)
        .then((now) => now && aiFillHeard(tableId, now))
        .catch((e) => toast({ variant: "destructive", title: "Couldn't stop the fill", description: apiErrorMessage(e, "It's still running. Try Stop again in a moment.") }))
    onFills(new Map([...byField].map(([field, f]) => [field, { ...f, mine: !!myId && f.started_by === myId, stop: () => void stop(f) }])))
  }, [byField, myId, onFills, tableId])
  return null
}
