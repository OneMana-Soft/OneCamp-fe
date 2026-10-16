/**
 * The codec's rules for connected work (docs programme C1): a page in a doc
 * (subpage), a date in a line (dateMention), a project's tasks or board
 * (taskListEmbed, boardEmbed), and a to-do's task (taskId on taskItem). The
 * same rules, in the same order, as the API's business/ContentCodec/
 * connected.go; the golden fixture testdata/codec/connected.* holds the two to
 * the same bytes.
 *
 * In HTML each is what the editor renders: ids and the date as attributes,
 * and a plain link or the date's words inside, for a reader that knows
 * nothing of them. In Markdown each is that link, or the date's words.
 */

import { CNode, attrString, node, setAttr } from './doc'
import { escapeAttr, escapeText } from './htmlEscape'
import { connectedId, connectedLinkOf, dateWords, isoDate, taskListShow } from './connectedValues'
import type { NodeSpec } from './schema'

const none = (name: string) => ({ name, def: null })

export const CONNECTED_NODE_SPECS: Record<string, NodeSpec> = {
  subpage: { name: 'subpage', content: 'nothing', attrs: ['docId', 'title'].map(none) },
  dateMention: { name: 'dateMention', inline: true, content: 'nothing', attrs: ['date', 'reminder'].map(none) },
  taskListEmbed: { name: 'taskListEmbed', content: 'nothing', attrs: [none('projectId'), { name: 'show', def: 'open' }] },
  boardEmbed: { name: 'boardEmbed', content: 'nothing', attrs: [none('projectId')] },
}

const orNull = (s: string) => (s === '' ? null : s)

/** A connected node's attribute as the editor's schema types it; undefined when it isn't one of theirs. */
export function typedConnectedAttr(typ: string, name: string, v: unknown): unknown {
  if ((typ === 'subpage' && name === 'docId') || ((typ === 'taskListEmbed' || typ === 'boardEmbed') && name === 'projectId')) return orNull(connectedId(v))
  if (typ === 'dateMention' && name === 'date') return orNull(isoDate(v))
  if (typ === 'taskListEmbed' && name === 'show') return taskListShow(v)
  return undefined
}

/** Each connected block's data-type, and back. */
const BLOCKS: Record<string, string> = { subpage: 'subpage', taskListEmbed: 'task-list-embed', boardEmbed: 'board-embed' }
const TYPES: Record<string, string> = Object.fromEntries(Object.entries(BLOCKS).map(([type, dataType]) => [dataType, type]))

const attr = (name: string, value: string) => ' ' + name + '="' + escapeAttr(value) + '"'

/** Writes a connected block's HTML; false for any other node. */
export function writeConnectedBlock(out: string[], n: CNode): boolean {
  const dataType = BLOCKS[n.type]
  if (!dataType) return false
  out.push('<div data-type="' + dataType + '"')
  if (n.type === 'subpage') {
    const id = connectedId(n.attrs?.docId)
    if (id) out.push(attr('data-doc-id', id))
    const t = attrString(n, 'title')
    if (t) out.push(attr('data-title', t))
  } else {
    const id = connectedId(n.attrs?.projectId)
    if (id) out.push(attr('data-project-id', id))
    if (n.type === 'taskListEmbed') out.push(attr('data-show', taskListShow(n.attrs?.show)))
  }
  out.push('>')
  const { path, words } = connectedLinkOf(n.type, n.attrs)
  if (path) out.push('<a href="' + escapeAttr(path) + '">' + escapeText(words) + '</a>')
  out.push('</div>')
  return true
}

/** Writes a date in a line. */
export function writeDateMention(out: string[], n: CNode) {
  out.push('<time data-type="date-mention"')
  const d = isoDate(n.attrs?.date)
  if (d) out.push(attr('datetime', d))
  const r = attrString(n, 'reminder')
  if (r) out.push(attr('data-reminder', r))
  out.push('>' + escapeText(dateWords(n.attrs?.date)) + '</time>')
}

/** A connected block read from its div, or null for any other div. */
export function readConnectedBlock(dataType: string, el: Element): CNode | null {
  switch (dataType) {
    case 'subpage': {
      const m = node('subpage', { attrs: {} })
      const id = connectedId(el.getAttribute('data-doc-id'))
      if (id) setAttr(m, 'docId', id)
      const t = el.getAttribute('data-title')
      if (t) setAttr(m, 'title', t)
      return m
    }
    case 'task-list-embed':
    case 'board-embed': {
      const m = node(TYPES[dataType], { attrs: {} })
      const id = connectedId(el.getAttribute('data-project-id'))
      if (id) setAttr(m, 'projectId', id)
      if (m.type === 'taskListEmbed') setAttr(m, 'show', taskListShow(el.getAttribute('data-show')))
      return m
    }
  }
  return null
}

/** A date in a line, read from its <time>. */
export function readDateMention(el: Element): CNode {
  const m = node('dateMention', { attrs: {} })
  const d = isoDate(el.getAttribute('datetime'))
  if (d) setAttr(m, 'date', d)
  const r = el.getAttribute('data-reminder')
  if (r) setAttr(m, 'reminder', r)
  return m
}

