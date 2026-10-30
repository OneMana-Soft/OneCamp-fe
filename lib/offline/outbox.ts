"use client"

/**
 * The durable outbox (projects P7-1): changes made while the network was gone,
 * kept in the Offline Store so they survive a reload or a closed tab, and sent
 * in the order they were made once it comes back. GENERIC, keyed by entity
 * kind like the store.
 *
 * - Order is per entity: an entity's changes go strictly in sequence, and one
 *   that can't go yet (a conflict waiting for the member, or one the server
 *   keeps failing) holds back the rest of that entity's. Other entities'
 *   changes still go.
 * - A change being sent is marked so: one made meanwhile is a change of its
 *   own, behind it, never folded into what is already on its way.
 * - The server failing one change (5xx, 408) holds back that entity for the
 *   pass and counts a try; after MAX_TRIES it is set aside for the member
 *   (Retry or Discard). Only no answer, or 429, stops the whole pass.
 * - A create that isn't made holds back what depends on it (dependsOn): a
 *   comment on a task that was never created is never sent to nowhere.
 * - Bounded: at most MAX_OPS changes and MAX_BYTES of them. Past either, a new
 *   change is refused here (the caller says so, and the bar shows "N changes
 *   waiting"); nothing already waiting is ever dropped to make room.
 * - Replayed as the member: each change goes through the same route and the
 *   same checks as a live one, with the session the browser has then.
 */

import { STORES, done, inTx } from "@/lib/offline/db"
import { madeKey, refOf, type OfflineStore } from "@/lib/offline/store"

export const MAX_OPS = 200
export const MAX_BYTES = 512 * 1024
/** Passes a change may fail on the server before it is set aside for the member. */
export const MAX_TRIES = 5

export type OpState = "waiting" | "sending" | "conflict" | "held" | "failed"

export interface Op {
  seq?: number
  /** Sent as the Idempotency-Key, so a create sent twice is made once. */
  opKey: string
  kind: string
  id: string
  action: string
  method: "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  payload: unknown
  /** The field the change sets, when it sets one. */
  field?: string
  /** The field's value as last read when the change was made; checked before sending. */
  base?: unknown
  hasBase: boolean
  value?: unknown
  /** The opKey of a create this change needs first. */
  dependsOn?: string
  queuedAt: number
  bytes: number
  state: OpState
  /** A conflict's: the value the server has now. */
  theirs?: unknown
  /** What the entity is called, for the lines that talk about it. */
  label?: string
  /** What the entity belongs to (a task's project), for naming its values. */
  parent?: string
  /** Passes the server failed it on. */
  tries?: number
}

export type NewOp = Omit<Op, "seq" | "bytes" | "state" | "queuedAt" | "theirs"> & { queuedAt?: number }

export type Outcome =
  /** Sent. A create's answer names the id the server made it under (made). */
  | { kind: "sent"; made?: string }
  /** Nothing answered, or the server asks to slow down (429): stop, and try again later. */
  | { kind: "retry" }
  /** The server failed this change (5xx, 408): hold its entity for this pass, and count a try. */
  | { kind: "failed" }
  /** The field moved since the change was made: the member decides. */
  | { kind: "conflict"; theirs: unknown }
  /** The server said no (4xx): the change is dropped and the screen is put back. */
  | { kind: "refused"; message?: string }
  /** 403 or 404: the member can't see the entity any more. */
  | { kind: "gone" }
  /** 401: the session is over. */
  | { kind: "signedOut" }
  /** It names an id the device gave that no create has been made under: it is held, never sent as it is. */
  | { kind: "held" }

export interface ReplayReport {
  sent: Op[]
  /** Creates the server made under ids of their own: what waited on each went under that id. */
  made: { kind: string; from: string; to: string }[]
  refused: Op[]
  gone: Op[]
  conflicts: Op[]
  held: Op[]
  /** Failed this pass, tried again later. */
  failing: Op[]
  /** Set aside: failed MAX_TRIES times, waiting for the member. */
  failed: Op[]
  stopped: boolean
  signedOut: boolean
}

export type EnqueueResult = { ok: true; op: Op } | { ok: false; reason: "full"; waiting: number }

function sizeOf(op: NewOp): number {
  try {
    return JSON.stringify(op).length
  } catch {
    return MAX_BYTES
  }
}

export class Outbox {
  constructor(private readonly store: OfflineStore) {}

  private get db() {
    return this.store.db
  }

  /** Every change waiting, in the order made. */
  async all(): Promise<Op[]> {
    const ops = (await inTx(this.db, [STORES.outbox], "readonly", (tx) => done(tx.objectStore(STORES.outbox).getAll()))) as Op[]
    return ops.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  }

