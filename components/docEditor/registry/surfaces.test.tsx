import * as React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

import '@/components/docEditor/registry'
// C5's actions register as its overlay's chunk loads beside the editor (suggest-mode/contributions.ts).
import '@/components/minimal-tiptap/extensions/suggest-mode/contributions'
import { actionById, registerAction, registerSlot, actionsFor, slotFor } from './registry'
import { loadBlocks } from './factory'
import { actionGroupsFor, slashItemsFor, turnIntoFor } from './readers'
import { createDocCommandBus } from './commandBus'
import { SlotOutlet } from './slots'
import { collaboratorCaret } from './presence'
import { shortcutDialogGroups, shortcutRowsFor } from './shortcuts'
import { MORE_GROUPS, SHEET_GROUPS } from '@/components/docEditor/actions/doc'
import { SHORTCUT_GROUPS } from '@/components/docEditor/shortcuts'
import { CHAT_COMMANDS, slashCommandSuggestion } from '@/components/minimal-tiptap/extensions/slash-command/slashCommand'
import type { ActionContext, DocShellState, ShellSlot, Surface } from './types'

// The same actions on every surface (PROGRAM.md §4 #2): each written once,
// shown where it lists itself, in the groups the surface orders, behind the
// AI gate where it says so; and what the registry's menus hold is what the
// hand-written ones held (the hosts read these once A0 has merged).

// A7's export items ask the API what this member may export; not here.
vi.mock('@/lib/export/contentIOCapabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/export/contentIOCapabilities')>()),
  knownCapabilities: () => null,
  loadCapabilities: async () => null,
}))

afterEach(cleanup)

const AI = { ai: true }
const NO_AI = { ai: false }
// Doc AI (B9, components/ai) registers only in the AI edition's build; the
// AI-free one has none of it, and these expectations hold in both.
const DOC_AI = !!actionById('aiBar.open', AI)
const docAi = <T,>(...items: T[]): T[] => (DOC_AI ? items : [])

/** An editor as far as the actions ask it: nothing active, some text selected, nothing to undo. */
const EDITOR = { isActive: () => false, can: () => ({ undo: () => false, redo: () => false }), state: { selection: { empty: false } } } as unknown as ActionContext['editor']

function ctx(state: DocShellState = {}, more: Partial<ActionContext> = {}): ActionContext {
  return { docId: 'doc-1', editor: EDITOR, canEdit: true, bus: createDocCommandBus('doc-1'), gate: AI, state, ...more }
}

const shown = (surface: Surface, c: ActionContext, order: string[] = []) =>
  actionGroupsFor(surface, c, order).map((g) => [g.group, g.actions.map((a) => a.label)])

describe('the More menu, from the registry', () => {
  it("holds today's items, in their groups and order", () => {
    expect(shown('more', ctx({ desktop: true }), MORE_GROUPS)).toEqual([
      ['view', ['Save for later', 'Focus mode', 'Full width', 'Find in doc']],
      // B5's Save as template (components/docTemplates/register.ts); C5's
      // Suggestions (minimal-tiptap/extensions/suggest-mode/contributions.ts).
      ['doc', ['Version history', 'Viewed by', ...docAi('AI activity'), 'Suggestions', 'Save as template']],
      // A7's export and import (lib/export/register.ts).
      ['export', ['Export as Markdown', 'Export as HTML', 'Export as PDF', 'Export as Word']],
      ['import', ['Import files…']],
      ['share', ['Copy link']],
      ['help', ['Keyboard shortcuts']],
    ])
  })

  it("says what is on: Leave focus mode, Saved for later, Full width's check", () => {
    const groups = actionGroupsFor('more', ctx({ desktop: true, focusMode: true, saved: true, fullWidth: true }), MORE_GROUPS)
    const view = groups.find((g) => g.group === 'view')!.actions
    expect(view.map((a) => a.label)).toEqual(['Saved for later', 'Leave focus mode', 'Full width', 'Find in doc'])
    expect(view.map((a) => a.checked)).toEqual([true, undefined, true, undefined])
  })

  it("leaves out what a reader can't do, and Full width on a phone", () => {
    const reader = shown('more', ctx({ desktop: false }, { canEdit: false }), MORE_GROUPS)
    expect(reader.flatMap(([, labels]) => labels)).not.toContain('Version history')
    expect(reader.flatMap(([, labels]) => labels)).not.toContain('Full width')
  })

  it('asks the shell through the bus, for its own doc', () => {
    const c = ctx({ desktop: true })
    const asked: string[] = []
    c.bus.on('toggle', ({ what }) => asked.push(what))
    c.bus.on('openPanel', ({ kind }) => asked.push(`panel:${kind}`))
    c.bus.on('openDialog', ({ id }) => asked.push(`dialog:${id}`))
    for (const g of actionGroupsFor('more', c, MORE_GROUPS)) for (const a of g.actions) if (!/Export|Copy|Find/.test(a.label)) void a.run()
    expect(asked).toEqual(['saved', 'focusMode', 'fullWidth', 'dialog:doc.history', 'panel:viewers', ...docAi('dialog:ai.activity'), 'panel:suggestions', 'dialog:doc.saveAsTemplate', 'shortcuts'])
  })
})

