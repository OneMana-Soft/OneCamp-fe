"use client"

/**
 * The doc page's keys, from the actions that name one (PROGRAM.md §4 #2): the
 * same table the shortcuts dialog lists (shortcuts.ts), bound here for the
 * page, outside the editor's own keymap: ⌘L copies the link, "?" opens the
 * shortcuts, ⇧F focus mode. It takes over from docPageKeys.ts, whose rules it
 * keeps:
 *
 * - only the doc that has focus answers (split view shows two), and with
 *   nothing focused, the first doc on the page;
 * - a key that can't type a character (⌘L) works in the text too; one that
 *   can ("?", ⇧F) only outside it, so "?" typed in the doc is a question mark.
 */

import * as React from 'react'
import { goArmed } from '@/lib/goKeys'
import { chordMatches } from '@/lib/keys/chord'
import type { EditionGate } from './registry'
import { actionsWithKeys } from './shortcuts'
import type { ActionContext } from './types'

export { chordMatches }

/** A chord that can't type a character: it works in the text as well. */
const typesNothing = (chord: string) => /(^|-)(Mod|Ctrl|Alt)-/.test(chord)

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * Binds the actions' page keys on a doc's page. `context` is read when a key
 * is pressed (the page keeps it current: its editor, its bus, its state).
 */
export function useActionKeys(root: React.RefObject<HTMLElement | null>, context: () => ActionContext | null, gate: EditionGate) {
  const latest = React.useRef(context)
  React.useLayoutEffect(() => {
    latest.current = context
  })

  React.useEffect(() => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      const el = root.current
      if (!el) return
      const active = document.activeElement
      const nothingFocused = !active || active === document.body
      const mine = el.contains(active) || (nothingFocused && document.querySelector('[data-doc-view]') === el)
      if (!mine) return
      for (const action of actionsWithKeys(gate)) {
        if (action.shortcutScope === 'editor') continue
        const chord = action.shortcut!
        if (!chordMatches(e, chord, mac)) continue
        if (!typesNothing(chord) && isTyping(e.target)) return
        // G then L goes to Later: a plain letter waits while G is armed.
        if (/^[a-z]$/i.test(chord) && goArmed()) return
        const ctx = latest.current()
        if (!ctx) return
        if (action.isEnabled && !action.isEnabled(ctx)) return
        e.preventDefault()
        void action.run(ctx)
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [root, gate])
}
