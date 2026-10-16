// The registry contract that packages merged before A1 build on (PROGRAM.md §9,
// D-14). A8's anchor decorations and A9's proposals register here before A1
// rebuilds the doc hosts to read the registry. If A1's refactor dropped or
// renamed a reader, they would quietly stop being read. So this test calls every
// day-0 register function and reader through the registry's PUBLIC entry, with
// a stub contribution of each kind. Changing it is a decision for the
// integrator to review, not a side effect of a refactor.

import { describe, expect, it } from 'vitest'
import * as registry from '@/components/docEditor/registry'

const READERS_AND_REGISTRARS = [
  'registerBlock',
  'registerAction',
  'registerPanel',
  'registerDialog',
  'registerSlot',
  'blocksFor',
  'actionsFor',
  'panelFor',
  'dialogFor',
  'slotFor',
] as const

describe('the doc registry contract (D-14)', () => {
  it('keeps every register function and reader on the public entry', () => {
    for (const name of READERS_AND_REGISTRARS) {
      expect(typeof (registry as Record<string, unknown>)[name], name).toBe('function')
    }
  })

  it('reads back a stub contribution of every kind', () => {
    const load = async () => ({ default: () => null })
    registry.registerBlock({ id: 'contract-block', editors: ['doc', 'guest'], edition: 'both', schema: [{ kind: 'node', name: 'contractBlock', attrs: [] }] })
    registry.registerAction({ id: 'contract-action', label: 'Contract', group: 'g', surfaces: ['blockMenu'], edition: 'both', run: () => {} })
    registry.registerPanel({ kind: 'contract-panel', title: 'Contract', edition: 'both', load })
    registry.registerDialog({ id: 'contract-dialog', edition: 'both', load })
    registry.registerSlot({ slot: 'gutter', id: 'contract-slot', edition: 'both', load })

    const aiFree = { ai: false }
    expect(registry.blocksFor('doc', aiFree).map((b) => b.id)).toContain('contract-block')
    // The guest viewer reads the same blocks as the doc editor (I4).
    expect(registry.blocksFor('guest', aiFree).map((b) => b.id)).toContain('contract-block')
    expect(registry.actionsFor('blockMenu', aiFree).map((a) => a.id)).toContain('contract-action')
    expect(registry.panelFor('contract-panel', aiFree)?.kind).toBe('contract-panel')
    expect(registry.dialogFor('contract-dialog', aiFree)?.id).toBe('contract-dialog')
    expect(registry.slotFor('gutter', aiFree).map((c) => c.id)).toContain('contract-slot')
  })
})