describe("the phone's doc sheet", () => {
  // QA DSA-06 (14 Oct 2026): the sheet had no Export, Copy link, Save for
  // later, Notifications, Import or Focus mode, all of which More has. Delete
  // is the page chrome's (B6's doc.trash, chrome/contributions.ts), and its
  // test holds it alone and last on this sheet as on More.
  it('shows the same actions as More', () => {
    expect(shown('phoneSheet', ctx({ owner: true, canShare: true }), SHEET_GROUPS)).toEqual([
      // Suggest changes is the header's Editing/Suggesting switch, which a phone doesn't draw (C5).
      ['doc', ['Edit doc title', 'Share', 'Comments', 'Version history', 'Viewed by', ...docAi('Ask AI about this doc', 'AI activity'), 'Notifications', 'Suggestions', 'Suggest changes', 'Save as template']],
      // B3's find, for a phone with no ⌘F.
      ['view', ['Save for later', 'Focus mode', 'Find in doc']],
      ['export', ['Export as Markdown', 'Export as HTML', 'Export as PDF', 'Export as Word']],
      ['import', ['Import files…']],
      ['share', ['Copy link']],
    ])
    const versions = actionsFor('phoneSheet', AI).find((a) => a.label === 'Version history')
    expect(actionsFor('more', AI)).toContain(versions)
  })

  it("leaves rename to the doc's owner", () => {
    const labels = shown('phoneSheet', ctx({ owner: false }), SHEET_GROUPS).flatMap(([, l]) => l)
    expect(labels).not.toContain('Edit doc title')
  })

  // QA DSA-14: a reader was offered Share, and found every control disabled.
  it('offers Share only to someone who may share, as the header does, and Copy link to everyone', () => {
    const reader = shown('phoneSheet', ctx({ owner: false, canShare: false }, { canEdit: false }), SHEET_GROUPS).flatMap(([, l]) => l)
    expect(reader).not.toContain('Share')
    expect(reader).toContain('Copy link')
    expect(shown('phoneSheet', ctx({ owner: false, canShare: true }), SHEET_GROUPS).flatMap(([, l]) => l)).toContain('Share')
  })
})

describe('the selection bar and the phone bar', () => {
  it('put Ask AI first on the bar, behind the AI gate', () => {
    if (DOC_AI) expect(shown('selection', ctx(), ['ai', 'marks', 'comment'])[0]).toEqual(['ai', ['Ask AI']])
    expect(shown('selection', ctx({}, { gate: NO_AI }), ['ai', 'marks', 'comment']).map(([g]) => g)).not.toContain('ai')
    expect(shown('phoneBar', ctx({}, { gate: NO_AI }), []).flatMap(([, l]) => l)).not.toContain('Ask AI')
  })

  it('offer the marks the bar had, in its order', () => {
    const marks = actionGroupsFor('selection', ctx(), ['ai', 'marks', 'comment']).find((g) => g.group === 'marks')!
    expect(marks.actions.map((a) => a.label)).toEqual(['Bold', 'Italic', 'Underline', 'Strikethrough', 'Inline code'])
  })
})

describe('a package adding an action', () => {
  it('reaches every surface it lists with no host edited, after the built-in groups', () => {
    registerAction({ id: 'test.pkg', label: 'From a package', group: 'pkg', surfaces: ['more', 'phoneSheet'], edition: 'both', run: () => {} })
    // Delete comes from a package too (B6's doc.trash), and its group stays last.
    registerAction({ id: 'test.delete', label: 'Delete', group: 'delete', surfaces: ['phoneSheet'], edition: 'both', destructive: true, run: () => {} })
    expect(shown('more', ctx({ desktop: true }), MORE_GROUPS).at(-1)).toEqual(['pkg', ['From a package']])
    expect(shown('phoneSheet', ctx({ owner: true }), SHEET_GROUPS).map(([g]) => g)).toEqual(['doc', 'view', 'export', 'import', 'share', 'pkg', 'delete'])
  })

  it("can't take a menu down with it", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerAction({
      id: 'test.broken',
      label: 'Broken',
      group: 'pkg',
      surfaces: ['more'],
      edition: 'both',
      isEnabled: () => {
        throw new Error('broken package')
      },
      run: () => {},
    })
    expect(shown('more', ctx({ desktop: true }), MORE_GROUPS).flatMap(([, l]) => l)).not.toContain('Broken')
    error.mockRestore()
  })
})

