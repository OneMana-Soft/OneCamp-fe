"use client"

/**
 * Where the doc shell draws what packages registered (PROGRAM.md §4 #3): a
 * slot's contributions, a panel by kind, a dialog by id. Each component loads
 * the first time it is drawn, so a contribution costs the page nothing until
 * it shows, and one that fails to load leaves its slot empty, not the page.
 */

import * as React from 'react'
import type { Editor } from '@tiptap/core'
import { dialogFor, panelFor, slotFor, registryVersion, subscribeRegistry, type EditionGate } from './registry'
import type { ShellSlot, SlotContribution, SlotProps } from './types'

/** Renders again when something registers later (a chunk loaded after the shell). */
export function useRegistryVersion(): number {
  return React.useSyncExternalStore(subscribeRegistry, registryVersion, registryVersion)
}

type Loader<P> = () => Promise<{ default: React.ComponentType<P> }>
// The map holds loaders of every props shape; each is read back as its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLoader = Loader<any>

// One lazy component per loader, for the page's life: a slot drawn again
// doesn't load or remount it.
const lazies = new WeakMap<AnyLoader, React.ComponentType<unknown>>()
function lazyOf<P>(load: Loader<P>): React.ComponentType<P> {
  let c = lazies.get(load as AnyLoader)
  if (!c) {
    c = React.lazy(load as AnyLoader) as React.ComponentType<unknown>
    lazies.set(load as AnyLoader, c)
  }
  return c as React.ComponentType<P>
}

/** Keeps one contribution's failure inside it. */
class Contained extends React.Component<{ id: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(`The doc contribution "${this.props.id}" failed`, error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** One contribution, loaded on first draw. */
export function Contribution({ contribution, ...props }: { contribution: SlotContribution } & SlotProps) {
  if (!contribution.load) return null
  const C = lazyOf<SlotProps>(contribution.load)
  return (
    <Contained id={`${contribution.slot}:${contribution.id}`}>
      <React.Suspense fallback={null}>
        <C {...props} />
      </React.Suspense>
    </Contained>
  )
}

/** Every contribution to a slot, in order. Draws nothing when none is registered. */
export function SlotOutlet({ slot, gate, docId, editor }: { slot: ShellSlot; gate: EditionGate; docId: string; editor?: Editor | null }) {
  useRegistryVersion()
  const contributions = slotFor(slot, gate)
  if (!contributions.length) return null
  return (
    <>
      {contributions.map((c) => (
        <Contribution key={c.id} contribution={c} docId={docId} editor={editor} />
      ))}
    </>
  )
}

/** The classes the 'rootClasses' contributions add to the doc's root. */
export function rootClassesFor(gate: EditionGate, docId: string): string[] {
  return slotFor('rootClasses', gate).flatMap((c) => {
    try {
      return c.classes?.({ docId }) ?? []
    } catch (e) {
      console.error(`The root classes of "${c.id}" failed`, e)
      return []
    }
  })
}

/** A registered panel, by kind, for a doc. Nothing for a kind no one registered. */
export function PanelOutlet({ kind, docId, gate }: { kind: string; docId: string; gate: EditionGate }) {
  useRegistryVersion()
  const spec = panelFor(kind, gate)
  if (!spec) return null
  const C = lazyOf<{ docId: string }>(spec.load)
  return (
    <Contained id={`panel:${kind}`}>
      <React.Suspense fallback={null}>
        <C docId={docId} />
      </React.Suspense>
    </Contained>
  )
}

/** A registered dialog, by id, over a doc. */
export function DialogOutlet({ id, docId, gate, onClose }: { id: string; docId: string; gate: EditionGate; onClose(): void }) {
  useRegistryVersion()
  const spec = dialogFor(id, gate)
  if (!spec) return null
  const C = lazyOf<{ docId: string; onClose(): void }>(spec.load)
  return (
    <Contained id={`dialog:${id}`}>
      <React.Suspense fallback={null}>
        <C docId={docId} onClose={onClose} />
      </React.Suspense>
    </Contained>
  )
}
