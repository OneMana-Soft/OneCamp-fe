/**
 * The nodes and marks the codec knows, with the attributes the editor gives
 * them and their defaults: the same table as the API's
 * business/ContentCodec/schema.go. codec.fixtures.test.ts holds it to the
 * schema manifest the editor is held to.
 */

import manifest from '@/components/minimal-tiptap/schema-manifest.json'
import { DOC_COLOURS } from '@/lib/docColours'
import { MEDIA_NODE_SPECS } from './media'
import { CONNECTED_NODE_SPECS } from './connected' // C1

/** What a node may hold. */
export type ContentKind =
  | 'nothing' // an atom or a leaf
  | 'blocks' // block+
  | 'inline' // inline*
  | 'text' // text*, unmarked (a code block)
  | 'listItems' // listItem+
  | 'taskItems' // taskItem+
  | 'itemBody' // paragraph block*
  | 'rows' // tableRow+
  | 'cells' // (tableCell | tableHeader)*
  | 'summaryBody' // (paragraph | heading) block*: a toggle's summary, then what it folds
  | 'columns' // column+

export interface AttrSpec {
  name: string
  def: unknown // null: none
}

export interface NodeSpec {
  name: string
  inline?: boolean
  content: ContentKind
  attrs?: AttrSpec[]
}

interface MarkSpec {
  name: string
  /** Order on a node, outermost first in HTML: the editor schema's order. */
  rank: number
  attrs?: AttrSpec[]
  excludesAll?: boolean
}

const cellAttrs: AttrSpec[] = [
  { name: 'colspan', def: 1 },
  { name: 'rowspan', def: 1 },
  { name: 'colwidth', def: null },
  // A cell's colour, by name (B3, N15): one of CELL_COLOURS.
  { name: 'background', def: null },
]

/** The colours a table cell may have, by name: the doc's colours (lib/docColours.ts). */
export const CELL_COLOURS: ReadonlySet<string> = new Set(DOC_COLOURS)
const mentionAttrs: AttrSpec[] = [
  { name: 'id', def: null },
  { name: 'label', def: null },
  { name: 'mentionSuggestionChar', def: '@' },
]

/**
 * The attributes the editor gives blocks for their identity, not their
 * content: blockId, on every block (docs programme A1; the collaboration
 * service's schema/blockId.js). The codec neither reads nor writes them: an
 * export carries none, and an import's blocks get theirs where they land.
 * The manifest lists them; codec.fixtures.test.ts leaves them out (as the
 * API's business/ContentCodec does).
 */
export const IDENTITY_ATTRS: ReadonlySet<string> = new Set(['blockId'])

