"use client"

/**
 * PLUGINS A DOC NEEDS ONLY ONCE IT HOLDS A NODE OF SOME KIND (a table's
 * editing), fetched then, and never added to an open editor.
 *
 * How it worked before (editor-plugins-at-creation, 15 Oct): the doc's
 * editor is built once every block that loads lazily is here (factory.ts
 * useBlocksReady), and table editing was one of them, so every doc open
 * fetched prosemirror-tables (15.8 KB gzip) and waited for it, table or none.
 * It was made so because adding a plugin to an open editor (registerPlugin)
 * makes every plugin view again: an open "/" menu closed, a block link's flash
 * was lost, y-sync drew the whole doc again (noLatePlugins.test.tsx pins it).
 *
 * Now a block may declare its plugins on demand (BlockSpec.onDemand): the node
 * types that ask for them, and its chunk. Every editor of its kind is made with
 *  - a stand-in for each of the chunk's plugins, which does nothing until the
 *    chunk is here and then takes its plugin on: its state (held where the
 *    plugin's own key reads it), its props, appendTransaction,
 *    filterTransaction and view;
 *  - a watcher, which reads the doc as it comes and each change after it:
 *    the first content and every change from Yjs (another person's, an
 *    agent's, a template, an undo) arrive as one transaction replacing the
 *    whole doc (y-prosemirror sync-plugin.js); this tab's own (the "/" menu,
 *    a paste, Doc AI's answer) as their steps. When one holds such a node, it
 *    fetches the chunk.
 * A doc whose saved copy already holds one waits for the chunk before its
 * editor is built, as before (factory.ts), so its tables are editable from the
 * first frame. A doc that holds none never fetches it; one that gets one
 * fetches it then. The editor's plugins stay the ones it was made with.
 *
 * When the chunk can't come, the doc keeps the node and asks again later:
 * offline, once the connection is back, as the clipboard's writer waits
 * (clipboardMarkdown.ts); after a failed fetch, at the first change or action
 * past a pause, never with each key. What an action asked of it meanwhile (a
 * row after the last cell) is dropped, not done minutes later; a node's view
 * still waits for it.
 */

import { Extension, type Editor } from "@tiptap/core"
import type { Node as PMNode, Slice } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type EditorStateConfig, type PluginView } from "@tiptap/pm/state"
import type { EditorProps, EditorView } from "@tiptap/pm/view"

/** What a block's chunk gives each editor. */
export interface OnDemandChunk<Api = unknown> {
  /** Its plugins for one editor, as many as the block declares, in order. */
  plugins(editor: Editor): Plugin[]
  /** What the editor's own code asks of it (a table's view: its handles). */
  api?: Api
}

/** A block's plugins on demand (BlockSpec.onDemand). */
export interface OnDemandBlock<Api = unknown> {
  /** The node types whose presence asks for the chunk. */
  nodes: readonly string[]
  /** How such a node is written in a doc's saved copy: a doc that opens holding one waits for the chunk. */
  saved: RegExp
  /** How many plugins the chunk gives: each has a stand-in from the editor's creation. */
  plugins: number
  /** Every DOM event those plugins listen to (handleDOMEvents): a view listens for what its plugins name when it is made. */
  events: readonly string[]
  /** The extension's priority: where its plugins stand among the editor's (a later one's keys run first). */
  priority?: number
  load(): Promise<OnDemandChunk<Api>>
}

// ---- the chunks, fetched once a page ----

const chunks = new Map<string, OnDemandChunk>()
const fetching = new Map<string, Promise<OnDemandChunk>>()

/** Whether a block's chunk is here. */
export function onDemandHere(id: string): boolean {
  return chunks.has(id)
}

