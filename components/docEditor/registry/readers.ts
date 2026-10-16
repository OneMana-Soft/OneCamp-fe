/**
 * What the hosts read from the block specs and actions: the "/" menu, Turn
 * into, an action surface in its groups, the saved copy's classes and the
 * blocks that break out of the text column. Each list is made from the
 * registry when asked, so a block or an action registered by a package shows
 * everywhere it belongs with nothing else edited.
 */

import type { Editor } from '@tiptap/core'
import type { SlashCommandItem } from '@/components/minimal-tiptap/extensions/slash-command/slashCommand'
import { actionsFor, blocksFor, type EditionGate } from './registry'
import { busFor, NO_BUS, type PaletteEntry } from './commandBus'
import { chordGlyphs } from './shortcuts'
import type { ActionContext, EditorKind, SlashEntry, Surface, SurfaceAction, TurnIntoEntry } from './types'

/** The "/" menu's sections, in the order an unfiltered menu shows them. */
export const SLASH_SECTIONS = ['Commands', 'Recent', 'Basic', 'Media and embeds', 'AI', 'Format']

const sectionRank = (s: string) => {
  const i = SLASH_SECTIONS.indexOf(s)
  return i < 0 ? SLASH_SECTIONS.length : i
}

/** A "/" item with the tint its tile wears, for the menu. */
export type SlashItem = SlashCommandItem & { tint?: string }

/** The editor kind whose "/" a kind shows: the guest's page has the doc's (it never types). */
const slashKind = (kind: EditorKind): EditorKind => (kind === 'guest' ? 'doc' : kind)

/** An action's context in the editor it runs in: its bus, its doc, whether it may edit. */
export function editorActionContext(editor: Editor, gate: EditionGate): ActionContext {
  const bus = busFor(editor) ?? NO_BUS
  return { docId: bus.docId, editor, canEdit: editor.isEditable, bus, gate }
}

/**
 * What "/" offers in an editor of this kind: the blocks' entries (each in the
 * editors it names, a doc's by default), then in a doc the actions registered
 * for the 'slash' surface (Write with AI…), by section and then order. The
 * guest's page reads the doc's.
 */
export function slashItemsFor(kind: EditorKind, gate: EditionGate): SlashItem[] {
  const as = slashKind(kind)
  const items: Array<{ item: SlashItem; section: string; order: number; at: number }> = []
  for (const spec of blocksFor(kind, gate)) {
    for (const entry of spec.slash ?? []) {
      if (!(entry.editors ?? ['doc']).includes(as)) continue
      items.push({ item: slashItemOf(entry, spec.id), section: entry.section, order: entry.order ?? 1000, at: items.length })
    }
  }
  if (as === 'doc') {
    for (const action of actionsFor('slash', gate)) {
      items.push({
        item: {
          id: action.id,
          title: action.label,
          description: action.description ?? action.label,
          aliases: action.aliases,
          icon: action.icon ?? (() => null),
          section: action.group,
          command: ({ editor, range }) => {
            const ed = editor as Editor
            ed.chain().focus().deleteRange(range).run()
            void action.run(editorActionContext(ed, gate))
          },
        },
        section: action.group,
        order: action.order ?? 1000,
        at: items.length,
      })
    }
  }
  return items
    .sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.order - b.order || a.at - b.at)
    .map(({ item }) => item)
}

function slashItemOf(entry: SlashEntry, specId: string): SlashItem {
  return {
    id: entry.id ?? specId,
    title: entry.title,
    description: entry.description,
    icon: entry.icon,
    section: entry.section,
    kbd: entry.kbd,
    aliases: entry.aliases,
    tint: entry.tint,
    command: ({ editor, range }) => entry.run(editor, range),
  }
}

/** Turn into's entries, in menu order, each with its id. */
export function turnIntoFor(gate: EditionGate, kind: EditorKind = 'doc'): Array<TurnIntoEntry & { id: string }> {
  const out: Array<TurnIntoEntry & { id: string; at: number }> = []
  for (const spec of blocksFor(kind, gate)) {
    const list = spec.turnInto ? (Array.isArray(spec.turnInto) ? spec.turnInto : [spec.turnInto]) : []
    for (const t of list) out.push({ ...t, id: t.id ?? spec.id, at: out.length })
  }
  return out.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.at - b.at).map(({ at: _at, ...t }) => t)
}

