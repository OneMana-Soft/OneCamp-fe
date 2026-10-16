/**
 * B2's formatting (docs programme B2), as the codec reads and writes it: the
 * same rules, rule for rule, as the API's business/ContentCodec/doc_format.go.
 *
 * - Colours are names (N15): text "sky", a block's background
 *   "sky_background". An old doc's var(--camp-sky-ink) reads as "sky"; any
 *   other colour is none (a paste's black would vanish in the dark theme).
 * - A block's own colour (blockColor) and a large quote (quoteSize) are global
 *   attributes: HTML carries them, Markdown has no way to.
 * - A highlight is a mark by colour name (<mark> in Markdown, its colour left
 *   out); a table of contents is a block ([TOC] in Markdown); a toggle's first
 *   line is its summary, and an old toggle's title becomes that line
 *   (normalize.ts).
 *
 * The colour names and their rules are lib/docColours.ts's, the one list.
 */

import { blockColourValue as docBlockColourValue, colourName as docColourName, isDocColour } from '@/lib/docColours'
import type { GlobalAttr } from './globalAttrs'

/** A text colour as stored: its name, or '' when it isn't one of ours (lib/docColours' rule). */
export const colourName = (v: unknown): string => docColourName(v) ?? ''

/** A highlight's colour: its name, yellow when it names none of ours. */
export const highlightColour = (v: unknown): string => (isDocColour(v) ? v : 'sun')

/** A block's stored colour ("sky", "sky_background"), or '' when it isn't one of ours. */
export const blockColourValue = (v: unknown): string => docBlockColourValue(v) ?? ''

const quoteSizeValue = (v: unknown): string => (v === 'large' ? 'large' : '')

const orNull = (s: string) => (s === '' ? null : s)

/** B2's global attributes. */
export const DOC_FORMAT_ATTRS: GlobalAttr[] = [
  {
    name: 'blockColor',
    html: 'data-block-color',
    on: ['paragraph', 'heading', 'blockquote', 'listItem', 'taskItem', 'collapsible'],
    def: null,
    typed: (v) => orNull(blockColourValue(v)),
    read: (raw) => orNull(blockColourValue(raw)),
    write: (v) => blockColourValue(v),
  },
  {
    name: 'quoteSize',
    html: 'data-quote-size',
    on: ['blockquote'],
    def: null,
    typed: (v) => orNull(quoteSizeValue(v)),
    read: (raw) => orNull(quoteSizeValue(raw)),
    write: (v) => quoteSizeValue(v),
  },
]

const LUCIDE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+){0,3}$/

/** A callout's icon: a Lucide name ("rocket", "triangle-alert"), or '' for its kind's own. */
export const calloutIcon = (v: unknown): string => (typeof v === 'string' && v.length <= 40 && LUCIDE_NAME.test(v) ? v : '')

const asciiLower = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32))

/** Whether a paragraph, as written in Markdown, is a table of contents: [TOC], or GitLab's [[_TOC_]]. Written \[TOC\], it is text. */
export function isTocLine(src: string): boolean {
  const s = asciiLower(src)
  return s === '[toc]' || s === '[[toc]]' || s === '[[_toc_]]'
}