  /**
   * Keep a change. A second change to a field still waiting replaces the
   * first's value and keeps its base, so the check before sending still asks
   * about the value the member first changed from.
   */
  async enqueue(input: NewOp): Promise<EnqueueResult> {
    const queuedAt = input.queuedAt ?? Date.now()
    return inTx(this.db, [STORES.outbox], "readwrite", async (tx) => {
      const box = tx.objectStore(STORES.outbox)
      const ops = ((await done(box.getAll())) as Op[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      const mine = ops.filter((o) => o.kind === input.kind && o.id === input.id)
      const last = mine[mine.length - 1]
      if (
        last &&
        last.state === "waiting" &&
        input.field &&
        last.field === input.field &&
        last.action === input.action &&
        last.url === input.url
      ) {
        const merged: Op = { ...last, payload: input.payload, value: input.value, label: input.label ?? last.label, parent: input.parent ?? last.parent, queuedAt }
        merged.bytes = sizeOf(merged)
        const used = ops.reduce((n, o) => n + o.bytes, 0) - last.bytes + merged.bytes
        if (used > MAX_BYTES) return { ok: false as const, reason: "full" as const, waiting: ops.length }
        box.put(merged)
        return { ok: true as const, op: merged }
      }
      // Behind an earlier change to the same field, the member changed it from
      // that one's value: checked against it, the earlier one going first is
      // never taken for a teammate's change.
      const before = input.field ? [...mine].reverse().find((o) => o.field === input.field) : undefined
      const next: NewOp = before ? { ...input, base: before.value, hasBase: true } : input
      const bytes = sizeOf(next)
      const used = ops.reduce((n, o) => n + o.bytes, 0)
      if (ops.length >= MAX_OPS || used + bytes > MAX_BYTES) return { ok: false as const, reason: "full" as const, waiting: ops.length }
      const op: Op = { ...next, queuedAt, bytes, state: "waiting" }
      const seq = (await done(box.add(op))) as number
      return { ok: true as const, op: { ...op, seq } }
    })
  }

  /**
   * Change one waiting change as it is now, in one transaction: change says
   * what it becomes (null: it goes; undefined: it stays as it is), and the
   * change as it then stands is returned. Nothing happens to one that is
   * gone, so a tab never brings back a change another has sent or let go.
   */
  private async update(seq: number, change: (op: Op) => Op | null | undefined): Promise<Op | undefined> {
    return inTx(this.db, [STORES.outbox], "readwrite", async (tx) => {
      const box = tx.objectStore(STORES.outbox)
      const op = (await done(box.get(seq))) as Op | undefined
      if (!op) return undefined
      const next = change(op)
      if (next === null) {
        box.delete(seq)
        return undefined
      }
      if (next) box.put(next)
      return next ?? op
    })
  }

  /**
   * A change the server refused goes; the next change to that field, made
   * from its value, is made from what the server still has.
   */
  private async refuse(op: Op): Promise<void> {
    await inTx(this.db, [STORES.outbox], "readwrite", async (tx) => {
      const box = tx.objectStore(STORES.outbox)
      const ops = ((await done(box.getAll())) as Op[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      box.delete(op.seq!)
      const next = op.field ? ops.find((o) => (o.seq ?? 0) > (op.seq ?? 0) && o.kind === op.kind && o.id === op.id && o.field === op.field) : undefined
      if (next) box.put({ ...next, base: op.base, hasBase: op.hasBase })
    })
  }

  /**
   * A create the server made: it leaves the outbox. When the server made it
   * under an id of its own, every change still waiting that names the id the
   * device gave it (as its own id, in its address or in what it sends) names
   * the server's instead, and no longer waits on the create. All of it in ONE
   * transaction with the note of the server's id (CODE-REVIEWER-79 MF1): a
   * tab closed part way leaves all of it done or none of it, never a change
   * naming an id nothing will make. What was kept under the device's id goes
   * after: the screens read the entity again under its own.
   */
  private async made(create: Op, made: string | undefined): Promise<void> {
    const as = made && made !== create.id ? made : undefined
    await inTx(this.db, [STORES.outbox, STORES.meta], "readwrite", async (tx) => {
      const box = tx.objectStore(STORES.outbox)
      box.delete(create.seq!)
      if (!as) return
      const swap = (text: string) => text.split(create.id).join(as)
      // Kept with the rewrite, so a screen still on the device's id goes on under the server's.
      tx.objectStore(STORES.meta).put(as, madeKey(create.id))
      for (const op of (await done(box.getAll())) as Op[]) {
        const next: Op = { ...op, id: swap(op.id), url: swap(op.url) }
        if (op.payload !== undefined) next.payload = JSON.parse(swap(JSON.stringify(op.payload))) as unknown
        if (op.parent !== undefined) next.parent = swap(op.parent)
        if (next.dependsOn === create.opKey) delete next.dependsOn
        if (JSON.stringify(next) === JSON.stringify(op)) continue
        next.bytes = sizeOf(next)
        box.put(next)
      }
    })
    if (as) await this.store.dropEntity(create.kind, create.id)
  }

  async remove(seq: number): Promise<void> {
    await inTx(this.db, [STORES.outbox], "readwrite", (tx) => {
      tx.objectStore(STORES.outbox).delete(seq)
    })
  }

  /**
   * The member's answer to a conflict: "mine" sends their value over the
   * server's (no further check); "theirs" drops the change.
   */
  async resolve(seq: number, choice: "mine" | "theirs"): Promise<void> {
    await this.update(seq, (op) => {
      if (op.state !== "conflict") return undefined
      return choice === "theirs" ? null : { ...op, state: "waiting", hasBase: false, theirs: undefined }
    })
  }

  /** Retry on a change set aside: it waits again, with its tries from nought. */
  async retry(seq: number): Promise<void> {
    await this.update(seq, (op) => (op.state === "failed" ? { ...op, state: "waiting", tries: 0 } : undefined))
  }

  /** Send what can go, in order. send says how each went; nothing else writes. */
  async replay(send: (op: Op) => Promise<Outcome>): Promise<ReplayReport> {
    const report: ReplayReport = { sent: [], made: [], refused: [], gone: [], conflicts: [], held: [], failing: [], failed: [], stopped: false, signedOut: false }
    const blocked = new Set<string>()
    // Creates not made in this pass, whether they wait or were refused.
    const unmade = new Set<string>()
    const refusedCreates = new Set<string>()
    const goneRefs = new Set<string>()
    for (const op of await this.all()) {
      const ref = refOf(op.kind, op.id)
      const keep = () => {
        blocked.add(ref)
        unmade.add(op.opKey)
      }
      if (goneRefs.has(ref)) continue
      if (op.state === "conflict") {
        report.conflicts.push(op)
        keep()
        continue
      }
      if (op.state === "failed") {
        report.failed.push(op)
        keep()
        continue
      }
      if (op.state === "held") {
        report.held.push(op)
        keep()
        refusedCreates.add(op.opKey)
        continue
      }
      if (op.dependsOn && refusedCreates.has(op.dependsOn)) {
        const held = await this.update(op.seq!, (o) => ({ ...o, state: "held" }))
        if (held) report.held.push(held)
        keep()
        refusedCreates.add(op.opKey)
        continue
      }
      if (blocked.has(ref) || (op.dependsOn && unmade.has(op.dependsOn))) {
        keep()
        continue
      }
      // As it is now (a change made since this pass began is folded in), and
      // marked as on its way. One still marked from a pass that never
      // finished (the tab closed mid-send) goes again: passes run one at a
      // time (lib/offline/engine), so no other pass is sending it. If its
      // request had reached the server, a field set twice is the same field,
      // but the update routes take no Idempotency-Key yet (P7-1c keys them):
      // their side effects (a sync, an email) may run twice.
      const sending = await this.update(op.seq!, (o) => (o.state === "waiting" || o.state === "sending" ? { ...o, state: "sending" } : undefined))
      if (!sending || sending.state !== "sending") continue
      const outcome = await send(sending)
      switch (outcome.kind) {
        case "sent":
          if (sending.action === "create") await this.made(sending, outcome.made)
          else await this.remove(sending.seq!)
          report.sent.push(sending)
          if (sending.action === "create" && outcome.made && outcome.made !== sending.id) {
            report.made.push({ kind: sending.kind, from: sending.id, to: outcome.made })
          }
          break
        case "held": {
          // It names an id no create was made under (its create's answer named none): kept, never sent as it is.
          const held = await this.update(sending.seq!, (o) => ({ ...o, state: "held" }))
          if (held) report.held.push(held)
          keep()
          if (op.action === "create") refusedCreates.add(op.opKey)
          break
        }
        case "retry":
          await this.update(sending.seq!, (o) => ({ ...o, state: "waiting" }))
          report.stopped = true
          return report
        case "signedOut":
          report.signedOut = true
          return report
        case "failed": {
          const tries = (sending.tries ?? 0) + 1
          const after = await this.update(sending.seq!, (o) => ({ ...o, tries, state: tries >= MAX_TRIES ? "failed" : "waiting" }))
          if (after) (after.state === "failed" ? report.failed : report.failing).push(after)
          keep()
          break
        }
        case "conflict": {
          const waiting = await this.update(sending.seq!, (o) => ({ ...o, state: "conflict", theirs: outcome.theirs }))
          if (waiting) report.conflicts.push(waiting)
          keep()
          break
        }
        case "refused":
          await this.refuse(sending)
          report.refused.push(sending)
          if (op.action === "create") {
            unmade.add(op.opKey)
            refusedCreates.add(op.opKey)
          }
          break
        case "gone":
          await this.store.dropEntity(op.kind, op.id)
          goneRefs.add(ref)
          report.gone.push(sending)
          if (op.action === "create") {
            unmade.add(op.opKey)
            refusedCreates.add(op.opKey)
          }
          break
      }
    }
    return report
  }
}