/** The name of the block the caret is in ("Text", "Heading 2"…). */
export function currentTurnIntoLabel(editor: Editor, entries: TurnIntoEntry[]): string {
  const asked = [...entries].sort((a, b) => (a.detect ?? 50) - (b.detect ?? 50))
  for (const t of asked) if (t.isActive(editor)) return t.label
  return 'Text'
}

/** An action as one surface draws it, in the context it would run in. */
export interface ShownAction {
  action: SurfaceAction
  label: string
  icon?: SurfaceAction['icon']
  checked?: boolean
  /** False only where the surface shows what can't run now (a bar, disabled). */
  enabled: boolean
  run(): void | Promise<void>
}

/** A surface's group of actions, in order. */
export interface ActionGroup {
  group: string
  actions: ShownAction[]
}

/**
 * A surface's actions in their groups: the groups named in `groupOrder`
 * first, in that order, then any other (a package's) in the order its first
 * action came; within a group by order. What isVisible refuses is left out;
 * so is what isEnabled refuses, unless the surface shows it disabled
 * (`disabled: 'show'`, a bar); and so is an action that throws while it is
 * asked (a broken package's item never takes the menu with it). A group of
 * only destructive actions comes last, whatever the order says.
 */
export function actionGroupsFor(surface: Surface, ctx: ActionContext, groupOrder: string[] = [], options: { disabled?: 'hide' | 'show' } = {}): ActionGroup[] {
  const groups: ActionGroup[] = []
  for (const action of actionsFor(surface, ctx.gate ?? { ai: false })) {
    let shown: ShownAction
    try {
      if (action.isVisible && !action.isVisible(ctx)) continue
      const enabled = action.isEnabled ? !!action.isEnabled(ctx) : true
      if (!enabled && options.disabled !== 'show') continue
      shown = {
        action,
        label: action.labelFor?.(ctx) ?? action.label,
        icon: action.iconFor?.(ctx) ?? action.icon,
        checked: action.isChecked ? !!action.isChecked(ctx) : undefined,
        enabled,
        run: () => action.run(ctx),
      }
    } catch (e) {
      console.error(`The action "${action.id}" failed while it was shown`, e)
      continue
    }
    let group = groups.find((g) => g.group === action.group)
    if (!group) groups.push((group = { group: action.group, actions: [] }))
    group.actions.push(shown)
  }
  const rank = (g: string) => {
    const i = groupOrder.indexOf(g)
    return i < 0 ? groupOrder.length : i
  }
  const destroys = (g: ActionGroup) => g.actions.every((a) => a.action.destructive)
  return groups
    .map((g, at) => ({ g, at }))
    .sort((a, b) => Number(destroys(a.g)) - Number(destroys(b.g)) || rank(a.g.group) - rank(b.g.group) || a.at - b.at)
    .map(({ g }) => g)
}

/**
 * A doc's actions for the command palette (surface 'palette'), as the palette
 * lists them: what is disabled now is left out, a toggle reads as it would in
 * More, and each carries its keys.
 */
export function paletteEntriesFor(ctx: ActionContext, groupOrder: string[] = []): PaletteEntry[] {
  return actionGroupsFor('palette', ctx, groupOrder).flatMap((g) =>
    g.actions.map((a) => ({
      id: a.action.id,
      label: a.label,
      keywords: [...(a.action.aliases ?? []), ...(a.action.description ? [a.action.description] : [])],
      icon: a.icon,
      keys: a.action.shortcut ? chordGlyphs(a.action.shortcut).join(' ') : undefined,
      run: () => void a.run(),
    })),
  )
}

/** The saved copy's [selector, class] rules, so it is dressed as the editor dresses each block. */
export function snapshotClassesFor(kind: EditorKind, gate: EditionGate): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const spec of blocksFor(kind, gate)) {
    if (spec.snapshotClass) out.push(spec.snapshotClass)
    for (const rule of spec.snapshotClasses ?? []) out.push(rule)
  }
  return out
}

/** The node names of the blocks that break out of the reading column. */
export function wideBlocksFor(kind: EditorKind, gate: EditionGate): string[] {
  return blocksFor(kind, gate)
    .filter((s) => s.wide)
    .flatMap((s) => s.schema.filter((e) => e.kind === 'node').map((e) => e.name))
}

/** The node and mark names typography leaves alone (code). */
export function typographyExclusionsFor(kind: EditorKind, gate: EditionGate): string[] {
  return blocksFor(kind, gate)
    .filter((s) => s.excludesTypography)
    .flatMap((s) => s.schema.map((e) => e.name))
}
