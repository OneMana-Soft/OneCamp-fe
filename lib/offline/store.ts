"use client"

/**
 * The Offline Store (projects P7-1; PROGRAM.md #89's first step): what the
 * signed-in member has read, kept on this device, and the changes they made
 * while the network was gone, waiting to be sent (lib/offline/outbox).
 *
 * GENERIC, keyed by entity kind: tasks are the first kind (lib/offline/tasks);
 * docs and tables register their own kinds and reuse this, never copy it.
 *
 * - records: one entity's latest answer, by [kind, id]. Each kind says how to
 *   find its entities in an answer.
 * - reads: a whole answer by the address it was read from, with when, and
 *   which entities it shows ("kind:id"), so losing an entity drops the reads
 *   that show it.
 *
 * Permission model: the store grants nothing. It is the member's own (meta
 * "member"); opened for anyone else, it is emptied first. It holds data only,
 * never a token or a credential, and is deleted at sign-out, on an expired
 * session and on a member switch (lib/offline/wipe). An entity the server
 * answers 403 or 404 for is dropped, with its reads and its waiting changes.
 */

import { STORES, done, inTx, openOfflineDB } from "@/lib/offline/db"
import { onOfflineWipe } from "@/lib/offline/wipe"

export interface EntityRef {
  kind: string
  id: string
}

export interface KindSpec {
  kind: string
  /** The entities an answer shows, with each one's value as it shows it. */
  entitiesOf(answer: unknown): { id: string; value: Record<string, unknown> }[]
}

export interface StoredRecord extends EntityRef {
  value: Record<string, unknown>
  savedAt: number
}

export interface StoredRead {
  key: string
  answer: unknown
  savedAt: number
  refs: string[]
}

const kinds = new Map<string, KindSpec>()

export function registerKind(spec: KindSpec): void {
  kinds.set(spec.kind, spec)
}

export function refOf(kind: string, id: string): string {
  return `${kind}:${id}`
}

/** Where the id the server made a device's create under is kept, by the device's id. */
export const madeKey = (id: string) => `made:${id}`

export class OfflineStore {
  private constructor(
    readonly db: IDBDatabase,
    readonly member: string,
    private readonly unregister: () => void,
  ) {}

  /**
   * The store for member. Anything kept for someone else on this browser is
   * emptied first: one member's answers and waiting changes never reach the next.
   */
  static async open(member: string): Promise<OfflineStore> {
    if (!member) throw new Error("No member")
    const db = await openOfflineDB()
    const unregister = onOfflineWipe(() => db.close())
    db.onversionchange = () => db.close()
    const store = new OfflineStore(db, member, unregister)
    await inTx(db, [STORES.meta, STORES.records, STORES.reads, STORES.outbox], "readwrite", async (tx) => {
      const owner = await done(tx.objectStore(STORES.meta).get("member"))
      if (owner !== member) {
        tx.objectStore(STORES.records).clear()
        tx.objectStore(STORES.reads).clear()
        tx.objectStore(STORES.outbox).clear()
        // The ids the server made another member's creates under go too.
        tx.objectStore(STORES.meta).clear()
        tx.objectStore(STORES.meta).put(member, "member")
      }
    })
    return store
  }

  close(): void {
    this.unregister()
    this.db.close()
  }

  async get(kind: string, id: string): Promise<StoredRecord | undefined> {
    return inTx(this.db, [STORES.records], "readonly", (tx) => done(tx.objectStore(STORES.records).get([kind, id])))
  }

  /**
   * Keep an answer read from key: the answer whole, and each entity it shows
   * under every registered kind, merged over what was kept before (a list
   * shows fewer fields than a task's own page).
   */
  async saveRead(key: string, answer: unknown, now = Date.now()): Promise<void> {
    const found: { kind: string; id: string; value: Record<string, unknown> }[] = []
    for (const spec of kinds.values()) {
      for (const entity of spec.entitiesOf(answer)) found.push({ kind: spec.kind, ...entity })
    }
    await inTx(this.db, [STORES.records, STORES.reads], "readwrite", async (tx) => {
      const records = tx.objectStore(STORES.records)
      const before = await Promise.all(found.map((f) => done(records.get([f.kind, f.id])) as Promise<StoredRecord | undefined>))
      found.forEach((f, i) => {
        records.put({ kind: f.kind, id: f.id, value: { ...(before[i]?.value ?? {}), ...f.value }, savedAt: now } satisfies StoredRecord)
      })
      tx.objectStore(STORES.reads).put({ key, answer, savedAt: now, refs: found.map((f) => refOf(f.kind, f.id)) } satisfies StoredRead)
    })
  }

  /**
   * The ids the server made creates under (P7-1c), for those of ids the device
   * gave and the server has made since: a screen still showing one goes on
   * under the server's id.
   */
  async madeIds(ids: string[]): Promise<Record<string, string>> {
    return inTx(this.db, [STORES.meta], "readonly", async (tx) => {
      const meta = tx.objectStore(STORES.meta)
      const found = await Promise.all(ids.map((id) => done(meta.get(madeKey(id))) as Promise<unknown>))
      const out: Record<string, string> = {}
      ids.forEach((id, i) => {
        if (typeof found[i] === "string") out[id] = found[i] as string
      })
      return out
    })
  }

  async read(key: string): Promise<StoredRead | undefined> {
    return inTx(this.db, [STORES.reads], "readonly", (tx) => done(tx.objectStore(STORES.reads).get(key)))
  }

  /**
   * The member can no longer see this entity (a 403 or 404): it goes, with
   * every read that shows it and every change waiting for it.
   */
  async dropEntity(kind: string, id: string): Promise<void> {
    const ref = refOf(kind, id)
    await inTx(this.db, [STORES.records, STORES.reads, STORES.outbox], "readwrite", async (tx) => {
      tx.objectStore(STORES.records).delete([kind, id])
      const [reads, ops] = await Promise.all([
        done(tx.objectStore(STORES.reads).getAll()) as Promise<StoredRead[]>,
        done(tx.objectStore(STORES.outbox).getAll()) as Promise<{ seq: number; kind: string; id: string }[]>,
      ])
      for (const r of reads) if (r.refs.includes(ref)) tx.objectStore(STORES.reads).delete(r.key)
      for (const op of ops) if (op.kind === kind && op.id === id) tx.objectStore(STORES.outbox).delete(op.seq)
    })
  }
}
