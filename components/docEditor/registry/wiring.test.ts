// The integrator's wiring (docs programme, PROGRAM.md §3.6). A package's
// contribution reaches the app only through the registry's entry (index.ts),
// and a slot draws only where a host renders it. Each package's own tests
// import its register module directly, so they pass with the wiring missing;
// this test holds it. Add a row when a package's wiring adds a line or a slot.

import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

import { slotFor } from '@/components/docEditor/registry'

describe("the integrator's wiring", () => {
  const aiFree = { ai: false }

  it("loads A6's contributions through the registry's entry", () => {
    expect(slotFor('more', aiFree).map((c) => c.id)).toContain('follow')
    expect(slotFor('session', aiFree).map((c) => c.id)).toContain('doc-meta-events')
  })

  // Without it, an open tab never applies a rename, a delete or an access
  // change made elsewhere (A6's live meta events).
  it('has the doc page draw the session slot, once', () => {
    const view = readFileSync('components/views/DocView.tsx', 'utf8')
    expect(view.match(/<SlotOutlet slot="session"/g) ?? []).toHaveLength(1)
  })
})
