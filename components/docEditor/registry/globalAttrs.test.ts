import { describe, expect, it } from 'vitest'
import { registerBlock } from './registry'
import { declaredSchema } from './manifest'

// A spec can add an attribute to other specs' nodes (BlockSpec.globalAttrs):
// B1's indent and text direction, B2's block colour. What the specs declare
// is held to the generated manifest (factory.test.ts), so the attribute must
// show on exactly the nodes the spec names.

const ALL = { ai: true }

describe('global attributes a spec declares', () => {
  it('show on the nodes they name, in sorted order, in the editors that carry them', () => {
    registerBlock({ id: 'g-para', editors: ['doc', 'chat'], edition: 'both', schema: [{ kind: 'node', name: 'gPara', attrs: ['level'] }] })
    registerBlock({ id: 'g-img', editors: ['doc'], edition: 'both', schema: [{ kind: 'node', name: 'gImg', attrs: ['src'] }] })
    registerBlock({
      id: 'g-indent',
      editors: ['doc', 'chat'],
      edition: 'both',
      schema: [],
      globalAttrs: [{ name: 'indent', on: ['gPara', 'gImg', 'gNotThere'] }],
    })

    const doc = declaredSchema('doc', ALL)
    expect(doc.nodes.gPara.attrs).toEqual(['indent', 'level'])
    expect(doc.nodes.gImg.attrs).toEqual(['indent', 'src'])
    // A node no spec writes is not made up.
    expect(doc.nodes.gNotThere).toBeUndefined()
    // The composer carries the paragraph, not the image.
    const chat = declaredSchema('chat', ALL)
    expect(chat.nodes.gPara.attrs).toEqual(['indent', 'level'])
    expect(chat.nodes.gImg).toBeUndefined()
  })

  it('finds a node whose spec registered after it', () => {
    registerBlock({ id: 'g-dir', editors: ['task'], edition: 'both', schema: [], globalAttrs: [{ name: 'dir', on: ['gLate'] }] })
    registerBlock({ id: 'g-late', editors: ['task'], edition: 'both', schema: [{ kind: 'node', name: 'gLate', attrs: [] }] })
    expect(declaredSchema('task', ALL).nodes.gLate.attrs).toEqual(['dir'])
  })

  it('refuses one attribute put on one node by two specs, naming both', () => {
    registerBlock({ id: 'g-quote', editors: ['guest'], edition: 'both', schema: [{ kind: 'node', name: 'gQuote', attrs: [] }] })
    registerBlock({ id: 'g-colour-a', editors: ['guest'], edition: 'both', schema: [], globalAttrs: [{ name: 'colour', on: ['gQuote'] }] })
    registerBlock({ id: 'g-colour-b', editors: ['guest'], edition: 'both', schema: [], globalAttrs: [{ name: 'colour', on: ['gQuote'] }] })
    expect(() => declaredSchema('guest', ALL)).toThrow(/"colour" on "gQuote" is named by both "g-colour-a" and "g-colour-b"/)
  })
})