/** Fetches a block's chunk, once; a fetch that failed is asked again next time. */
export function fetchOnDemand(id: string, block: OnDemandBlock): Promise<OnDemandChunk> {
  const here = chunks.get(id)
  if (here) return Promise.resolve(here)
  let p = fetching.get(id)
  if (!p) {
    p = block.load().then(
      (chunk) => {
        chunks.set(id, chunk)
        return chunk
      },
      (e) => {
        fetching.delete(id)
        throw e
      },
    )
    fetching.set(id, p)
  }
  return p
}

/** For tests: forget every chunk fetched, as a new page load would. */
export function forgetOnDemand() {
  chunks.clear()
  fetching.clear()
}

// ---- in one editor ----

/** An editor's copy of a block's chunk: its plugins once here, and what waits for them. */
interface Held {
  plugins: Plugin[] | null
  api: unknown
  loading: Promise<void> | null
  /** Views waiting for it (a table's handles): they wait as long as it takes. */
  waiting: Set<(api: unknown) => void>
  /** Actions waiting for the fetch under way (a row after the last cell): dropped if it fails. */
  acting: Set<(api: unknown) => void>
  /** After a failed fetch, when a change or an action may ask again. */
  retryAt: number
  view: EditorView | null
}

/** After a fetch fails, how long until a change or an action asks again. */
const RETRY_MS = 5_000

const NOT_YET = Symbol("its plugin isn't here yet")

/** The keys, one per block and place, the same in every editor: what the plugins' own keys read once here. */
const standInKeys = new Map<string, PluginKey[]>()
const watchKeys = new Map<string, PluginKey<boolean>>()

function keysOf(id: string, count: number): PluginKey[] {
  let keys = standInKeys.get(id)
  if (!keys) standInKeys.set(id, (keys = Array.from({ length: count }, (_, i) => new PluginKey(`onDemand:${id}:${i}`))))
  return keys
}

function watchKeyOf(id: string): PluginKey<boolean> {
  let key = watchKeys.get(id)
  if (!key) watchKeys.set(id, (key = new PluginKey<boolean>(`onDemand:${id}`)))
  return key
}

/**
 * The plugin's own key reads its state from its stand-in's place, in an editor
 * that has the stand-in; in one that has the plugin itself, from its own.
 * (prosemirror-tables reads its state only through its keys.)
 */
const pointed = new WeakSet<PluginKey>()
function pointKey(own: PluginKey, standIn: PluginKey) {
  if (pointed.has(own)) return
  pointed.add(own)
  const read = Object.getPrototypeOf(own).getState as PluginKey["getState"]
  // Where an EditorState keeps a plugin's state: under its key's name (internal to prosemirror-state's types).
  const field = (standIn as unknown as { key: string }).key
  Object.defineProperty(own, "getState", {
    configurable: true,
    value(state: EditorState) {
      const held = (state as unknown as Record<string, unknown>)[field]
      if (held === undefined) return read.call(own, state)
      return held === NOT_YET ? undefined : held
    },
  })
}

/** Whether a node of these types is in a slice's content, without reading inside a line of text. */
function holds(content: PMNode | Slice["content"] | undefined, types: readonly string[]): boolean {
  if (!content) return false
  let found = false
  content.descendants((node) => {
    if (found) return false
    if (types.includes(node.type.name)) found = true
    return !found && !node.isTextblock
  })
  return found
}

type Fn = (...args: unknown[]) => unknown

/** The props a stand-in passes to its plugin once it's here; each does nothing, or hands back what it was given, till then. */
const HANDLERS = [
  "handleKeyDown", "handleKeyPress", "handleTextInput", "handleClickOn", "handleClick", "handleDoubleClickOn",
  "handleDoubleClick", "handleTripleClickOn", "handleTripleClick", "handlePaste", "handleDrop", "handleScrollToSelection",
  "createSelectionBetween", "clipboardTextParser", "decorations",
] as const
const PASSED = ["transformPastedHTML", "transformPastedText", "transformPasted", "transformCopied"] as const
/** Every prop a stand-in carries: a plugin of the chunk with another fails onDemand.test.ts. */
export const STAND_IN_PROPS: readonly string[] = [...HANDLERS, ...PASSED, "attributes", "handleDOMEvents"]

