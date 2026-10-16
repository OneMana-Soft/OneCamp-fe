"use client"

import { useSyncExternalStore } from "react"
import { COARSE_QUERY, rightPanelPlacement, shellBand, type ShellBand } from "@/lib/ui/shellBand"

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(COARSE_QUERY)
  window.addEventListener("resize", onChange)
  mq?.addEventListener?.("change", onChange)
  return () => {
    window.removeEventListener("resize", onChange)
    mq?.removeEventListener?.("change", onChange)
  }
}

const snapshot = (): ShellBand => shellBand(window.innerWidth, !!window.matchMedia?.(COARSE_QUERY).matches)

/**
 * The shell band this screen is in (lib/ui/shellBand), followed as the window
 * or the pointer changes. A string, so a resize that keeps the band re-renders
 * nothing. "desktop" on the server: the shell only mounts in the browser.
 */
export function useShellBand(): ShellBand {
  return useSyncExternalStore(subscribe, snapshot, () => "desktop")
}

const placement = () => rightPanelPlacement(window.innerWidth, snapshot())

/**
 * Where the right panel opens on this screen (lib/ui/shellBand): beside the
 * page, or over it. "beside" on the server.
 */
export function usePanelPlacement(): "beside" | "over" {
  return useSyncExternalStore(subscribe, placement, () => "beside")
}
