/**
 * The editor factory: every editor's extensions, from the block registry
 * (docs programme A1). The doc page, the guest's shared page, the chat
 * composer and a task's description each take the specs registered for their
 * kind, in one order, so a block is added once and reaches every editor that
 * lists it (and only those).
 *
 * The order is the extension list's: a later extension's keys run first
 * (how-docs-work-frontend §2d), so each built-in spec keeps the place it had
 * in the hand-written list (blocks/order.ts). The blocks StarterKit bundles
 * (paragraph, headings, lists, the marks) share one StarterKit, configured from
 * their specs, at the place of the first of them.
 *
 * A spec with load() is fetched first (loadBlocks); an editor is built only
 * once its kind's blocks are all here (blocksReady), because y-prosemirror
 * deletes from the shared doc whatever its editor's schema can't hold.
 *
 * A spec with onDemand (plugins only: no schema) gives every editor of its
 * kind its stand-ins (onDemand.ts, loaded with the lazy blocks, off a route's
 * first load), and is itself waited for only by an editor whose saved content
 * already holds its node: the rest fetch it when the doc first holds one.
 */

import * as React from 'react'
import type { AnyExtension } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { blocksFor, registryVersion, subscribeRegistry, type EditionGate } from './registry'
import type { BlockContext, BlockSpec, EditorKind } from './types'

/** Where a package's block goes when it names no order: after every built-in one. */
const PACKAGE_ORDER = 10_000

/** StarterKit's parts. One left unnamed by every spec is switched off. */
const STARTER_KEYS = [
  'blockquote', 'bold', 'bulletList', 'code', 'codeBlock', 'document', 'dropcursor', 'gapcursor',
  'hardBreak', 'heading', 'history', 'horizontalRule', 'italic', 'listItem', 'orderedList',
  'paragraph', 'strike', 'text',
] as const

/** The specs an editor is built from, in extension order. Pure but for the registry. */
export function specsFor(kind: EditorKind, gate: EditionGate): BlockSpec[] {
  return blocksFor(kind, gate)
    .map((spec, i) => ({ spec, i }))
    .sort((a, b) => (a.spec.order ?? PACKAGE_ORDER) - (b.spec.order ?? PACKAGE_ORDER) || a.i - b.i)
    .map(({ spec }) => spec)
}

/** StarterKit's options from the specs that use it: theirs, and false for the rest. */
function starterKitOptions(specs: BlockSpec[]): Record<string, unknown> {
  const options: Record<string, unknown> = Object.fromEntries(STARTER_KEYS.map((k) => [k, false]))
  for (const spec of specs) if (spec.starterKit) Object.assign(options, spec.starterKit)
  return options
}

// What each loaded spec gave, by id: its extensions, or what makes each
// editor's. A block's loader runs once per page.
const loaded = new Map<string, AnyExtension[] | ((ctx: BlockContext) => AnyExtension[])>()
const loading = new Map<string, Promise<void>>()

// The stand-ins for blocks on demand (onDemand.ts), loaded like a lazy block.
let onDemand: typeof import('./onDemand') | null = null
let onDemandLoading: Promise<typeof import('./onDemand')> | null = null
function loadOnDemand() {
  onDemandLoading ??= import('./onDemand').then(
    (m) => (onDemand = m),
    (e) => {
      onDemandLoading = null
      throw e
    },
  )
  return onDemandLoading
}

/** Whether an on-demand block holds up an editor: its stand-ins aren't here yet, or the saved content holds its node and its chunk isn't here. */
function onDemandPending(spec: BlockSpec, saved: string): boolean {
  if (!spec.onDemand) return false
  if (!onDemand) return true
  return saved !== '' && !onDemand.onDemandHere(spec.id) && spec.onDemand.saved.test(saved)
}

/**
 * The specs of a kind still to load: those that load lazily, and those on
 * demand whose node the editor's saved content (HTML) already holds.
 */
export function pendingBlocks(kind: EditorKind, gate: EditionGate, saved = ''): BlockSpec[] {
  return specsFor(kind, gate).filter((s) => (s.load && !loaded.has(s.id)) || onDemandPending(s, saved))
}