function standInProps(inner: () => Plugin | undefined, events: readonly string[]): EditorProps {
  const props: Record<string, unknown> = {}
  for (const name of HANDLERS) {
    props[name] = (...args: unknown[]) => {
      const f = inner()?.props[name] as Fn | undefined
      return typeof f === "function" ? f(...args) : undefined
    }
  }
  for (const name of PASSED) {
    props[name] = (value: unknown, ...rest: unknown[]) => {
      const f = inner()?.props[name] as Fn | undefined
      return typeof f === "function" ? f(value, ...rest) : value
    }
  }
  props.attributes = (state: EditorState) => {
    const a = inner()?.props.attributes
    return typeof a === "function" ? a(state) : a
  }
  props.handleDOMEvents = Object.fromEntries(
    events.map((type) => [
      type,
      (view: EditorView, event: Event) => {
        const f = (inner()?.props.handleDOMEvents as Record<string, Fn | undefined> | undefined)?.[type]
        return f ? !!f(view, event) : false
      },
    ]),
  )
  return props as EditorProps
}

function standInView(view: EditorView, inner: () => Plugin | undefined): PluginView {
  let made: PluginView | null = null
  let tried = false
  const make = () => {
    const p = inner()
    if (tried || !p) return
    tried = true
    made = p.spec.view ? p.spec.view.call(p, view) : null
  }
  make()
  return {
    update(v, before) {
      make()
      made?.update?.(v, before)
    },
    destroy() {
      made?.destroy?.()
    },
  }
}

function standIn(key: PluginKey, held: Held, i: number, events: readonly string[]): Plugin {
  const inner = () => held.plugins?.[i]
  return new Plugin({
    key,
    state: {
      init: (config, state) => {
        const p = inner()
        return p?.spec.state ? p.spec.state.init.call(p, config, state) : NOT_YET
      },
      apply: (tr, value, before, after) => {
        const p = inner()
        if (!p?.spec.state) return value
        // Here since the change before: its state starts from the doc as it was.
        const now = value === NOT_YET ? p.spec.state.init.call(p, { schema: before.schema, doc: before.doc } as EditorStateConfig, before) : value
        return p.spec.state.apply.call(p, tr, now, before, after)
      },
    },
    props: standInProps(inner, events),
    appendTransaction: (trs, before, after) => {
      const p = inner()
      return p?.spec.appendTransaction ? p.spec.appendTransaction.call(p, trs, before, after) : null
    },
    filterTransaction: (tr, state) => {
      const p = inner()
      return p?.spec.filterTransaction ? p.spec.filterTransaction.call(p, tr, state) : true
    },
    view: (view) => standInView(view, inner),
  })
}

/** The held copy, in an editor made with the block's stand-ins. */
function heldOf(editor: Editor, id: string): Held | undefined {
  return (editor.storage as unknown as Record<string, { held?: Held } | undefined>)[id]?.held
}

/** Takes the chunk's plugins on, in this editor. */
function fill(editor: Editor, id: string, held: Held, chunk: OnDemandChunk, count: number) {
  const plugins = chunk.plugins(editor)
  if (plugins.length !== count) throw new Error(`The block "${id}" declares ${count} plugins and its chunk gives ${plugins.length}`)
  const keys = keysOf(id, count)
  plugins.forEach((p, i) => {
    const own = (p.spec as { key?: PluginKey }).key
    if (own) pointKey(own, keys[i])
  })
  held.plugins = plugins
  held.api = chunk.api
}

/**
 * Fetches the chunk for this editor, unless it's here or on its way, the page
 * is offline, or a fetch failed a moment ago. Returns whether it is on its way.
 */
