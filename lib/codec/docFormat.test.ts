import { describe, expect, it } from 'vitest'
import { BLOCK_COLOUR_NODES, DOC_COLOURS } from '@/lib/docColours'
import { BlockColor } from '@/components/minimal-tiptap/extensions/block-color/blockColor'
import { blockColourValue, calloutIcon, colourName, DOC_FORMAT_ATTRS, highlightColour } from './docFormat'
import { canonicalJSON, CNode } from './doc'
import { normalize } from './normalize'
import { toHTML } from './html'

// B2's rules (docFormat.ts), as the Go codec's doc_format_test.go holds them:
// old toggles and colours move over losslessly, and colours are names.

const line = (text: string): CNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })

describe("the codec's colours", () => {
  it("are lib/docColours', on the blocks the editor colours", () => {
    expect(DOC_COLOURS).toHaveLength(7)
    expect([...DOC_FORMAT_ATTRS[0].on]).toEqual(BLOCK_COLOUR_NODES)
    expect(BlockColor.name).toBe(DOC_FORMAT_ATTRS[0].name)
  })

  it('are names: an old CSS variable reads as its name, any other colour as none', () => {
    const cases: Record<string, string> = {
      sky: 'sky',
      'var(--camp-sky-ink)': 'sky',
      ' VAR(--camp-berry-ink) ': 'berry',
      GRAY: 'gray',
      '#ff0000': '',
      red: '',
      'var(--camp-red-ink)': '',
      skyblue: '',
      'var(--camp-sky-tint)': '',
      '': '',
    }
    for (const [v, want] of Object.entries(cases)) expect(colourName(v), v).toBe(want)
    const blocks: Record<string, string> = {
      sky: 'sky',
      sky_background: 'sky_background',
      gray_background: 'gray_background',
      sky_: '',
      _background: '',
      sky_background_x: '',
      red_background: '',
      sky_text: '',
      Sky: '',
    }
    for (const [v, want] of Object.entries(blocks)) expect(blockColourValue(v), v).toBe(want)
    expect(highlightColour('berry')).toBe('berry')
    expect(highlightColour('#ff0')).toBe('sun')
    const icons: Record<string, string> = { rocket: 'rocket', 'triangle-alert': 'triangle-alert', Rocket: '', '<svg>': '', 'a-b-c-d-e': '', '': '' }
    for (const [v, want] of Object.entries(icons)) expect(calloutIcon(v), v).toBe(want)
  })
})

describe('an old toggle', () => {
  it('has its title as its first line; one with no title (only its open) an empty one, so its blocks stay its blocks', () => {
    const doc: CNode = {
      type: 'doc',
      content: [
        { type: 'collapsible', attrs: { title: 'Plan & <dates>', open: false }, content: [line('Body.')] },
        { type: 'collapsible', attrs: { open: true }, content: [line('Still the body.')] },
        { type: 'collapsible', attrs: { blockColor: 'sun_background' }, content: [line('A summary.'), line('Folded.')] },
      ],
    }
    const once = normalize(doc)
    expect(toHTML(once)).toBe(
      '<div data-type="collapsible"><p>Plan &amp; &lt;dates&gt;</p><p>Body.</p></div>' +
        '<div data-type="collapsible"><p></p><p>Still the body.</p></div>' +
        '<div data-type="collapsible" data-block-color="sun_background"><p>A summary.</p><p>Folded.</p></div>',
    )
    // Moved over once: normalising again changes nothing.
    expect(canonicalJSON(normalize(once))).toBe(canonicalJSON(once))
    // Without the toggle in the schema, an old title is its first line, in bold.
    const plain = normalize(doc, { nodes: new Set(['doc', 'paragraph', 'text']), marks: new Set(['bold']) })
    expect(toHTML(plain).startsWith('<p><strong>Plan &amp; &lt;dates&gt;</strong></p><p>Body.</p>')).toBe(true)
  })
})
