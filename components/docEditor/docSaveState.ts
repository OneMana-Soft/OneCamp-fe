"use client"

import * as React from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import type { SaveState } from "@/components/docEditor/SaveDot"
import type { SaveStatus } from "@/hooks/useDocAutoSave"

type CollabStatus = "connecting" | "connected" | "disconnected" | "synced" | "offline"

/**
 * Whether a collaborative doc has changes the server has not confirmed for
 * more than a moment. Changes are normally confirmed in a few milliseconds, so
 * this stays false (and renders nothing new) while someone types.
 */
export function useSlowSave(provider: HocuspocusProvider | undefined | null, afterMs = 700): boolean {
  const [slow, setSlow] = React.useState(false)
  React.useEffect(() => {
    if (!provider) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onUnsynced = ({ number }: { number: number }) => {
      if (number > 0) {
        if (!timer) timer = setTimeout(() => setSlow(true), afterMs)
        return
      }
      if (timer) clearTimeout(timer)
      timer = null
      setSlow(false)
    }
    provider.on("unsyncedChanges", onUnsynced)
    return () => {
      provider.off("unsyncedChanges", onUnsynced)
      if (timer) clearTimeout(timer)
    }
  }, [provider, afterMs])
  return slow
}

/**
 * The save dot's state (content.md D12), from what the page knows. Pure.
 *
 * - A live (collaborative) doc: offline when the socket says so; connecting
 *   until its first sync (the reader is on the saved copy, never "saving");
 *   saving only while the server is slow to confirm; otherwise saved.
 * - A doc saved over HTTP: its autosave's own status.
 */
export function docSaveState({
  live,
  collabStatus,
  synced,
  everSynced,
  slowSave,
  saveStatus,
}: {
  live: boolean
  collabStatus?: CollabStatus
  synced?: boolean
  everSynced?: boolean
  slowSave?: boolean
  saveStatus?: SaveStatus
}): SaveState {
  if (live) {
    if (collabStatus === "offline") return "offline"
    if (!synced && !everSynced) return "connecting"
    if (collabStatus === "disconnected") return "offline"
    return slowSave ? "saving" : "saved"
  }
  switch (saveStatus) {
    case "saving":
      return "saving"
    case "error":
      return "failed"
    case "offline":
      return "offline"
    default:
      return "saved"
  }
}
