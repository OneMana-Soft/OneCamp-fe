"use client"

/** IndexedDB, as promises: just what the Offline Store needs. */

import { OFFLINE_DB } from "@/lib/offline/wipe"

export const STORES = {
  meta: "meta",
  records: "records",
  reads: "reads",
  outbox: "outbox",
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

const VERSION = 1
const ALL: string[] = Object.values(STORES)

/**
 * The store's database. One that exists without the store's tables (made by
 * an open that named no version) is opened again one version up, which makes
 * them.
 */
export async function openOfflineDB(): Promise<IDBDatabase> {
  const db = await openAt(VERSION)
  if (ALL.every((s) => db.objectStoreNames.contains(s))) return db
  const next = db.version + 1
  db.close()
  return openAt(next)
}

function openAt(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"))
      return
    }
    const request = indexedDB.open(OFFLINE_DB, version)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta)
      if (!db.objectStoreNames.contains(STORES.records)) db.createObjectStore(STORES.records, { keyPath: ["kind", "id"] })
      if (!db.objectStoreNames.contains(STORES.reads)) db.createObjectStore(STORES.reads, { keyPath: "key" })
      if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: "seq", autoIncrement: true })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("The offline store is held open elsewhere"))
  })
}

/** A request's result. */
export function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run work in one transaction; resolves with its result once the transaction commits. */
export function inTx<R>(db: IDBDatabase, stores: StoreName[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<R> | R): Promise<R> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let result: R
    let failed: unknown
    tx.oncomplete = () => (failed === undefined ? resolve(result) : reject(failed))
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? failed ?? new Error("aborted"))
    Promise.resolve()
      .then(() => work(tx))
      .then(
        (r) => {
          result = r
        },
        (e) => {
          failed = e
          try {
            tx.abort()
          } catch {
            // Already finished.
          }
        },
      )
  })
}
