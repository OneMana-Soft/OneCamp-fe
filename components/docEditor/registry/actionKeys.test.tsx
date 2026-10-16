import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

vi.mock('@/components/docEditor/docLink', () => ({ copyDocLink: vi.fn(async () => true), docLink: (id: string) => `/app/doc/${id}` }))

import '@/components/docEditor/registry'
import { copyDocLink } from '@/components/docEditor/docLink'
import { chordMatches, useActionKeys } from './actionKeys'
import { createDocCommandBus } from './commandBus'
import type { ActionContext } from './types'

// The page's keys come from the actions that name one, with docPageKeys.ts's
// rules: only the focused doc answers, and a key that types a character works
// only outside the text.

afterEach(() => {
  cleanup()
  vi.mocked(copyDocLink).mockClear()
})

const key = (init: KeyboardEventInit, target: EventTarget = document.activeElement ?? document.body) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(e)
  })
  return e
}

function Page({ docId, asked }: { docId: string; asked: string[] }) {
  const root = React.useRef<HTMLDivElement>(null)
  const bus = React.useMemo(() => {
    const b = createDocCommandBus(docId)
    b.on('toggle', ({ what }) => asked.push(`${docId}:${what}`))
    return b
  }, [docId, asked])
  const context = (): ActionContext => ({ docId, editor: null, canEdit: true, bus, gate: { ai: false } })
  useActionKeys(root, context, { ai: false })
  return (
    <div ref={root} data-doc-view="">
      <button type="button" data-in={docId}>
        x
      </button>
      <textarea data-text={docId} />
    </div>
  )
}

describe('chords', () => {
  it('read Mod as ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(chordMatches({ key: 'l', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, 'Mod-l', true)).toBe(true)
    expect(chordMatches({ key: 'l', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }, 'Mod-l', false)).toBe(true)
    expect(chordMatches({ key: 'l', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }, 'Mod-l', true)).toBe(false)
    expect(chordMatches({ key: 'F', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, 'Shift-f', true)).toBe(true)
    expect(chordMatches({ key: 'f', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, 'Shift-f', true)).toBe(false)
    expect(chordMatches({ key: '?', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }, '?', true)).toBe(true)
  })
})

describe("the doc page's keys", () => {
  it('run the action, for the doc that has focus only', () => {
    const asked: string[] = []
    render(
      <>
        <Page docId="left" asked={asked} />
        <Page docId="right" asked={asked} />
      </>,
    )
    const right = document.querySelector<HTMLElement>('[data-in="right"]')!
    right.focus()
    key({ key: '?', shiftKey: true })
    key({ key: 'F', shiftKey: true })
    expect(asked).toEqual(['right:shortcuts', 'right:focusMode'])
    const e = key({ key: 'l', ctrlKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(copyDocLink).toHaveBeenCalledWith('right')
  })

  it('leave a typed "?" to the text, but take ⌘L there too', () => {
    const asked: string[] = []
    render(<Page docId="solo" asked={asked} />)
    const text = document.querySelector<HTMLElement>('[data-text="solo"]')!
    text.focus()
    expect(key({ key: '?', shiftKey: true }).defaultPrevented).toBe(false)
    expect(asked).toEqual([])
    key({ key: 'l', ctrlKey: true })
    expect(copyDocLink).toHaveBeenCalledWith('solo')
  })
})