describe('Turn into, from the block specs', () => {
  it("is the selection bar's list, in its order", () => {
    expect(turnIntoFor(AI).map((t) => [t.id, t.label])).toEqual([
      ['text', 'Text'],
      ['h1', 'Heading 1'],
      ['h2', 'Heading 2'],
      ['h3', 'Heading 3'],
      ['h4', 'Heading 4'],
      ['bullet', 'Bulleted list'],
      ['ordered', 'Numbered list'],
      ['todo', 'To-do list'],
      ['toggle', 'Toggle list'],
      ['quote', 'Quote'],
      ['code', 'Code'],
      ['callout', 'Callout'],
      ['toggleH1', 'Toggle heading 1'],
      ['toggleH2', 'Toggle heading 2'],
      ['toggleH3', 'Toggle heading 3'],
    ])
  })
})

describe('"/", from the block specs and actions', () => {
  const ids = (items: { id: string }[]) => items.map((i) => i.id)
  // As an editor reads it: once its blocks have loaded (a package's chunk may add entries).
  beforeAll(() => loadBlocks('doc', AI), 30_000)

  it("offers a doc its blocks, then the AI items, then formatting, in the menu's order", () => {
    expect(slashItemsFor('doc', AI).map((i) => `${i.section}:${i.id}`)).toEqual([
      'Basic:heading1', 'Basic:heading2', 'Basic:heading3', 'Basic:heading4', 'Basic:bulletList', 'Basic:orderedList', 'Basic:taskList',
      'Basic:blockquote', 'Basic:codeBlock', 'Basic:horizontalRule', 'Basic:callout',
      'Basic:collapsible', 'Basic:toggleHeading1', 'Basic:toggleHeading2', 'Basic:toggleHeading3',
      // C1's pages.
      'Basic:page', 'Basic:linkToPage',
      'Basic:simpleTable', 'Basic:toc',
      // B1's columns.
      'Basic:columns2', 'Basic:columns3', 'Basic:columns4',
      'Media and embeds:image',
      // B4's media and embeds.
      ...['video', 'audio', 'file', 'pdf', 'bookmark', 'embed'].map((m) => `Media and embeds:${m}`),
      'Media and embeds:table',
      // C1: a project's tasks and board.
      'Media and embeds:tasks', 'Media and embeds:board',
      ...docAi('AI:ai-write', 'AI:ai-summarize'),
      'Format:bold', 'Format:italic', 'Format:underline', 'Format:strikethrough', 'Format:inlineCode', 'Format:clearFormatting',
      // B3's equations and word count.
      'Advanced:blockMath', 'Advanced:inlineMath', 'Advanced:wordCount',
      // B2: a block's colour, as Notion lists colours last: "/red", "/sky background".
      ...['default', 'gray', 'sun', 'moss', 'lake', 'sky', 'dusk', 'berry'].map((c) => `Colour:colour.${c}`),
      ...['default', 'gray', 'sun', 'moss', 'lake', 'sky', 'dusk', 'berry'].map((c) => `Colour:colour.${c}_background`),
    ])
    const kbd = Object.fromEntries(slashItemsFor('doc', AI).filter((i) => i.kbd).map((i) => [i.id, i.kbd]))
    expect(kbd).toEqual({ heading1: ['#'], heading2: ['##'], heading3: ['###'], heading4: ['####'], bulletList: ['-'], orderedList: ['1.'], taskList: ['[]'], blockquote: ['>'], collapsible: ['>>'], codeBlock: ['```'], horizontalRule: ['---'] })
  })

  it("offers the composer and a task's description the formatting alone", () => {
    expect(ids(slashItemsFor('chat', AI))).toEqual(ids(CHAT_COMMANDS))
    expect(ids(slashItemsFor('task', AI))).toEqual(ids(CHAT_COMMANDS))
  })

  it('finds a block by what Notion calls it: /num, /div, /todo', () => {
    const first = (query: string) => slashCommandSuggestion.items({ query, commands: slashItemsFor('doc', AI) })[0]?.title
    expect(first('num')).toBe('Numbered list')
    expect(first('div')).toBe('Divider')
    expect(first('todo')).toBe('To-do list')
  })

  it('lists the AI items unfiltered in the AI edition, and never in the AI-free one', () => {
    const all = slashCommandSuggestion.items({ query: '', commands: slashItemsFor('doc', AI) })
    expect(all.filter((i) => i.section === 'AI').map((i) => i.id)).toEqual(docAi('ai-write', 'ai-summarize'))
    expect(slashItemsFor('doc', NO_AI).some((i) => i.section === 'AI')).toBe(false)
  })
})

