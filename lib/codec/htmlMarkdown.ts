/**
 * A body kept as HTML (a task's description, as its editor writes it), edited
 * as Markdown in a plain text box, through the Content Codec both ways. For a
 * screen that mustn't load the rich editor: the task templates' manager is a
 * lazy chunk that loads nothing reaching the shared core (app/firstLoad.test).
 *
 * The HTML read in is the app's own, kept by the server, but goes through the
 * codec as foreign HTML all the same; the HTML written out is the codec's own,
 * built from its document with every text and attribute escaped and unsafe
 * links left as text.
 */

import { codec } from './index'

/** A kept body as Markdown, to edit: "" for none. */
export function markdownOfHTML(html: string | null | undefined): string {
  if (!html?.trim()) return ''
  return codec.toMarkdown(codec.fromHTML(html)).replace(/\n+$/, '')
}

/** Markdown as the HTML the body is kept in: "" for none (nothing but blank lines). */
export function htmlOfMarkdown(markdown: string): string {
  if (!markdown.trim()) return ''
  return codec.toHTML(codec.fromMarkdown(markdown))
}
