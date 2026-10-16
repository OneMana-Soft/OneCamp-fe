/**
 * Anchors against real Yjs and y-prosemirror (G-COLLAB for A8): two copies of
 * a doc exchanging updates as two browsers would, the anchored words deleted,
 * the doc rebuilt into a new lineage, and a whole-body replace in one
 * transaction (A4's replaceAll). Positions are read through y-prosemirror's
 * own mapping, as the editor reads them.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { initProseMirrorDoc, prosemirrorJSONToYXmlFragment, ySyncPlugin } from 'y-prosemirror'
import { Schema, type Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'
import {
  anchorFor,
  bindingOf,
  blockIdsOf,
  blockRanges,
  findReattachCandidates,
  fromBase64,
  lineageOf,
  quoteOf,
  resolveAnchor,
  toBase64,
  type YBinding,
} from './anchors'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', attrs: { blockId: { default: null } }, toDOM: () => ['p', 0] },
    // A block holding blocks (a callout), each with its own id.
    box: { group: 'block', content: 'paragraph+', attrs: { blockId: { default: null } }, toDOM: () => ['div', 0] },
    text: { group: 'inline' },
    mention: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { id: { default: null }, label: { default: null } },
      toDOM: (n) => ['span', { 'data-id': n.attrs.id }, n.attrs.label ?? ''],
    },
  },
})

const p = (...content: object[]) => ({ type: 'paragraph', content })
const t = (text: string) => ({ type: 'text', text })
const docJSON = (...blocks: object[]) => ({ type: 'doc', content: blocks })

/** A copy of a doc: its Yjs doc and fragment, read as the editor would. */
function copy(ydoc: Y.Doc) {
  const type = ydoc.getXmlFragment('default')
  const read = () => {
    const { doc, mapping } = initProseMirrorDoc(type, schema)
    return { doc: doc as PMNode, b: { doc: ydoc, type, mapping } as YBinding }
  }
  return { ydoc, type, read }
}

function seeded(json: object, epoch?: string) {
  const ydoc = new Y.Doc()
  ydoc.transact(() => {
    prosemirrorJSONToYXmlFragment(schema, json, ydoc.getXmlFragment('default'))
    if (epoch) ydoc.getMap('meta').set('epoch', epoch)
  })
  return copy(ydoc)
}

/** Two browsers with the same doc, passing every update to each other. */
function pair(json: object) {
  const a = seeded(json)
  const bDoc = new Y.Doc()
  Y.applyUpdate(bDoc, Y.encodeStateAsUpdate(a.ydoc))
  a.ydoc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(bDoc, u, 'net'))
  bDoc.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(a.ydoc, u, 'net'))
  return { a, b: copy(bDoc) }
}

/** The first paragraph's text, as Yjs holds it. */
const firstText = (type: Y.XmlFragment) => (type.get(0) as Y.XmlElement).get(0) as Y.XmlText

function rangeOf(doc: PMNode, words: string) {
  const i = doc.textContent.indexOf(words)
  if (i < 0) throw new Error(`no "${words}"`)
  return { from: i + 1, to: i + 1 + words.length } // one paragraph: text starts at 1
}