describe('the shortcut table', () => {
  it("makes the dialog: each group's rows, in order", () => {
    const rows = Object.fromEntries(shortcutDialogGroups(shortcutRowsFor('doc', AI)).map((g) => [g.title, g.rows.map((r) => r.label)]))
    expect(rows).toEqual({
      Text: ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Inline code', 'Link, with text selected', 'Inline equation', 'Clear formatting', 'Last colour used', 'Highlight'],
      Blocks: [
        'Insert a block', 'Text', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Bulleted list', 'Numbered list', 'Lettered or roman list', 'To-do list', 'Toggle list',
        'Quote', 'Code block', 'Block equation', 'Divider', 'Check a to-do, open a toggle', 'Make a to-do a task', 'Next or previous cell',
        'Open the selected page or task', 'Open or close every toggle', 'Nest or un-nest a list item',
        'Duplicate the block', 'Select the block, then everything', 'Select the block', 'With blocks selected, select more',
        'With blocks selected, delete them', 'Move the block up or down', 'Block menu', 'Copy link to the block',
      ],
      Doc: [
        'Formatting bar', ...docAi('Ask AI', 'Ask AI about this doc'), "Copy the doc's link", 'Comment on the selection', 'Save for later', 'Search', 'Light or dark', 'Focus mode',
        'Find in the doc', 'Replace, while finding', 'Undo', 'Redo', 'Line break', 'Mention someone', 'Link a page', 'Leave the text', 'These shortcuts',
      ],
    })
    expect(SHORTCUT_GROUPS).toEqual(shortcutDialogGroups(shortcutRowsFor('doc', NO_AI)))
  })

  it("lists a block's keys only in the editors that carry the block", () => {
    expect(shortcutRowsFor('chat', AI).map((r) => r.label)).not.toContain('To-do list')
  })
})

describe('shell slots', () => {
  // Each test draws a slot no package fills yet. A slot's own contributions
  // draw beside a test's, each from a chunk of its own: in a full parallel
  // run the overlay's seven compiling took findBy past its 1 s. A slot that
  // gains one fails here by name; move the test to a slot that hasn't.
  const nothingIn = (slot: ShellSlot) => expect(slotFor(slot, AI).map((c) => c.id), `${slot} has contributions of its own now`).toEqual([])

  it("draws a package's contribution where its slot is, given the doc and the editor", async () => {
    nothingIn('rightCluster')
    registerSlot({
      slot: 'rightCluster',
      id: 'test.part',
      edition: 'both',
      load: async () => ({ default: ({ docId, editor }) => <p>overlay for {docId}, editor {editor === null ? 'not yet' : 'here'}</p> }),
    })
    render(<SlotOutlet slot="rightCluster" gate={NO_AI} docId="doc-9" editor={null} />)
    expect(await screen.findByText('overlay for doc-9, editor not yet')).toBeTruthy()
  })

  it('keeps a broken contribution inside its slot, and an AI one out of the AI-free edition', async () => {
    // A slot only this test fills (C5's Editing or Suggesting took 'modes'),
    // so no package can ever crowd it.
    const slot = 'testOnly' as ShellSlot
    nothingIn(slot)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerSlot({
      slot,
      id: 'test.broken',
      edition: 'both',
      load: async () => ({
        default: () => {
          throw new Error('broken chip')
        },
      }),
    })
    registerSlot({ slot, id: 'test.fine', edition: 'both', load: async () => ({ default: () => <span>fine chip</span> }) })
    registerSlot({ slot, id: 'test.ai', edition: 'ai', load: async () => ({ default: () => <span>ai chip</span> }) })
    render(<SlotOutlet slot={slot} gate={NO_AI} docId="doc-9" />)
    expect(await screen.findByText('fine chip')).toBeTruthy()
    await act(async () => {})
    expect(screen.queryByText('ai chip')).toBeNull()
    error.mockRestore()
  })
})

describe('presence', () => {
  it("lets a decorator add to someone's caret, never take their hue, id or aria-hidden", () => {
    registerSlot({
      slot: 'presence',
      id: 'test.presence',
      edition: 'both',
      decorate: (caret) => {
        caret.className = 'replaced'
        caret.removeAttribute('aria-hidden')
        caret.dataset.badge = 'typing'
      },
    })
    const caret = collaboratorCaret({ id: 'u-1', name: 'Priya Shah', hue: 'moss' })
    expect(caret.getAttribute('aria-hidden')).toBe('true')
    expect(caret.dataset.userId).toBe('u-1')
    expect(caret.dataset.badge).toBe('typing')
    expect(caret.classList.contains('collaboration-cursor__caret')).toBe(true)
    expect(caret.className).toMatch(/moss|camp/)
    expect(caret.textContent).toBe('Priya')
  })
})
