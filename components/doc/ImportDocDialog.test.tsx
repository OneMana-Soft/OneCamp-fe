import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ContentIOJob } from '@/lib/export/contentIO'

const startImport = vi.fn()
const getJob = vi.fn()
vi.mock('@/lib/export/contentIO', async (original) => ({
  ...(await original<typeof import('@/lib/export/contentIO')>()),
  loadCapabilities: async () => ({ export: true, export_formats: [], import_extensions: ['.md', '.zip'], max_import_bytes: 1000, max_direct_bytes: 500 }),
  startImport: (...a: unknown[]) => startImport(...a),
  getJob: (...a: unknown[]) => getJob(...a),
}))

import ImportDocDialog from './ImportDocDialog'

afterEach(() => {
  cleanup()
  startImport.mockReset()
  getJob.mockReset()
})

const job = (patch: Partial<ContentIOJob>): ContentIOJob => ({ id: 'job-1', kind: 'import', format: 'md', status: 'queued', progress: 0, created_at: '2026-10-12T00:00:00Z', ...patch })

describe('importing files as docs', () => {
  it('imports a file inside this doc and links the docs it made', async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: 'done', progress: 100, created: [{ kind: 'doc', uuid: 'd-1', title: 'Plan' }] }))
    render(<ImportDocDialog docId="parent-1" onClose={() => {}} />)
    const input = document.querySelector<HTMLInputElement>('[data-import-input]')!
    fireEvent.change(input, { target: { files: [new File(['# Plan'], 'plan.md', { type: 'text/markdown' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    await waitFor(() => expect(startImport).toHaveBeenCalled())
    expect(startImport.mock.calls[0][0].name).toBe('plan.md')
    expect(startImport.mock.calls[0][1]).toBe('parent-1')
    const link = await screen.findByRole('link', { name: 'Plan' }, { timeout: 4000 })
    expect(link.getAttribute('href')).toBe('/app/doc/d-1')
  })

  it('says why an import failed, and lists an empty doc it could not take away', async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(
      job({
        status: 'failed',
        error: 'Nothing could be imported: the document service could not take the content.',
        created: [{ kind: 'doc', uuid: 'd-2', title: 'Notes' }],
        skipped: [{ what: 'notes.md', why: 'its content could not be written, so its doc is empty' }],
      }),
    )
    render(<ImportDocDialog docId="" onClose={() => {}} />)
    const input = document.querySelector<HTMLInputElement>('[data-import-input]')!
    fireEvent.change(input, { target: { files: [new File(['# Notes'], 'notes.md', { type: 'text/markdown' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(await screen.findByText(/Nothing could be imported/, undefined, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Notes' }).getAttribute('href')).toBe('/app/doc/d-2')
    expect(screen.getByText(/its doc is empty/)).toBeTruthy()
  })

  // Docs programme C4: another tool's export is a zip like any other here.
  it("says another tool's export keeps its tree", () => {
    render(<ImportDocDialog docId="" onClose={() => {}} />)
    expect(screen.getByText(/A zip exported from Notion, Confluence or Google Takeout keeps its pages in their tree\./)).toBeTruthy()
  })

  it('turns away a file it cannot read, or one too large, before anything is sent', async () => {
    render(<ImportDocDialog docId="" onClose={() => {}} />)
    const input = document.querySelector<HTMLInputElement>('[data-import-input]')!
    await waitFor(() => expect(input.accept).toBe('.md,.zip'))
    fireEvent.change(input, { target: { files: [new File(['x'], 'sheet.xlsx'), new File(['x'.repeat(2000)], 'big.md')] } })
    expect(await screen.findByText(/can't be imported/)).toBeTruthy()
    expect(screen.getByText(/Larger than/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true)
    expect(startImport).not.toHaveBeenCalled()
  })
})