function start(editor: Editor, id: string, block: OnDemandBlock, held: Held): boolean {
  if (held.loading) return true
  if (held.plugins || editor.isDestroyed) return false
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false
  if (Date.now() < held.retryAt) return false
  held.loading = fetchOnDemand(id, block).then(
    (chunk) => {
      held.loading = null
      if (editor.isDestroyed || held.plugins) return
      fill(editor, id, held, chunk, block.plugins)
      // The stand-ins take their plugins' state on this change, before any
      // key or click can ask for it.
      const view = held.view
      if (view && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(watchKeyOf(id), "here"))
      for (const fn of [...held.waiting, ...held.acting]) fn(held.api)
      held.waiting.clear()
      held.acting.clear()
    },
    (e) => {
      held.loading = null
      held.retryAt = Date.now() + RETRY_MS
      held.acting.clear()
      // A doc with the node still shows it; the first change or action past the pause asks again.
      console.error(`Couldn't load the "${id}" block's plugins`, e)
    },
  )
  return true
}

/** The declarations, by block id: what withOnDemand fetches with. */
const blocks = new Map<string, OnDemandBlock>()

/** The block's extension: its stand-ins and its watcher, in every editor of its kind (factory.ts). */
export function onDemandExtension(id: string, block: OnDemandBlock) {
  blocks.set(id, block)
  return Extension.create<Record<string, never>, { held: Held | null }>({
    name: id,
    priority: block.priority ?? 100,
    addStorage: () => ({ held: null }),
    addProseMirrorPlugins() {
      const editor = this.editor
      const held: Held = { plugins: null, api: undefined, loading: null, waiting: new Set(), acting: new Set(), retryAt: 0, view: null }
      this.storage.held = held
      // Here already (a doc that held one, or another editor's): taken on at once.
      const chunk = chunks.get(id)
      if (chunk) fill(editor, id, held, chunk, block.plugins)
      const watchKey = watchKeyOf(id)
      const watch = new Plugin<boolean>({
        key: watchKey,
        state: {
          init: (_, state) => !held.plugins && holds(state.doc, block.nodes),
          apply: (tr, wanted) => {
            if (wanted || held.plugins || !tr.docChanged) return wanted
            return tr.steps.some((step) => holds((step as { slice?: Slice }).slice?.content, block.nodes))
          },
        },
        view: (view) => {
          held.view = view
          const go = () => {
            if (watchKey.getState(view.state)) start(editor, id, block, held)
          }
          go()
          return {
            update: go,
            destroy: () => {
              if (held.view === view) held.view = null
            },
          }
        },
      })
      return [watch, ...keysOf(id, block.plugins).map((key, i) => standIn(key, held, i, block.events))]
    },
  })
}

/** The chunk's api in this editor, once it's here. */
export function onDemandApi<Api>(editor: Editor, id: string): Api | undefined {
  const held = heldOf(editor, id)
  return held?.plugins ? (held.api as Api) : undefined
}

/**
 * Runs fn with the chunk's api in this editor: now when it's here, else once
 * it is. An action (a click, a key) fetches it, if nothing has asked yet, and
 * runs when that fetch brings it; one that can't fetch it now (offline, or
 * just after a failure) does nothing. A view (fetch false) only waits, for as
 * long as it takes, as the doc's content asks for it (the watcher). Returns a
 * way to stop waiting. Nothing runs in an editor made without the block.
 */
export function withOnDemand<Api>(editor: Editor, id: string, fn: (api: Api) => void, fetch = true): () => void {
  const held = heldOf(editor, id)
  if (!held) return () => {}
  if (held.plugins) {
    fn(held.api as Api)
    return () => {}
  }
  const wait = (api: unknown) => fn(api as Api)
  if (fetch) {
    const block = blocks.get(id)
    if (!block || !start(editor, id, block, held)) return () => {}
    held.acting.add(wait)
  } else held.waiting.add(wait)
  return () => {
    held.waiting.delete(wait)
    held.acting.delete(wait)
  }
}
