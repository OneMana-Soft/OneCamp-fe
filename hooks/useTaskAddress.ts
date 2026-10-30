"use client"

import { useEffect, useState } from "react"
import { toast } from "@/hooks/use-toast"
import type { PlacedAddress } from "@/lib/task/newTaskAddress"

/**
 * A link's new-task fields (its query, as taskAddressQuery gives it), placed
 * for the New task form. Their parser loads only when a link names some, so
 * the pages that make tasks don't carry it: until then the form waits (ready
 * is false), so it starts from them. If the parser can't load, the form opens
 * empty, and a toast says why.
 */
export function useTaskAddress(query: string): { ready: boolean; address?: PlacedAddress } {
  const [placed, setPlaced] = useState<{ query: string; address?: PlacedAddress }>({ query: "" })
  useEffect(() => {
    if (!query) return
    let live = true
    import("@/lib/task/newTaskAddress").then(
      (m) => {
        if (live) setPlaced({ query, address: m.placeAddress(query) })
      },
      () => {
        if (!live) return
        setPlaced({ query })
        toast({ variant: "destructive", title: "The link's fields didn't load", description: "Fill in the task here, or open the link again." })
      },
    )
    return () => {
      live = false
    }
  }, [query])
  return placed.query === query ? { ready: true, address: placed.address } : { ready: !query }
}
