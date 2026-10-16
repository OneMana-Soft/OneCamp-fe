import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import '@/components/docEditor/registry'
import { registerBlock } from './registry'
import { blocksReady, extensionsFor, loadBlocks, pendingBlocks, useBlocksReady } from './factory'
import { bareContext } from './manifest'

// A doc's own blocks load when its editor is first built, and an editor is
// never built before they have: y-prosemirror deletes from the shared doc
// whatever its editor's schema can't hold. The composer never waits on them.

describe('blocks that load lazily', () => {
  it("hold a doc's editor back until they are here, and never the composer's", { timeout: 30_000 }, async () => {
    expect(blocksReady('chat', { ai: true })).toBe(true)
    expect(blocksReady('doc', { ai: true })).toBe(false)
    expect(pendingBlocks('doc', { ai: true }).map((s) => s.id)).toEqual(expect.arrayContaining(['callout', 'taskList', 'docKeymap', 'clipboard-markdown']))
    expect(() => extensionsFor(bareContext('doc'))).toThrow(/hasn't loaded yet/)
    const { result } = renderHook(() => useBlocksReady('doc', { ai: true }))
    expect(result.current).toBe(false)
    await waitFor(() => expect(result.current).toBe(true), { timeout: 15_000 })
    expect(extensionsFor(bareContext('doc')).map((e) => e.name)).toEqual(expect.arrayContaining(['callout', 'taskList', 'taskItem']))
  })

  it('asks again for a chunk that failed to load', async () => {
    let tries = 0
    registerBlock({
      id: 'test.flaky',
      editors: ['task'],
      edition: 'both',
      schema: [],
      load: async () => {
        tries++
        if (tries === 1) throw new Error('chunk failed')
        return []
      },
    })
    await expect(loadBlocks('task', { ai: true })).rejects.toThrow('chunk failed')
    expect(blocksReady('task', { ai: true })).toBe(false)
    await loadBlocks('task', { ai: true })
    expect(blocksReady('task', { ai: true })).toBe(true)
    expect(tries).toBe(2)
  })
})
