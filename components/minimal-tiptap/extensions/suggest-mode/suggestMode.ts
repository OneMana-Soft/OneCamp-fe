"use client"

/**
 * Suggesting (docs C5): an editor's own changes become suggestions for the
 * doc's people to accept or decline, change by change, as in a shared doc
 * anywhere. Nothing a suggestion says is written until it is accepted.
 *
 * Per editor, two things are kept here: whether it is suggesting, and the
 * suggestion being written (the composer, SuggestComposer.tsx, open on the
 * words chosen). While an editor suggests, its own changes to the doc are
 * stopped (filterTransaction): typing over words, or at the caret, opens the
 * composer with what was typed; Backspace or Delete over words opens it to
 * suggest taking them out. Changes from other people (through the shared doc)
 * always pass, and so does accepting a suggestion: its own transaction
 * carries DECISION_WRITE, the one write a suggesting editor makes.
 *
 * Anyone who may comment may suggest (the server's rule): a reader who can
 * comment suggests from the selection bar ("Suggest edit"), since their
 * editor takes no typing at all.
 */

import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { isDecisionWrite, isRemote } from "@/lib/proposals/review"

/** The composer, open on a stretch of the doc, with what was typed to open it. */
export interface OpenSuggestion {
  from: number
  to: number
  /**
   * What was typed to open it: it takes the chosen words' place ("" for
   * Backspace over them). Undefined when it was opened to edit the words
   * (the selection bar).
   */
  seed?: string
  /**
   * What was typed after the key that opened it, before its field took the
   * focus: it follows the seed, so a fast typist loses no letters.
   */
  late?: string
}

export interface SuggestState {
  suggesting: boolean
  open: OpenSuggestion | null
}

const OFF: SuggestState = Object.freeze({ suggesting: false, open: null }) as SuggestState
const states = new WeakMap<Editor, SuggestState>()
const listeners = new Set<() => void>()

function set(editor: Editor, next: SuggestState) {
  states.set(editor, next)
  for (const l of [...listeners]) l()
}

/** Whether an editor is suggesting, and the suggestion being written there. */
export function suggestStateOf(editor: Editor | null | undefined): SuggestState {
  return (editor && states.get(editor)) || OFF
}

/** Turns suggesting on or off; turning it off lets go of a suggestion being written. */
export function setSuggesting(editor: Editor, on: boolean) {
  const was = suggestStateOf(editor)
  if (was.suggesting === on) return
  set(editor, { suggesting: on, open: on ? was.open : null })
}

/** Opens the composer on from..to (a caret when they are equal). */
export function openSuggestion(editor: Editor, open: OpenSuggestion) {
  set(editor, { ...suggestStateOf(editor), open })
}

/**
 * Keeps text typed into the doc while the composer opens, for its field: a
 * key's, or a keyboard's word (IME) committed there as the focus moved, whose
 * rest it composes in the field. Not when the words were opened to edit (the
 * selection bar): the field holds them.
 */
function typedLate(editor: Editor, text: string) {
  const was = suggestStateOf(editor)
  if (!was.open || was.open.seed === undefined) return
  set(editor, { ...was, open: { ...was.open, late: (was.open.late ?? "") + text } })
}

/** Closes the composer. */
export function closeSuggestion(editor: Editor) {
  const was = suggestStateOf(editor)
  if (was.open) set(editor, { ...was, open: null })
}

/** Calls back on every change to any editor's suggesting (useSyncExternalStore). */
export function subscribeSuggest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The editor each open doc's suggestions are shown in, for the list beside
// the doc to take someone to one (SuggestionsList.tsx).
const editorsByDoc = new Map<string, Editor>()

/** Remembers the editor a doc's suggestions show in; the returned function forgets it. */
export function rememberEditor(docId: string, editor: Editor): () => void {
  editorsByDoc.set(docId, editor)
  return () => {
    if (editorsByDoc.get(docId) === editor) editorsByDoc.delete(docId)
  }
}

/** The editor an open doc's suggestions show in, if it is open. */
export function editorOf(docId: string): Editor | undefined {
  const e = editorsByDoc.get(docId)
  return e && !e.isDestroyed ? e : undefined
}

/** Whether a transaction may change the doc of an editor that is suggesting. Pure. */
export function passes(suggesting: boolean, tr: Transaction): boolean {
  return !tr.docChanged || !suggesting || isDecisionWrite(tr) || isRemote(tr)
}

export const suggestModeKey = new PluginKey("suggestMode")

const isDelete = (key: string) => key === "Backspace" || key === "Delete"

/** The plugin's handling, by editor: whether a key or input was taken (it opened the composer, or did nothing). */
function intercept(editor: Editor, from: number, to: number, seed: string | undefined): boolean {
  const state = suggestStateOf(editor)
  if (!state.suggesting) return false
  // The composer is open, and takes the focus as it is drawn: what still
  // reaches the doc meanwhile opens nothing more, and its text goes to the field.
  if (state.open) {
    if (seed) typedLate(editor, seed)
    return true
  }
  // A caret's Backspace has nothing chosen to take out: it does nothing,
  // rather than changing the doc behind the person's back.
  if (seed === "" && from === to) return true
  openSuggestion(editor, { from, to, seed })
  return true
}

export const SuggestMode = Extension.create({
  name: "suggestMode",

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: suggestModeKey,
        filterTransaction: (tr) => passes(suggestStateOf(editor).suggesting, tr),
        props: {
          handleTextInput(view, from, to, text) {
            return intercept(editor, from, to, text)
          },
          handleKeyDown(view, event) {
            if (!suggestStateOf(editor).suggesting || event.metaKey || event.ctrlKey || event.altKey) return false
            const { from, to } = view.state.selection
            if (isDelete(event.key)) return intercept(editor, from, to, "")
            // Return opens the composer to write there (a new line is written in it).
            if (event.key === "Enter") return intercept(editor, from, to, undefined)
            return false
          },
          handlePaste(view, event) {
            if (!suggestStateOf(editor).suggesting) return false
            const text = event.clipboardData?.getData("text/plain") ?? ""
            const { from, to } = view.state.selection
            return intercept(editor, from, to, text || undefined)
          },
          // A drop would move words without a suggestion: not while suggesting.
          handleDrop() {
            return suggestStateOf(editor).suggesting
          },
          handleDOMEvents: {
            // A phone's keyboard composes each word (IME) before it gives it:
            // the composer opens as that starts, empty over the words chosen,
            // and takes the focus, so the word is composed in it rather than
            // cut short in the doc.
            compositionstart(view) {
              const state = suggestStateOf(editor)
              if (!state.suggesting || state.open) return false
              const { from, to } = view.state.selection
              openSuggestion(editor, { from, to, seed: "" })
              return false
            },
          },
        },
      }),
    ]
  },
})
