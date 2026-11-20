"use client"

import { useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { useStableCallback } from "@/hooks/useStableCallback"

// One toast per overlay (DB-151): a repeat failure replaces it; its code coming (overlayCame) takes it down.
const said = new Map<string, { dismiss(): void }>()
export const overlayCame = (title: string) => said.get(title)?.dismiss()

/** A lazy overlay whose code couldn't come as it opened: it says so, once per draw, and closes, freeing its opener. */
export function OverlayUnavailable({ title, onClose }: { title: string; onClose: () => void }) {
  const close = useStableCallback(onClose)
  useEffect(() => {
    overlayCame(title)
    said.set(title, toast({ title, description: "Check your connection, then try again.", variant: "destructive" }))
    close()
  }, [title, close])
  return null
}
