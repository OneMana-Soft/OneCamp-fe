import { describe, expect, it } from 'vitest'
import {
  actionsFor,
  blocksFor,
  dialogFor,
  panelFor,
  registerAction,
  registerBlock,
  registerDialog,
  registerPanel,
  registerSlot,
  slotFor,
} from './registry'
import type { SurfaceAction } from './types'

const both = { ai: false }
const ai = { ai: true }

describe('the doc registry', () => {
  it('starts empty: day 0 registers nothing', () => {
    expect(blocksFor('doc', ai)).toEqual([])
    expect(actionsFor('more', ai)).toEqual([])
    expect(slotFor('crumbs', ai)).toEqual([])
  })

  it('gives each editor its blocks, and the AI-free build no AI ones', () => {
    registerBlock({ id: 't-para', editors: ['doc', 'guest', 'chat'], edition: 'both', schema: [] })
    registerBlock({ id: 't-chart', editors: ['doc', 'guest'], edition: 'both', schema: [] })
    registerBlock({ id: 't-ask', editors: ['doc'], edition: 'ai', schema: [] })
    expect(blocksFor('chat', ai).map((b) => b.id)).toEqual(['t-para'])
    expect(blocksFor('doc', both).map((b) => b.id)).toEqual(['t-para', 't-chart'])
    expect(blocksFor('doc', ai).map((b) => b.id)).toEqual(['t-para', 't-chart', 't-ask'])
  })

  it('shows an action on every surface it lists, and only there', () => {
    const action = (id: string, surfaces: SurfaceAction['surfaces'], edition: 'both' | 'ai' = 'both'): SurfaceAction =>
      ({ id, label: id, group: 'g', surfaces, edition, run: () => {} })
    registerAction(action('t-dup', ['blockMenu', 'phoneSheet']))
    registerAction(action('t-ask-ai', ['selection', 'blockMenu'], 'ai'))
    expect(actionsFor('blockMenu', ai).map((a) => a.id)).toEqual(['t-dup', 't-ask-ai'])
    expect(actionsFor('blockMenu', both).map((a) => a.id)).toEqual(['t-dup'])
    expect(actionsFor('more', ai)).toEqual([])
  })

  it('refuses a second registration under one id', () => {
    registerBlock({ id: 't-once', editors: ['doc'], edition: 'both', schema: [] })
    expect(() => registerBlock({ id: 't-once', editors: ['doc'], edition: 'both', schema: [] })).toThrow(/twice/)
    const load = async () => ({ default: () => null })
    registerPanel({ kind: 't-outline', title: 'Outline', edition: 'both', load })
    expect(() => registerPanel({ kind: 't-outline', title: 'Outline', edition: 'both', load })).toThrow(/twice/)
  })

  it('keeps AI panels and dialogs out of the AI-free build', () => {
    const load = async () => ({ default: () => null })
    registerPanel({ kind: 't-ai', title: 'Ask AI', edition: 'ai', load })
    registerDialog({ id: 't-ai-dialog', edition: 'ai', load })
    expect(panelFor('t-ai', both)).toBeUndefined()
    expect(panelFor('t-ai', ai)?.kind).toBe('t-ai')
    expect(dialogFor('t-ai-dialog', both)).toBeUndefined()
  })

  it("orders a slot's contributions by order, then by registration", () => {
    registerSlot({ slot: 'titleChips', id: 't-b', edition: 'both' })
    registerSlot({ slot: 'titleChips', id: 't-a', edition: 'both', order: -1 })
    registerSlot({ slot: 'titleChips', id: 't-c', edition: 'both' })
    expect(slotFor('titleChips', ai).map((c) => c.id)).toEqual(['t-a', 't-b', 't-c'])
  })
})
