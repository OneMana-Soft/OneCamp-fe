import type { SaveState } from "@/components/docEditor/SaveDot"
import type { SessionStatus } from "@/lib/collabSession"

/** A live session's status, as lib/collabSession reports it. */
export type CollabStatus = SessionStatus

/**
 * The save dot's state (content.md D12), from what the page knows. Pure.
 *
 * - A live (collaborative) doc: offline when the device is; connecting until
 *   its first sync (the reader is on the saved copy, never "saving");
 *   reconnecting when the socket dropped after that while the device is
 *   online, as the connection pill says; saving while this tab's edits are
 *   not yet stored; otherwise saved.
 * - A reader's copy: nothing to save. (The body is never saved over HTTP: the
 *   collaboration server stores it.)
 */
export function docSaveState({
  live,
  collabStatus,
  synced,
  everSynced,
  slowSave,
}: {
  live: boolean
  collabStatus?: CollabStatus
  synced?: boolean
  everSynced?: boolean
  slowSave?: boolean
}): SaveState {
  if (live) {
    if (collabStatus === "offline") return "offline"
    if (!synced && !everSynced) return "connecting"
    if (collabStatus === "disconnected") return "reconnecting"
    return slowSave ? "saving" : "saved"
  }
  return "saved"
}
