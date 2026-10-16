/**
 * The doc editor's registries: where contributions are kept, and read back by
 * editor, surface, slot and edition (docs programme, PROGRAM.md §4 #1–#3).
 *
 * A contribution module calls these from its top level and imports them from
 * this file, never from ./index, which imports the contribution: through index
 * the registration would run before the registry exists.
 *
 * The readers here are the contract every host reads through and every package
 * builds on (contract.test.ts); what they derive (an editor's extensions, the
 * slash menu, Turn into, the shortcut table, the schema manifest) lives beside
 * them in factory.ts, blocks.ts, shortcuts.ts and manifest.ts.
 */

import type {
  BlockSpec,
  DialogSpec,
  Edition,
  EditorKind,
  PanelSpec,
  ShellSlot,
  SlotContribution,
  Surface,
  SurfaceAction,
} from './types'

/** Which edition is reading: AI items show only where the AI gate is on. */
export interface EditionGate {
  ai: boolean
}

const blocks = new Map<string, BlockSpec>()
const actions = new Map<string, SurfaceAction>()
const panels = new Map<string, PanelSpec>()
const dialogs = new Map<string, DialogSpec>()
const slots = new Map<string, SlotContribution>()

// What has registered changes rarely (a module loading), and a host that read
// the registry before a later chunk added to it renders again
// (useRegistryVersion).
let version = 0
const listeners = new Set<() => void>()
function changed() {
  version++
  for (const l of listeners) l()
}

// A second registration under one id is a mistake two packages made in
// parallel: it fails at once, where it happened, instead of one silently
// replacing the other.
function add<T>(map: Map<string, T>, key: string, value: T, what: string) {
  if (map.has(key)) throw new Error(`The ${what} "${key}" is registered twice`)
  map.set(key, value)
  changed()
}

const shows = (edition: Edition, gate: EditionGate) => edition === 'both' || gate.ai

/** Lowest order first, then registration order (a stable sort of what has none). */
function byOrder<T extends { order?: number }>(items: T[], fallback = 0): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.order ?? fallback) - (b.item.order ?? fallback) || a.i - b.i)
    .map(({ item }) => item)
}

export function registerBlock(spec: BlockSpec) {
  add(blocks, spec.id, spec, 'block')
}

export function registerAction(action: SurfaceAction) {
  add(actions, action.id, action, 'action')
}

export function registerPanel(panel: PanelSpec) {
  add(panels, panel.kind, panel, 'panel')
}

export function registerDialog(dialog: DialogSpec) {
  add(dialogs, dialog.id, dialog, 'dialog')
}

export function registerSlot(contribution: SlotContribution) {
  add(slots, `${contribution.slot}:${contribution.id}`, contribution, 'slot contribution')
}

/**
 * The blocks an editor carries, in registration order. A spec that another
 * one in the same editor replaces (BlockSpec.replaces) is left out.
 */
export function blocksFor(editor: EditorKind, gate: EditionGate): BlockSpec[] {
  const carried = [...blocks.values()].filter((b) => b.editors.includes(editor) && shows(b.edition, gate))
  const replaced = new Set(carried.flatMap((b) => b.replaces ?? []))
  return carried.filter((b) => !replaced.has(b.id))
}

/** The actions a surface shows, lowest order first, then in registration order. */
export function actionsFor(surface: Surface, gate: EditionGate): SurfaceAction[] {
  return byOrder([...actions.values()].filter((a) => a.surfaces.includes(surface) && shows(a.edition, gate)))
}

export function panelFor(kind: string, gate: EditionGate): PanelSpec | undefined {
  const panel = panels.get(kind)
  return panel && shows(panel.edition, gate) ? panel : undefined
}

export function dialogFor(id: string, gate: EditionGate): DialogSpec | undefined {
  const dialog = dialogs.get(id)
  return dialog && shows(dialog.edition, gate) ? dialog : undefined
}

/** A slot's contributions, lowest order first, then in registration order. */
export function slotFor(slot: ShellSlot, gate: EditionGate): SlotContribution[] {
  return byOrder([...slots.values()].filter((c) => c.slot === slot && shows(c.edition, gate)))
}

/** One block by id, whatever the edition (tests, the manifest). */
export function blockById(id: string): BlockSpec | undefined {
  return blocks.get(id)
}

/** One action by id, if the edition shows it: what a shortcut or the palette runs. */
export function actionById(id: string, gate: EditionGate): SurfaceAction | undefined {
  const action = actions.get(id)
  return action && shows(action.edition, gate) ? action : undefined
}

/** Every registered block, every edition: what the guards read. */
export function allBlocks(): BlockSpec[] {
  return [...blocks.values()]
}

/** Every registered action, every edition. */
export function allActions(): SurfaceAction[] {
  return [...actions.values()]
}

/** A number that moves whenever something registers. */
export function registryVersion(): number {
  return version
}

/** Called whenever something registers; the returned function stops it. */
export function subscribeRegistry(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
