"use client"

import * as React from "react"

/**
 * What the open doc's page knows that More, the lock and the guard share
 * (B6): read as More opens (register.ts), and followed by the pieces that
 * draw them. PageGuard keeps it current from the doc's own answer.
 */
interface PageFacts {
  starred?: boolean
  /** The doc's lock: "" for none. */
  lock?: "" | "soft" | "hard"
  /** This tab lifted the soft lock for itself ("Unlock for me"), until it leaves the doc. */
  unlockedForMe?: boolean
  /** The person owns the doc (its doc_owner, not its maker). */
  owner?: boolean
  /** The person has full access. */
  full?: boolean
}

const EMPTY: PageFacts = Object.freeze({})
const facts = new Map<string, PageFacts>()
const listeners = new Set<() => void>()

export const factsOf = (docId: string): PageFacts => facts.get(docId) ?? EMPTY

/** Changes what is known of a doc; nothing happens when nothing changed. */
export function setFacts(docId: string, change: PageFacts) {
  const was = factsOf(docId)
  if ((Object.keys(change) as (keyof PageFacts)[]).every((k) => was[k] === change[k])) return
  facts.set(docId, { ...was, ...change })
  for (const l of [...listeners]) l()
}

/**
 * Forgets a doc's facts when its page closes: "Unlock for me" lasts only
 * while it is open, and the rest is read again on the next open, so the map
 * holds only the docs open now.
 */
export function leaveDoc(docId: string) {
  if (!facts.delete(docId)) return
  for (const l of [...listeners]) l()
}

/** Calls back on every change to any open doc's facts (the soft lock's plugin, usePageFacts). */
export function subscribeFacts(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function usePageFacts(docId: string): PageFacts {
  return React.useSyncExternalStore(
    subscribeFacts,
    () => factsOf(docId),
    () => EMPTY,
  )
}

/** Whether a soft lock holds this tab's editor: locked, and not lifted for this person. */
export const softLocked = (f: PageFacts) => f.lock === "soft" && !f.unlockedForMe

// The app's router, for the actions that run outside React (a copy opens, a
// deleted doc's page is left): the doc's page hands it over (PageGuard) and
// it stays. A page load is only for a tab no doc page has opened yet.
let push: ((href: string) => void) | null = null
export const provideNavigate = (fn: ((href: string) => void) | null) => void (push = fn)
export function navigate(href: string) {
  if (push) push(href)
  else window.location.assign(href)
}
