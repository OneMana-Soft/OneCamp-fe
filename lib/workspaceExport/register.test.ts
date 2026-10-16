import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext, DocCommandBus } from '@/components/docEditor/registry/types'

const post = vi.fn()
const get = vi.fn()
vi.mock('@/lib/axiosInstance', () => ({ default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) }, OWN_ERRORS: {} }))
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ toast: (...a: unknown[]) => toast(...a) }))

import './register'
import { actionGroupsFor } from '@/components/docEditor/registry/readers'
import { slotFor } from '@/components/docEditor/registry/registry'
import { forgetConsents, knownConsent, loadConsent, toggleConsent } from './consent'
import { MAX_ENTRIES } from '@/lib/swrCache'

const bus = { docId: 'doc-1', emit: () => {}, on: () => () => {} } as unknown as DocCommandBus
const ctx: ActionContext = { docId: 'doc-1', editor: null, canEdit: true, bus }
const shown = (surface: 'more' | 'phoneSheet') =>
  actionGroupsFor(surface, ctx).flatMap((g) => g.actions).filter((a) => a.action.id === 'doc.exportConsent')

afterEach(() => {
  forgetConsents()
  post.mockReset()
  get.mockReset()
  toast.mockReset()
})

// ai-search-io.md P2-4: a private doc's owner lets it into the admins'
// workspace exports from the doc's More menu, or the phone's sheet.
describe("the owner's switch for workspace exports", () => {
  it('shows only to the owner of a private doc, once its state is read', async () => {
    expect(shown('more')).toHaveLength(0)
    get.mockResolvedValueOnce({ data: { consent: { allowed: false, owner: true, private: true } } })
    await loadConsent('doc-1')
    expect(get).toHaveBeenCalledWith('/doc/exportConsent', expect.objectContaining({ params: { doc_uuid: 'doc-1' } }))
    const [item] = shown('more')
    expect(item?.label).toBe('Include in workspace exports')
    expect(item?.checked).toBe(false)
    expect(shown('phoneSheet')).toHaveLength(1)

    for (const consent of [{ allowed: false, owner: false, private: true }, { allowed: false, owner: true, private: false }]) {
      forgetConsents()
      get.mockResolvedValueOnce({ data: { consent } })
      await loadConsent('doc-1')
      expect(shown('more')).toHaveLength(0)
    }
  })

  it('lets the doc in or takes it out, and says so', async () => {
    get.mockResolvedValueOnce({ data: { consent: { allowed: false, owner: true, private: true } } })
    await loadConsent('doc-1')
    post.mockResolvedValueOnce({ data: { consent: { allowed: true, owner: true, private: true } } })
    await shown('more')[0].run()
    expect(post).toHaveBeenCalledWith('/doc/exportConsent', { doc_uuid: 'doc-1', allow: true }, {})
    expect(knownConsent('doc-1')?.allowed).toBe(true)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Admins' workspace exports now include this doc" }))
    expect(shown('more')[0].checked).toBe(true)

    post.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only the doc's owner can change this." } } })
    await toggleConsent('doc-1')
    expect(knownConsent('doc-1')?.allowed).toBe(true)
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn't change that", description: "Only the doc's owner can change this.", variant: 'destructive' }))
  })

  it('reads a doc once at a time, and keeps nothing it could not read', async () => {
    let answer!: (v: unknown) => void
    get.mockReturnValueOnce(new Promise((r) => (answer = r)))
    const a = loadConsent('doc-1')
    const b = loadConsent('doc-1')
    answer({ data: { consent: { allowed: true, owner: true, private: true } } })
    await Promise.all([a, b])
    expect(get).toHaveBeenCalledTimes(1)

    forgetConsents()
    get.mockRejectedValueOnce(new Error('offline'))
    await loadConsent('doc-1')
    expect(knownConsent('doc-1')).toBeUndefined()
  })

  it('keeps what it heard for the most recently opened docs only', async () => {
    get.mockResolvedValue({ data: { consent: { allowed: false, owner: true, private: true } } })
    for (let i = 0; i <= MAX_ENTRIES; i++) await loadConsent(`doc-${i}`)
    expect(knownConsent('doc-0')).toBeUndefined()
    expect(knownConsent(`doc-${MAX_ENTRIES}`)).toBeDefined()
  })

  it('reads the state as each doc opens, through the session slot', () => {
    expect(slotFor('session', { ai: false }).map((s) => s.id)).toContain('doc-export-consent')
  })
})