/** Whether every block of a kind is here, so its editor can be built (one holding this saved content). */
export function blocksReady(kind: EditorKind, gate: EditionGate, saved = ''): boolean {
  return pendingBlocks(kind, gate, saved).length === 0
}

/** Fetches the blocks of a kind that load lazily (and those on demand its saved content asks for). Safe to call early (on a link's hover) and often. */
export function loadBlocks(kind: EditorKind, gate: EditionGate, saved = ''): Promise<void> {
  return Promise.all(
    pendingBlocks(kind, gate, saved).map((spec) => {
      const od = spec.onDemand
      if (od) return loadOnDemand().then((m) => (saved !== '' && od.saved.test(saved) ? m.fetchOnDemand(spec.id, od).then(() => undefined) : undefined))
      let p = loading.get(spec.id)
      if (!p) {
        p = spec.load!().then(
          (exts) => {
            loaded.set(spec.id, exts)
          },
          (e) => {
            // Asked again next time: a chunk that failed to fetch may come later.
            loading.delete(spec.id)
            throw e
          },
        )
        loading.set(spec.id, p)
      }
      return p
    }),
  ).then(() => undefined)
}

/**
 * The extensions of an editor of ctx.kind. Throws when a block that loads
 * lazily isn't here yet: build the editor after blocksReady (useBlocksReady).
 */
export function extensionsFor(ctx: BlockContext): AnyExtension[] {
  const specs = specsFor(ctx.kind, ctx.gate)
  const out: AnyExtension[] = []
  let starterPlaced = false
  for (const spec of specs) {
    if (spec.starterKit && !starterPlaced) {
      out.push(StarterKit.configure(starterKitOptions(specs)))
      starterPlaced = true
    }
    if (spec.extensions) out.push(...spec.extensions)
    if (spec.create) out.push(...spec.create(ctx))
    if (spec.onDemand) {
      if (!onDemand) throw new Error(`The block "${spec.id}" hasn't loaded yet: build the ${ctx.kind} editor once blocksReady`)
      out.push(onDemand.onDemandExtension(spec.id, spec.onDemand))
    }
    if (spec.load) {
      const exts = loaded.get(spec.id)
      if (!exts) throw new Error(`The block "${spec.id}" hasn't loaded yet: build the ${ctx.kind} editor once blocksReady`)
      out.push(...(typeof exts === 'function' ? exts(ctx) : exts))
    }
  }
  return standIns(out)
}

/**
 * An extension a later spec gives under a name an earlier one's has stands
 * in for it: a package's comes after every built-in one, so a package can
 * replace a built-in extension in the editors it lists by giving its own
 * under the same name (A2's DocPlaceholder, named "placeholder", stands in
 * for Tiptap's in a doc). Two extensions of one name never both load: Tiptap
 * would warn, and a second keyed plugin throws.
 */
function standIns(list: AnyExtension[]): AnyExtension[] {
  const last = new Map<string, number>()
  list.forEach((e, i) => last.set(e.name, i))
  return list.filter((e, i) => last.get(e.name) === i)
}

/**
 * Whether an editor of this kind can be built yet; starts loading what it
 * waits for. True at once when nothing of the kind loads lazily. saved is the
 * editor's saved content: a doc holding a block on demand waits for it, until
 * its editor is built; a later copy of the content that holds one never takes
 * the editor down to rebuild it (its stand-ins fetch it instead).
 */
export function useBlocksReady(kind: EditorKind, gate: EditionGate, saved = ''): boolean {
  const version = React.useSyncExternalStore(subscribeRegistry, registryVersion, registryVersion)
  const [, setTick] = React.useState(0)
  // Once built, the saved content asks for nothing more: a block on demand
  // comes through the editor's stand-ins (blocks that load lazily still do).
  const built = React.useRef(false)
  const asks = built.current ? '' : saved
  const ready = blocksReady(kind, gate, asks)
  if (ready) built.current = true
  React.useEffect(() => {
    if (ready) return
    let live = true
    loadBlocks(kind, gate, asks).then(
      () => live && setTick((t) => t + 1),
      (e) => console.error(`Couldn't load the ${kind} editor's blocks`, e),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gate by value
  }, [ready, kind, gate.ai, version, asks])
  return ready
}
