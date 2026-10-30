"use client"

import { inTx, openOfflineDB, STORES } from "@/lib/offline/db"
import { TASK } from "@/lib/offline/tasks"

/**
 * The id of the task this device keeps under a task's key (Q4-12, as /app/task/Q4-12 reads it), or undefined.
 *
 * A task's page reads by its key as well as its id: the panel's own Open the full page and Copy link give the key.
 * The device keeps tasks by id (lib/offline/store's records, each with its fields as an answer showed them), so a
 * key's page opened with no network (asana-12 (a), components/rightPanel/TaskInPlace) finds its task here.
 *
 * A module of its own: only TaskInPlace's chunk asks, so no route's first load carries it (V-49). The store's
 * database is opened for the one look and closed after it, so signing out can always wipe it (lib/offline/wipe).
 */
export async function keptTaskOf(key: string): Promise<string | undefined> {
  const db = await openOfflineDB().catch(() => undefined)
  if (!db) return undefined
  try {
    return await inTx(db, [STORES.records], "readonly", (tx) =>
      new Promise<string | undefined>((resolve, reject) => {
        const look = tx.objectStore(STORES.records).openCursor(IDBKeyRange.bound([TASK, ""], [TASK, "￿"]))
        look.onsuccess = () => {
          const at = look.result
          if (!at) return resolve(undefined)
          const kept = at.value as { id: string; value?: Record<string, unknown> }
          if (kept.value?.task_key === key) return resolve(kept.id)
          at.continue()
        }
        look.onerror = () => reject(look.error)
      }),
    )
  } catch {
    return undefined
  } finally {
    db.close()
  }
}