describe('an anchor on a live doc', () => {
  const words = 'ship on Thursday'
  const json = docJSON(p(t('We ship on Thursday, then rest.')))

  it('stays on its words when someone else types before it', () => {
    const { a, b } = pair(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    expect(anchor.quote).toBe(words)
    expect(anchor.lineage).toBe('')

    firstText(b.type).insert(0, 'Note: ') // the other browser, before the anchor

    for (const side of [a, b]) {
      const now = side.read()
      const r = resolveAnchor(now.b, now.doc, anchor)
      expect(r.state).toBe('attached')
      if (r.state === 'attached') expect(now.doc.textBetween(r.from, r.to)).toBe(words)
    }
  })

  it('keeps typing just outside it outside', () => {
    const { a, b } = pair(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    const text = firstText(b.type)
    const end = text.toString().indexOf(words) + words.length
    text.insert(end, '!') // right after the last word
    text.insert(end - words.length, '>') // right before the first
    const now = a.read()
    const r = resolveAnchor(now.b, now.doc, anchor)
    expect(r.state === 'attached' && now.doc.textBetween(r.from, r.to)).toBe(words)
    expect(now.doc.textContent).toContain('>ship on Thursday!')
  })

  it('takes in what is typed inside it', () => {
    const { a, b } = pair(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    const text = firstText(b.type)
    text.insert(text.toString().indexOf('Thursday'), 'next ')
    const now = a.read()
    const r = resolveAnchor(now.b, now.doc, anchor)
    expect(r.state === 'attached' && now.doc.textBetween(r.from, r.to)).toBe('ship on next Thursday')
  })

  it('is detached when its words are deleted, and keeps its quote', () => {
    const { a, b } = pair(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    const text = firstText(b.type)
    text.delete(text.toString().indexOf(words), words.length)
    const now = a.read()
    expect(resolveAnchor(now.b, now.doc, anchor)).toEqual({ state: 'detached', reason: 'deleted', quote: words })
    // Nothing to offer back: the words are nowhere now.
    expect(findReattachCandidates(now.doc, words)).toEqual([])
  })

  it('is detached when its whole block is deleted', () => {
    const { a, b } = pair(docJSON(p(t('Intro.')), p(t('We ship on Thursday, then rest.')), p(t('Outro.'))))
    const before = a.read()
    const i = before.doc.textBetween(0, before.doc.content.size, '\n').indexOf(words)
    expect(i).toBeGreaterThan(0)
    const second = before.doc.child(0).nodeSize // where the second paragraph starts
    const from = second + 1 + 'We '.length
    const anchor = anchorFor(before.b, before.doc, from, from + words.length)
    expect(anchor.quote).toBe(words)
    b.type.delete(1, 1)
    const now = a.read()
    expect(now.doc.childCount).toBe(2)
    expect(resolveAnchor(now.b, now.doc, anchor)).toMatchObject({ state: 'detached', reason: 'deleted' })
  })

  it('is detached by a new lineage, and offered back only where the words match exactly', () => {
    const old = seeded(json)
    const before = old.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)

    // The server rebuilds the doc from its saved HTML (a restore, an API
    // write): the same words, another copy, another lineage.
    const rebuilt = seeded(docJSON(p(t('We Ship on thursday.')), p(t('Plan: we ship on Thursday, then rest.'))), 'epoch-2')
    const now = rebuilt.read()
    expect(lineageOf(rebuilt.ydoc)).toBe('epoch-2')
    expect(resolveAnchor(now.b, now.doc, anchor)).toEqual({ state: 'detached', reason: 'lineage', quote: words })

    // The differently cased words are not a match; the exact ones are.
    const found = findReattachCandidates(now.doc, words)
    expect(found).toHaveLength(1)
    expect(now.doc.textBetween(found[0].from, found[0].to)).toBe(words)

    // "Reattach here" makes a new anchor on the new lineage, which holds.
    const again = anchorFor(now.b, now.doc, found[0].from, found[0].to)
    expect(again.lineage).toBe('epoch-2')
    expect(resolveAnchor(now.b, now.doc, again)).toEqual({ state: 'attached', ...found[0] })
  })

  it('is detached by a whole-body replace in one transaction (replaceAll), with the words offered back', () => {
    const { a, b } = pair(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    // As the Live Doc Writer would on the server: one transaction, same Y.Doc.
    b.ydoc.transact(() => {
      b.type.delete(0, b.type.length)
      prosemirrorJSONToYXmlFragment(schema, docJSON(p(t('Restored: we ship on Thursday, then rest.'))), b.type)
    })
    const now = a.read()
    expect(resolveAnchor(now.b, now.doc, anchor)).toMatchObject({ state: 'detached', reason: 'deleted' })
    expect(findReattachCandidates(now.doc, words)).toHaveLength(1)
  })

  it('is pending, never detached, before the doc is bound or synced', () => {
    const a = seeded(json)
    const before = a.read()
    const { from, to } = rangeOf(before.doc, words)
    const anchor = anchorFor(before.b, before.doc, from, to)
    expect(resolveAnchor(null, before.doc, anchor)).toEqual({ state: 'pending' })
    expect(resolveAnchor(before.b, before.doc, anchor, { synced: false })).toEqual({ state: 'pending' })
    // An empty copy that hasn't had the server's state yet.
    const fresh = copy(new Y.Doc()).read()
    expect(resolveAnchor(fresh.b, fresh.doc, anchor, { synced: false })).toEqual({ state: 'pending' })
    expect(resolveAnchor(before.b, before.doc, { kind: 'none' })).toEqual({ state: 'page' })
  })

  it('passes over the wire as standard base64 and back', () => {
    const a = seeded(json)
    const { doc, b } = a.read()
    const { from, to } = rangeOf(doc, words)
    const anchor = anchorFor(b, doc, from, to)
    expect(anchor.start).toMatch(/^[A-Za-z0-9+/]+=*$/)
    const bytes = fromBase64(anchor.start!)
    expect(toBase64(bytes)).toBe(anchor.start)
    expect(Y.decodeRelativePosition(bytes)).toBeTruthy()
  })
})

describe('quotes and candidates', () => {
  const json = docJSON(
    p(t('Ask '), { type: 'mention', attrs: { id: 'u1', label: '@Sam' } }, t(' about it.')),
    p(t('Then ship.')),
  )

  it('quote across blocks and chips as the candidates read them', () => {
    const { doc } = seeded(json).read()
    const all = quoteOf(doc, 0, doc.content.size)
    expect(all).toBe('Ask @Sam about it.\nThen ship.')
    const found = findReattachCandidates(doc, 'it.\nThen')
    expect(found).toHaveLength(1)
    expect(quoteOf(doc, found[0].from, found[0].to)).toBe('it.\nThen')
    const chip = findReattachCandidates(doc, 'Ask @Sam')
    expect(chip).toHaveLength(1)
    expect(quoteOf(doc, chip[0].from, chip[0].to)).toBe('Ask @Sam')
    // A match may not begin or end inside a chip.
    expect(findReattachCandidates(doc, 'Sam about')).toEqual([])
  })

  it('finds every exact match, in order', () => {
    const { doc } = seeded(docJSON(p(t('go, go, go')))).read()
    expect(findReattachCandidates(doc, 'go').map((c) => c.from)).toEqual([1, 5, 9])
    expect(findReattachCandidates(doc, '')).toEqual([])
  })

  it('records the block a range begins in', () => {
    const { doc, b } = seeded(docJSON({ type: 'paragraph', attrs: { blockId: 'blk-7' }, content: [t('Hello world')] })).read()
    expect(anchorFor(b, doc, 1, 6).block_id).toBe('blk-7')
    expect(resolveAnchor(b, doc, { kind: 'block', block_id: 'blk-7' })).toEqual({ state: 'attached', from: 1, to: 12 })
    expect(resolveAnchor(b, doc, { kind: 'block', block_id: 'gone', quote: 'x' })).toEqual({ state: 'detached', reason: 'deleted', quote: 'x' })
  })

  // B7: a comment on a whole block that has nothing in it of its own (a
  // picture, a divider, an empty line) held an empty range, which the next
  // edit anywhere took for deleted words.
  it('takes a block with nothing in it whole, never as an empty range', () => {
    const { doc, b } = seeded(docJSON({ type: 'paragraph', attrs: { blockId: 'empty-1' } }, { type: 'paragraph', attrs: { blockId: 'blk-8' }, content: [t('After')] })).read()
    expect(resolveAnchor(b, doc, { kind: 'block', block_id: 'empty-1' })).toEqual({ state: 'attached', from: 0, to: 2 })
    expect(resolveAnchor(b, doc, { kind: 'block', block_id: 'blk-8' })).toEqual({ state: 'attached', from: 3, to: 8 })
  })
})

// B7: the block menu's Comment on blocks chosen apart is on those blocks
// (meta.block_ids), never on what lies between them.
describe('blocks chosen together', () => {
  const para = (id: string, text?: string) => ({ type: 'paragraph', attrs: { blockId: id }, ...(text ? { content: [t(text)] } : {}) })
  const several = { kind: 'block' as const, block_id: 'a', quote: 'Plan\nDates', meta: { block_ids: ['a', 'c'] } }

  it('names its own block first, then the others, each once, and nothing else', () => {
    expect(blockIdsOf(several)).toEqual(['a', 'c'])
    expect(blockIdsOf({ kind: 'block', block_id: 'x', meta: { block_ids: ['y', 'x', 7, '', 'y'] } })).toEqual(['x', 'y'])
    expect(blockIdsOf({ kind: 'yrange', block_id: 'x' })).toEqual([])
  })

  it('finds every block it names in one walk, a block inside another too', () => {
    const { doc } = seeded(docJSON(para('a', 'Plan'), { type: 'box', attrs: { blockId: 'box' }, content: [para('in', 'Inside')] }, para('c', 'Dates'))).read()
    const found = blockRanges(doc, ['c', 'in', 'missing'])
    expect([...found.keys()]).toEqual(['in', 'c'])
    expect(doc.textBetween(found.get('in')!.from, found.get('in')!.to)).toBe('Inside')
    expect(resolveAnchor(null, doc, { kind: 'block', block_id: 'in' })).toMatchObject({ state: 'attached' })
  })

  it('is attached while any of its blocks is there, at the first of them, and detached once none is', () => {
    const { doc } = seeded(docJSON(para('a', 'Plan'), para('b', 'Budget'), para('c', 'Dates'))).read()
    const r = resolveAnchor(null, doc, several)
    expect(r.state === 'attached' && doc.textBetween(r.from, r.to)).toBe('Plan')
    const firstGone = seeded(docJSON(para('b', 'Budget'), para('c', 'Dates'))).read().doc
    const r2 = resolveAnchor(null, firstGone, several)
    expect(r2.state === 'attached' && firstGone.textBetween(r2.from, r2.to)).toBe('Dates')
    const allGone = seeded(docJSON(para('b', 'Budget'))).read().doc
    expect(resolveAnchor(null, allGone, several)).toEqual({ state: 'detached', reason: 'deleted', quote: 'Plan\nDates' })
    // Before the doc has synced, a block it hasn't got yet is no news: pending.
    expect(resolveAnchor(null, allGone, several, { synced: false })).toEqual({ state: 'pending' })
    // Where they are may be found once for every anchor and handed in.
    const blocks = blockRanges(firstGone, ['a', 'c'])
    expect(resolveAnchor(null, firstGone, several, { blocks })).toEqual(r2)
  })
})

describe('in a bound editor', () => {
  it('reads the binding from the editor and anchors through it', () => {
    const ydoc = new Y.Doc()
    prosemirrorJSONToYXmlFragment(schema, docJSON(p(t('We ship on Thursday.'))), ydoc.getXmlFragment('default'))
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ schema, plugins: [ySyncPlugin(ydoc.getXmlFragment('default'))] }),
    })
    try {
      const b = bindingOf(view.state)
      expect(b).not.toBeNull()
      const doc = view.state.doc
      expect(doc.textContent).toBe('We ship on Thursday.')
      const { from, to } = rangeOf(doc, 'ship on Thursday')
      const anchor = anchorFor(b!, doc, from, to)
      // The editor types before the anchor, as a person would.
      view.dispatch(view.state.tr.insertText('So: ', 1))
      const r = resolveAnchor(bindingOf(view.state), view.state.doc, anchor)
      expect(r.state === 'attached' && view.state.doc.textBetween(r.from, r.to)).toBe('ship on Thursday')
    } finally {
      view.destroy()
    }
    expect(bindingOf(EditorState.create({ schema }))).toBeNull()
  })
})
