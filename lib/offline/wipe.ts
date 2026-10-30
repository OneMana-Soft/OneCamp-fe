"use client"

/**
 * Letting go of the Offline Store (lib/offline/store) when a session ends.
 *
 * The store holds data only: answers read and changes waiting to be sent,
 * never a token, a cookie or a credential. It is still the signed-in member's
 * own, so it goes whenever their session does: their own sign-out, an expired
 * session (a 401 the refresh can't answer: lib/axiosInstance's performLogout)
 * and another tab's sign-out all run endSession, which runs this. A member
 * switch on the same browser is the store's own check when it opens.
 *
 * lib/swrCache loads it when a session ends, so it rides on no route's first
 * load; once the store has loaded it (its own chunk), it also registers here.
 */

import { onSessionEnd } from "@/lib/sessionEnd"

/** The one database: whoever is signed in owns it (meta.member). */
export const OFFLINE_DB = "onecamp-offline"

const closers = new Set<() => void>()

/** The open store registers how to close itself, so deleting it is never blocked. */
export function onOfflineWipe(close: () => void): () => void {
  closers.add(close)
  return () => {
    closers.delete(close)
  }
}

/** Delete the whole store: every answer kept and every change waiting. */
export function wipeOfflineStore(): Promise<void> {
  for (const close of [...closers]) {
    try {
      close()
    } catch {
      // Closing is best effort; the delete below still runs.
    }
  }
  if (typeof indexedDB === "undefined") return Promise.resolve()
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.deleteDatabase(OFFLINE_DB)
    } catch {
      resolve()
      return
    }
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    // Another tab still holds it open: the delete finishes when it lets go
    // (that tab's own endSession closes it), and nothing here waits for that.
    request.onblocked = () => resolve()
  })
}

onSessionEnd(wipeOfflineStore)
