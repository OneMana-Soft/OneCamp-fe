import { afterEach, describe, expect, it, vi } from 'vitest'
import { OWN_ERRORS } from '@/lib/axiosInstance'

const post = vi.fn()
const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }))

import { pinTestClock } from '@/lib/testing/testClock'
import { BOARD_UNREAD, downloadAddress, exportMeta, leftOut, startWorkspaceExport, type WorkspaceExport } from './workspaceExport'

const base: WorkspaceExport = { id: 'x1', kind: 'export', format: 'workspace-md', status: 'done', progress: 100, created_at: '2026-10-14T04:00:00Z', exported: 1 }

afterEach(() => {
  post.mockReset()
  get.mockReset()
})

// Today is TEST_TODAY (15 Oct 2026, 12:00 UTC); the exports here were made the day before.
pinTestClock()

describe('a workspace export', () => {
  it('is the one still being made when it is started twice', async () => {
    const running = { ...base, status: 'running' }
    post.mockRejectedValueOnce({ response: { status: 409, data: { export: running, msg: 'An export you started is still being made.' } } })
    await expect(startWorkspaceExport()).resolves.toEqual(running)
    post.mockRejectedValueOnce({ response: { status: 403, data: { msg: 'Only an admin can export the workspace.' } } })
    await expect(startWorkspaceExport()).rejects.toBeTruthy()
  })

  it('downloads from the address the server gives now', async () => {
    get.mockResolvedValueOnce({ data: { export: base, download_url: 'https://files.example.test/z.zip' } })
    await expect(downloadAddress('x1')).resolves.toBe('https://files.example.test/z.zip')
    expect(get).toHaveBeenCalledWith('/admin/docs/exports/x1', OWN_ERRORS)
  })

  it('says how many docs it holds, once made', () => {
    expect(exportMeta(base)[1]).toBe('1 doc')
    expect(exportMeta({ ...base, exported: 1204 })[1]).toBe('1,204 docs')
    expect(exportMeta({ ...base, status: 'running' })).toHaveLength(1)
  })

  it('says what it left out: the private docs in one line, the unreadable by title', () => {
    expect(
      leftOut({
        ...base,
        skipped: [
          { what: '3 private docs', why: "their owners haven't let them into workspace exports" },
          ...['A', 'B', 'C', 'D', 'E'].map((t) => ({ what: t, why: 'it could not be read' })),
        ],
      }),
    ).toEqual([
      "3 private docs left out: their owners haven't let them into workspace exports.",
      "Couldn't be read, so not in it: ‘A’, ‘B’, ‘C’ and 2 others.",
    ])
    expect(leftOut(base)).toEqual([])
  })

  it('counts its boards apart from its docs, once made, and none when it holds none (miro-36)', () => {
    expect(exportMeta({ ...base, exported: 12, exported_boards: 3 }).slice(1)).toEqual(['12 docs', '3 boards'])
    expect(exportMeta({ ...base, exported: 12, exported_boards: 1 }).slice(1)).toEqual(['12 docs', '1 board'])
    expect(exportMeta({ ...base, exported: 12 }).slice(1)).toEqual(['12 docs'])
  })

  it('says which boards it left out: the private ones in one line, the unreadable by title apart from the docs, and pictures past a file', () => {
    expect(
      leftOut({
        ...base,
        skipped: [
          { what: '2 private boards', why: "they aren't shared with you" },
          { what: 'Q3 plan', why: 'it could not be read' },
          ...['Retro', 'Roadmap', 'Kickoff', 'Moodboard'].map((t) => ({ what: t, why: BOARD_UNREAD })),
          { what: '1 picture on the board ‘Moodboard’', why: "a board's file holds up to 50 MB of pictures" },
        ],
      }),
    ).toEqual([
      "2 private boards left out: they aren't shared with you.",
      "1 picture on the board ‘Moodboard’ left out: a board's file holds up to 50 MB of pictures.",
      "Couldn't be read, so not in it: ‘Q3 plan’.",
      "Boards that couldn't be read, so not in it: ‘Retro’, ‘Roadmap’, ‘Kickoff’ and 1 other.",
    ])
  })
})
