/**
 * The values connected work keeps in a doc (docs programme C1), as the
 * editor, the codec and the collaboration service's schema/connected.js all
 * read them: an id is a uuid in lower case, a day is "2026-10-12", and a task
 * list shows open, mine or all. Imports nothing, so the editor's blocks can
 * use it without the codec, and the codec's table of global attributes
 * without a cycle.
 */

import type { GlobalAttr } from './globalAttrs'

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** v as an id: a uuid in lower case, or ''. */
export const connectedId = (v: unknown): string => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : '')

/** v as a day on the calendar, "2026-10-12", or '': "2026-02-30" is none. */
export function isoDate(v: unknown): string {
  const m = typeof v === 'string' ? ISO_DATE.exec(v) : null
  if (!m) return ''
  const d = new Date(0)
  d.setUTCFullYear(+m[1], +m[2] - 1, +m[3])
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : ''
}

/** A day as the body writes it, whatever the reader's language: "12 Oct 2026". */
export function dateWords(v: unknown): string {
  const d = isoDate(v)
  const m = d ? Number(d.slice(5, 7)) - 1 : -1
  if (m < 0 || m > 11) return ''
  return `${d.slice(8, 10).replace(/^0+/, '')} ${MONTHS[m]} ${d.slice(0, 4)}`
}

/** A title kept as text (a number is written as one), or ''. */
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

/**
 * The app's address and the words a connected block stands for: one rule for
 * the codec (connected.ts and markdown.ts; the API's connected.go) and the
 * editor's own HTML (the blocks' renderHTML), so both write the same bytes. A
 * page names no title unless an older client kept one: "Page".
 */
export function connectedLinkOf(type: string, attrs: Record<string, unknown> | null | undefined): { path: string; words: string } {
  const a = attrs || {}
  switch (type) {
    case 'subpage': {
      const id = connectedId(a.docId)
      return { path: id ? '/app/doc/' + id : '', words: text(a.title) || 'Page' }
    }
    case 'taskListEmbed':
    case 'boardEmbed': {
      const id = connectedId(a.projectId)
      return { path: id ? '/app/project/' + id : '', words: type === 'taskListEmbed' ? 'Tasks' : 'Board' }
    }
  }
  return { path: '', words: '' }
}

/** What a task list embed shows. */
export const TASK_LIST_SHOWS = ['open', 'mine', 'all'] as const
export type TaskListShow = (typeof TASK_LIST_SHOWS)[number]

/** v as what a task list shows: open when it names none. */
export const taskListShow = (v: unknown): TaskListShow => (TASK_LIST_SHOWS.includes(v as TaskListShow) ? (v as TaskListShow) : 'open')

const orNull = (s: string) => (s === '' ? null : s)

/** The to-do's task, on the to-do (⌘⇧Enter made it). */
export const CONNECTED_ATTRS: GlobalAttr[] = [
  {
    name: 'taskId',
    html: 'data-task-id',
    on: ['taskItem'],
    def: null,
    typed: (v) => orNull(connectedId(v)),
    read: (raw) => orNull(connectedId(raw)),
    write: (v) => connectedId(v),
  },
]
