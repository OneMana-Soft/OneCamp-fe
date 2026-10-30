/**
 * The doc editor's registry: the one file a docs-programme package adds a line
 * to (PROGRAM.md §3.6). Each line imports a module that registers its
 * contribution as it loads:
 *
 *   import '@/components/minimal-tiptap/extensions/anchor-decorations/register'
 *
 * The integrator adds the line when the package merges. A contribution module
 * imports registerBlock and the rest from './registry', not from this file.
 *
 * Every editor's host imports this one entry (the doc page, the guest's page,
 * the chat composer, a task's description), and each takes the blocks
 * registered for its kind (factory.ts). So that the composer stays light, a
 * block only a doc carries puts its extensions behind load(), and a heavy one
 * draws itself lazily (lazyNodeView): registry.test.ts reads what this entry
 * pulls in statically.
 */

export * from './registry'
export type * from './types'

// The built-in blocks and actions, then the packages'.
import '@/components/minimal-tiptap/blocks'
import '@/components/docEditor/actions'

// Contributions, one line per package, in merge order (PROGRAM.md §9):
import '@/components/minimal-tiptap/extensions/proposals/register' // A9: edit proposals
import '@/lib/export/register' // A7: export and import in More
import '@/components/minimal-tiptap/extensions/anchor-decorations/register' // A8: anchored threads
import '@/components/minimal-tiptap/extensions/placeholder/placeholderSpec' // A2: the empty doc's placeholder
import '@/components/docEditor/follow/register' // A6: follow a page, in More
import '@/components/docEditor/session/register' // A6: an open doc's live meta events
import '@/components/minimal-tiptap/extensions/block-commands/register' // B1: block interactions
import '@/components/minimal-tiptap/extensions/formatting/register' // B2: colours, toggles, lists, contents and the doc's style
import '@/components/docEditor/technical/register' // B3: technical blocks and find
import '@/components/minimal-tiptap/extensions/links-media/register' // B4: paste, media, links and embeds
import '@/components/docTemplates/register' // B5: an empty doc's starter (templates, a file), and Save as template
import '@/components/docComments/register' // B7: comments in the doc, and the margin's markers
import '@/components/docEditor/history/register' // B8: version history and live presence
import '@/components/ai/docAiRegister' // B9: doc AI (AI edition only)
import '@/components/docEditor/chrome/register' // B6: page chrome and sharing
import '@/components/minimal-tiptap/extensions/connected/register' // C1: pages, dates, task lists, boards and to-dos that are tasks
import '@/lib/workspaceExport/register' // C4: a private doc's owner lets it into workspace exports, in More
import '@/components/minimal-tiptap/extensions/suggest-mode/register' // C5: suggesting, and every kept suggestion shown for review
