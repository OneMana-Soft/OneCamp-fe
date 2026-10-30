"use client"

/**
 * What the Offline Store has waiting, for the connection pill (components/
 * error/OfflineNotice) and the conflict sheet. Small and static: the pill is
 * on every page; the store (lib/offline/engine) writes here once it loads.
 */

import type { Op } from "@/lib/offline/outbox"

export interface OfflineStatus {
  /** Changes waiting to be sent, conflicts and held ones included. */
  waiting: number
  /** The outbox is at its cap: a new change can't be kept until these are sent. */
  full: boolean
  sending: boolean
  conflicts: Op[]
  held: Op[]
  /** Set aside after failing on the server again and again: Retry or Discard. */
  failed: Op[]
  /** The last pass's changes that won't be sent, and why. */
  notice?: { gone: number; refused: number; label?: string; at: number }
  /** The member asked to see the changes that need them. */
  reviewing: boolean
}

const EMPTY: OfflineStatus = { waiting: 0, full: false, sending: false, conflicts: [], held: [], failed: [], reviewing: false }

let status: OfflineStatus = EMPTY
const listeners = new Set<() => void>()

export function getOfflineStatus(): OfflineStatus {
  return status
}

export function emptyOfflineStatus(): OfflineStatus {
  return EMPTY
}

export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setOfflineStatus(next: Partial<OfflineStatus>): void {
  status = { ...status, ...next }
  listeners.forEach((l) => l())
}

export function resetOfflineStatus(): void {
  setOfflineStatus(EMPTY)
}

/** Open the sheet that lists the changes needing the member (conflicts, held, set aside). */
export function reviewOfflineChanges(open = true): void {
  setOfflineStatus({ reviewing: open })
}

let sendNow: (() => void) | null = null

/** The engine's "send what's waiting now", while it runs (lib/offline/engine). */
export function setSendNow(fn: (() => void) | null): void {
  sendNow = fn
}

/** Retry on the pill: what's waiting on the device is sent now. */
export function sendOfflineChangesNow(): void {
  sendNow?.()
}
