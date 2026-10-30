import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }))

import { startImport, type ContentIOCapabilities } from './contentIO'

// A file of up to 8 bytes goes with the request; a longer one by a presigned upload.
const CAPS: ContentIOCapabilities = { export: true, export_formats: ['md'], import_extensions: ['.md'], max_import_bytes: 100 << 20, max_direct_bytes: 8 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const keyOf = (call: unknown[]) => (call[2] as { headers?: Record<string, string> } | undefined)?.headers?.['Idempotency-Key']

describe('starting an import (W3)', () => {
  beforeEach(() => post.mockReset())
  afterEach(() => vi.unstubAllGlobals())

  it('sends each file with a key of its own, so the server imports a resend of it once', async () => {
    post.mockResolvedValue({ data: { job: { id: 'j-1' } } })
    await startImport(new File(['# Plan'], 'plan.md'), '', CAPS)
    await startImport(new File(['# Plan'], 'plan.md'), '', CAPS)
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/doc/import', '/doc/import'])
    const [first, second] = post.mock.calls.map(keyOf)
    expect(first).toMatch(UUID)
    expect(second).toMatch(UUID)
    expect(second).not.toBe(first)
    // Its errors stay the dialog's to say.
    expect(post.mock.calls[0][2]).toMatchObject({ suppressErrorToast: true })
  })

  it("sends the key with a large file's presign, where its job is made", async () => {
    post
      .mockResolvedValueOnce({ data: { job: { id: 'j-2', status: 'uploading' }, upload: { url: 'https://store.example.test/put', method: 'PUT' } } })
      .mockResolvedValueOnce({ data: { job: { id: 'j-2', status: 'queued' } } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    const job = await startImport(new File(['# A longer plan'], 'plan.md'), '', CAPS)
    expect(post.mock.calls[0][0]).toBe('/doc/import/presign')
    expect(keyOf(post.mock.calls[0])).toMatch(UUID)
    expect(job.status).toBe('queued')
  })
})
