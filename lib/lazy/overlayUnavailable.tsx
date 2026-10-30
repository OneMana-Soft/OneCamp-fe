"use client"

import { useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { useStableCallback } from "@/hooks/useStableCallback"

/**
 * An overlay (a dialog, a sheet) whose code couldn't come as it opened:
 * lazyPart's failed part for one. It says so in a toast and closes, so the
 * button that opened it is free again, and the next open fetches the code
 * again. Once each time it's drawn: a parent that redraws with a new onClose
 * doesn't say it twice.
 */
export function OverlayUnavailable({ title, onClose }: { title: string; onClose: () => void }) {
  const close = useStableCallback(onClose)
  useEffect(() => {
    toast({ title, description: "Check your connection, then try again.", variant: "destructive" })
    close()
  }, [title, close])
  return null
}
