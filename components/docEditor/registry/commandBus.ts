/**
 * The doc command bus (I17): one per editor, typed, and for that editor's doc
 * alone. It replaces the window events (doc-ai-insert, doc-ai-slash,
 * doc-embed-table…), which carried no doc id: in split view, two docs each
 * heard every insert and both took it (N5).
 *
 * A doc editor makes its bus as it mounts (useDocCommandBus) and keeps it on
 * the editor (busFor(editor)), so a slash item or an action finds the bus of
 * the editor it runs in. Something outside the editor (the AI panel) asks for
 * the bus of its doc (busForDoc), and gets the editor of that doc that was
 * used last: when one doc is open twice, a command still lands once.
 */

import * as React from 'react'
import { blocksWithIds } from '@/components/minimal-tiptap/extensions/block-commands/blockIds'
import type { Editor } from '@tiptap/core'
import type { ActionContext, DocCommandBus, DocCommands } from './types'

type Handler = (payload: never) => void

let seq = 0

/** A bus for one editor of a doc. */
export function createDocCommandBus(docId: string): DocCommandBus {
  const handlers = new Map<keyof DocCommands, Set<Handler>>()
  const key = `${docId}#${++seq}`
  return {
    docId,
    key,
    emit(command, payload) {
      for (const h of [...(handlers.get(command) ?? [])]) {
        try {
          ;(h as (p: typeof payload) => void)(payload)
        } catch (e) {
          console.error(`The doc command "${command}" failed`, e)
        }
      }
    },
    on(command, handler) {
      let set = handlers.get(command)
      if (!set) handlers.set(command, (set = new Set()))
      set.add(handler as Handler)
      return () => {
        set!.delete(handler as Handler)
      }
    },
  }
}

/** A bus nothing listens to: what an action gets outside a doc. */
export const NO_BUS: DocCommandBus = { docId: '', key: '', emit() {}, on: () => () => {} }

const byEditor = new WeakMap<Editor, DocCommandBus>()
const editorOfBus = new WeakMap<DocCommandBus, Editor>()
// Live buses, the one used last at the end.
const live: DocCommandBus[] = []

// How many hold each bus live (its doc's page, its editor).
const holders = new Map<DocCommandBus, number>()

/** Keeps a bus among the live ones while held; the returned function lets go. */
export function holdBus(bus: DocCommandBus): () => void {
  holders.set(bus, (holders.get(bus) ?? 0) + 1)
  touchBus(bus)
  let held = true
  return () => {
    if (!held) return
    held = false
    const n = (holders.get(bus) ?? 1) - 1
    if (n > 0) {
      holders.set(bus, n)
      return
    }
    holders.delete(bus)
    const i = live.indexOf(bus)
    if (i >= 0) live.splice(i, 1)
  }
}

/** Puts a bus on an editor and among the live ones; the returned function takes it off. */
export function attachBus(editor: Editor, bus: DocCommandBus): () => void {
  byEditor.set(editor, bus)
  editorOfBus.set(bus, editor)
  const release = holdBus(bus)
  const onFocus = () => touchBus(bus)
  editor.on('focus', onFocus)
  return () => {
    editor.off('focus', onFocus)
    if (byEditor.get(editor) === bus) byEditor.delete(editor)
    if (editorOfBus.get(bus) === editor) editorOfBus.delete(bus)
    release()
  }
}

/** The editor a bus is on, while it is (the palette's doc actions run in it). */
export function editorOf(bus: DocCommandBus | undefined): Editor | undefined {
  return bus ? editorOfBus.get(bus) : undefined
}

/** The doc used last on this page, if one is open: whose actions the palette offers. */
function activeBus(): DocCommandBus | undefined {
  return live[live.length - 1]
}

/**
 * A doc action as the command palette lists it. The doc's page makes these
 * from its registered actions (readers.ts paletteEntriesFor), so the palette
 * reads this module alone, never the registry, and brings no editor code into
 * the app's first load (app/firstLoad.test.ts).
 */
export interface PaletteEntry {
  id: string
  label: string
  /** More words it is found by: its aliases and description. */
  keywords: string[]
  icon?: React.ElementType
  /** Its keys as the palette draws them, space between ("⌘ L"). */
  keys?: string
  run(): void
}

const palettes = new WeakMap<DocCommandBus, () => PaletteEntry[]>()

/** A doc's page lists its actions for the palette on its bus; the returned function stops. */
export function providePaletteEntries(bus: DocCommandBus, entries: () => PaletteEntry[]): () => void {
  palettes.set(bus, entries)
  return () => {
    if (palettes.get(bus) === entries) palettes.delete(bus)
  }
}

