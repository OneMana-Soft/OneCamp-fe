"use client"

/**
 * Where this device keeps its place in the Work Change Log (projects WCL-2):
 * the Offline Store's meta, so a reload goes on from it, and in memory where
 * IndexedDB can't be opened (a private window), for the page's life.
 *
 * The store is the member's own: it is emptied when another member opens it,
 * and deleted at sign-out and on an expired session (lib/offline/wipe). A
 * place is no secret either way: the server answers each reader only what
 * they may see, from any place. Each use opens and closes the database, so a
 * connection held here never blocks that delete.
 */

import { done, inTx, openOfflineDB, STORES } from "@/lib/offline/db"

const KEY = "work-cursor"
let inMemory: string | undefined

async function withMeta<R>(mode: IDBTransactionMode, work: (meta: IDBObjectStore) => Promise<R>): Promise<R> {
  const db = await openOfflineDB()
  try {
    return await inTx(db, [STORES.meta], mode, (tx) => work(tx.objectStore(STORES.meta)))
  } finally {
    db.close()
  }
}

export async function readWorkCursor(): Promise<string | undefined> {
  try {
    const kept = await withMeta("readonly", (meta) => done(meta.get(KEY)) as Promise<unknown>)
    return typeof kept === "string" ? kept : inMemory
  } catch {
    return inMemory
  }
}

export async function keepWorkCursor(cursor: string): Promise<void> {
  inMemory = cursor
  try {
    await withMeta("readwrite", (meta) => done(meta.put(cursor, KEY)))
  } catch {
    // Kept in memory only, for this page's life.
  }
}