export const NODE_SPECS: Record<string, NodeSpec> = {
  doc: { name: 'doc', content: 'blocks' },
  paragraph: { name: 'paragraph', content: 'inline' },
  text: { name: 'text', inline: true, content: 'nothing' },
  heading: { name: 'heading', content: 'inline', attrs: [{ name: 'level', def: 1 }] },
  blockquote: { name: 'blockquote', content: 'blocks' },
  bulletList: { name: 'bulletList', content: 'listItems' },
  orderedList: { name: 'orderedList', content: 'listItems', attrs: [{ name: 'start', def: 1 }, { name: 'type', def: null }] },
  listItem: { name: 'listItem', content: 'itemBody' },
  taskList: { name: 'taskList', content: 'taskItems' },
  taskItem: { name: 'taskItem', content: 'itemBody', attrs: [{ name: 'checked', def: false }] },
  // wrap is true or absent; caption is plain text (B3).
  codeBlock: { name: 'codeBlock', content: 'text', attrs: [{ name: 'language', def: null }, { name: 'wrap', def: null }, { name: 'caption', def: null }] },
  horizontalRule: { name: 'horizontalRule', content: 'nothing' },
  hardBreak: { name: 'hardBreak', inline: true, content: 'nothing' },
  image: {
    name: 'image',
    content: 'nothing',
    attrs: ['src', 'alt', 'title', 'width', 'height', 'id', 'caption', 'fileName', 'align', 'crop', 'href'].map((name) => ({ name, def: null })),
  },
  callout: {
    name: 'callout',
    content: 'blocks',
    attrs: [
      { name: 'emoji', def: '💡' },
      { name: 'color', def: 'blue' },
      { name: 'icon', def: null },
    ],
  },
  collapsible: { name: 'collapsible', content: 'summaryBody' },
  toc: { name: 'toc', content: 'nothing' },
  tableEmbed: { name: 'tableEmbed', content: 'nothing', attrs: [{ name: 'tableId', def: '' }, { name: 'viewId', def: '' }] },
  poll: { name: 'poll', content: 'nothing', attrs: [{ name: 'id', def: '' }] },
  chartEmbed: { name: 'chartEmbed', content: 'nothing', attrs: [{ name: 'spec', def: '' }] },
  diffEmbed: { name: 'diffEmbed', content: 'nothing', attrs: [{ name: 'diff', def: '' }] },
  recordingEmbed: {
    name: 'recordingEmbed',
    content: 'nothing',
    attrs: ['egress', 'kind', 'sid', 'u1', 'u2'].map((name) => ({ name, def: '' })),
  },
  mention: { name: 'mention', inline: true, content: 'nothing', attrs: mentionAttrs },
  channelMention: { name: 'channelMention', inline: true, content: 'nothing', attrs: mentionAttrs },
  entityMention: { name: 'entityMention', inline: true, content: 'nothing', attrs: mentionAttrs },
  // Equations (B3): their TeX, with Tiptap's names.
  inlineMath: { name: 'inlineMath', inline: true, content: 'nothing', attrs: [{ name: 'latex', def: '' }] },
  blockMath: { name: 'blockMath', content: 'nothing', attrs: [{ name: 'latex', def: '' }] },
  // The simple table's nodes (Tiptap's own names; B3). A schema without them
  // keeps a table as its Markdown in a code block.
  table: { name: 'table', content: 'rows' },
  ...MEDIA_NODE_SPECS,
  ...CONNECTED_NODE_SPECS, // C1: pages, dates, task lists and boards in a doc (connected.ts)
  tableRow: { name: 'tableRow', content: 'cells' },
  tableHeader: { name: 'tableHeader', content: 'blocks', attrs: cellAttrs },
  tableCell: { name: 'tableCell', content: 'blocks', attrs: cellAttrs },
  // B1's columns: a row of columns, each holding blocks, a whole-percent width or an equal share.
  columnList: { name: 'columnList', content: 'columns' },
  column: { name: 'column', content: 'blocks', attrs: [{ name: 'width', def: null }] },
}

export const MARK_SPECS: Record<string, MarkSpec> = {
  link: {
    name: 'link',
    rank: 0,
    attrs: [
      { name: 'href', def: null },
      { name: 'target', def: '_blank' },
      { name: 'rel', def: 'noopener noreferrer nofollow' },
      { name: 'class', def: null },
    ],
  },
  textStyle: { name: 'textStyle', rank: 1, attrs: [{ name: 'color', def: null }] },
  bold: { name: 'bold', rank: 2 },
  code: { name: 'code', rank: 3, excludesAll: true },
  italic: { name: 'italic', rank: 4 },
  strike: { name: 'strike', rank: 5 },
  underline: { name: 'underline', rank: 6 },
  highlight: { name: 'highlight', rank: 7, attrs: [{ name: 'color', def: 'sun' }] },
}

export const specOf = (type: string | undefined): NodeSpec | undefined => (type ? NODE_SPECS[type] : undefined)

/** The node and mark types a doc may hold: what the editor knows. */
export interface Schema {
  nodes: Set<string>
  marks: Set<string>
}

/** The schema the editor of this build has, from its manifest. */
export const SHIPPED: Schema = {
  nodes: new Set(Object.keys(manifest.nodes)),
  marks: new Set(Object.keys(manifest.marks)),
}

/** Every type the codec has rules for, the simple table included. */
export const EVERYTHING: Schema = {
  nodes: new Set(Object.keys(NODE_SPECS)),
  marks: new Set(Object.keys(MARK_SPECS)),
}

export const SHIPPED_MANIFEST = manifest as { nodes: Record<string, { attrs: string[] }>; marks: Record<string, { attrs: string[] }> }