/**
 * The open doc's actions for the palette: the doc used last on this page, as
 * its page shows them then (what is disabled is left out). None when no doc
 * is open.
 */
export function paletteEntries(): PaletteEntry[] {
  const bus = activeBus()
  const entries = bus && palettes.get(bus)
  if (!entries) return []
  try {
    return entries()
  } catch (e) {
    console.error("The doc's palette actions failed", e)
    return []
  }
}

const contexts = new WeakMap<DocCommandBus, () => ActionContext>()

/**
 * A doc's page gives the context its actions run in (what it shows, who may
 * do what) on its bus, so a surface outside the page draws the same actions
 * the same way: the phone's doc sheet, as the More menu (QA DSA-06: the sheet
 * built a context of its own and knew nothing of Later or focus mode). The
 * returned function stops.
 */
export function provideActionContext(bus: DocCommandBus, context: () => ActionContext): () => void {
  contexts.set(bus, context)
  return () => {
    if (contexts.get(bus) === context) contexts.delete(bus)
  }
}

/** The context a doc's page gave on its bus, read now; undefined without a page. */
export function actionContextOf(bus: DocCommandBus | undefined): ActionContext | undefined {
  const context = bus && contexts.get(bus)
  return context ? context() : undefined
}

/** Marks a bus as the one used last for its doc. */
export function touchBus(bus: DocCommandBus) {
  const i = live.indexOf(bus)
  if (i >= 0) live.splice(i, 1)
  live.push(bus)
}

/** The bus of the editor a command runs in. */
export function busFor(editor: Editor | null | undefined): DocCommandBus | undefined {
  return editor ? byEditor.get(editor) : undefined
}

/** The bus of the editor of this doc used last, for a command from outside the editor. */
export function busForDoc(docId: string): DocCommandBus | undefined {
  for (let i = live.length - 1; i >= 0; i--) if (live[i].docId === docId) return live[i]
  return undefined
}

/**
 * A doc page's bus: made once per mounted page, live while it is (so the AI
 * panel or the phone's sheet finds it by its doc before the editor exists),
 * and put on the editor while there is one. Hosts listen on it (useDocCommand).
 */
export function useDocCommandBus(docId: string, editor: Editor | null): DocCommandBus {
  const bus = React.useMemo(() => createDocCommandBus(docId), [docId])
  React.useEffect(() => holdBus(bus), [bus])
  React.useEffect(() => {
    if (!editor) return
    return attachBus(editor, bus)
  }, [editor, bus])
  return bus
}

/** Listens for one command on a bus while mounted, with the latest handler. */
export function useDocCommand<K extends keyof DocCommands>(bus: DocCommandBus | undefined, command: K, handler: (payload: DocCommands[K]) => void) {
  const latest = React.useRef(handler)
  React.useLayoutEffect(() => {
    latest.current = handler
  })
  React.useEffect(() => {
    if (!bus) return
    return bus.on(command, (p) => latest.current(p))
  }, [bus, command])
}

/** Where a block with this id sits now, or null (a 'block' anchor). */
export function findBlock(editor: Editor, blockId: string): { from: number; to: number } | null {
  const [b] = blocksWithIds(editor.state.doc, [blockId])
  return b ? { from: b.pos, to: b.pos + b.node.nodeSize } : null
}

/**
 * The editor's own commands on its bus: insertAt and replaceRange land in
 * this editor, once. A 'yrange' anchor needs the Yjs binding (A8's
 * lib/anchors); until a package resolves it, a range by block id works.
 */
export function bindEditorCommands(editor: Editor, bus: DocCommandBus): () => void {
  const offs = [
    bus.on('insertAt', ({ at, content }) => {
      if (editor.isDestroyed || !editor.isEditable) return
      const pos = at === 'selection' ? editor.state.selection.to : at === 'end' ? editor.state.doc.content.size : at
      editor.chain().focus().insertContentAt(pos, content).run()
    }),
    bus.on('replaceRange', ({ anchor, content }) => {
      if (editor.isDestroyed || !editor.isEditable) return
      const range = anchor.block_id ? findBlock(editor, anchor.block_id) : null
      if (!range) {
        console.warn('replaceRange: the anchor is not in the doc', anchor)
        return
      }
      editor.chain().focus().insertContentAt(range, content).run()
    }),
  ]
  return () => offs.forEach((off) => off())
}

/** The bus of the doc shell around a component (the header, a panel), when it has one. */
export const DocBusContext = React.createContext<DocCommandBus | null>(null)

export function useDocBus(): DocCommandBus {
  return React.useContext(DocBusContext) ?? NO_BUS
}
