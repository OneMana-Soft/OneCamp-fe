/**
 * How other people show in a doc: their caret, name flag and selection, in
 * their identity hue (the one their tab sends through awareness, else from
 * their display name: lib/identityHue), and what packages add to the caret
 * through the 'presence' slot (registerSlot({slot: 'presence', decorate})).
 *
 * The caret carries data-user-id, so a package can find someone's caret, and
 * aria-hidden: the flag is text inside the editable area, and a screen reader
 * reads the doc, not other people's names in the middle of a sentence. A
 * decorator adds to the caret; it can't take away the hue, the id or
 * aria-hidden, which are set again after it.
 */

import { collaboratorHue } from '@/lib/identityHue'
import { HUE_CLASS } from '@/components/ui/graphics/hues'
import { slotFor, type EditionGate } from './registry'
import type { PresenceUser } from './types'

const isAgent = (user: PresenceUser) => user.kind === 'agent' || user.isAgent === true || user.is_agent === true

/** The class that colours a collaborator: their identity hue, or the agent tint (caret-agent). */
function collaboratorHueClass(user: PresenceUser): string {
  return isAgent(user) ? 'caret-agent' : HUE_CLASS[collaboratorHue(user)]
}

/**
 * Someone else's caret and name flag. The flag says their first name (the
 * whole name is its title); an agent's keeps its name and gets a spark
 * (data-agent). index.css draws the flag and folds it to a dot when they pause.
 */
export function collaboratorCaret(user: PresenceUser, gate: EditionGate = { ai: true }): HTMLElement {
  const caret = document.createElement('span')
  caret.className = `collaboration-cursor__caret ${collaboratorHueClass(user)}`
  const name = (user.name || '').trim()
  const agent = isAgent(user)
  if (agent) caret.dataset.agent = ''
  caret.title = name
  const label = document.createElement('div')
  label.className = 'collaboration-cursor__label'
  label.textContent = agent ? name : name.split(/\s+/)[0] || ''
  caret.append(label)
  for (const c of slotFor('presence', gate)) {
    try {
      c.decorate?.(caret, user)
    } catch (e) {
      console.error(`The presence decorator "${c.id}" failed`, e)
    }
  }
  // What every caret keeps, whatever a decorator did.
  caret.classList.add('collaboration-cursor__caret', ...collaboratorHueClass(user).split(' '))
  caret.setAttribute('aria-hidden', 'true')
  if (user.id) caret.dataset.userId = String(user.id)
  return caret
}

/** Someone else's selection, washed in their colour. */
export function collaboratorSelection(user: PresenceUser) {
  return { class: `ProseMirror-yjs-selection ${collaboratorHueClass(user)}`, style: '' }
}
