"use client"

import type { Node as PMNode } from '@tiptap/pm/model'
import type { Selection, Transaction } from '@tiptap/pm/state'
import { BLOCK_COLOUR_NODES, blockColourValue, colourName, type DocColour } from '@/lib/docColours'

export { BLOCK_COLOUR_NODES }

/**
 * What the colour grid, "/red", "/sky background" and ⌘⇧H apply, and where
 * (B2; editor.md P1-2). A pick is a colour for text or for a background; no
 * colour is that row's Default, which takes it off.
 *
 * - Text selected: the text's colour (textStyle) or its highlight.
 * - Blocks (the block menu's chosen blocks), or the caret's block when
 *   nothing is selected: the blocks' own colour, one value, as Notion's API
 *   stores it: "sky" for blue text, "sky_background" for a blue background.
 */
export interface ColourPick {
  colour: DocColour | null
  background: boolean
}

/** A range of blocks, as the block menu gives it. */
export type BlockRange = { from: number; to: number }

/** A pick as stored: "sky", "sky_background"; Default is none. Pure. */
export const pickValue = (p: ColourPick): string | null => (p.colour ? (p.background ? `${p.colour}_background` : p.colour) : null)

/** A stored value as a pick, or null when it isn't one of ours. Pure. */
export function pickOf(v: unknown): ColourPick | null {
  const value = blockColourValue(v)
  if (!value) return null
  const [colour, background] = value.split('_')
  return { colour: colour as DocColour, background: background === 'background' }
}

export { blockColourValue }

type At = { node: PMNode; pos: number }

/** Blocks whose first line colours them whole: a list item, a to-do, a toggle. */
const ITEMS = ['listItem', 'taskItem', 'collapsible']

/**
 * Where a block colour goes:
 * - the block menu's chosen blocks, by their ids (B1's ctx.state.blocks):
 *   only those, never what lies between blocks chosen apart; one that takes
 *   no colour itself (a list, a callout) gives it to the blocks inside;
 * - else the outermost blocks that take one inside the menu's range;
 * - with neither, the caret's block (its list item, to-do or toggle when it
 *   is that item's first line; its quote when it is in one).
 */
export function colourTargets(state: { doc: PMNode; selection: Selection }, range?: BlockRange | null, blocks?: readonly string[] | null): At[] {
  const { doc, selection } = state
  if (blocks?.length) {
    const chosen = new Set(blocks)
    const out: At[] = []
    doc.descendants((node, pos) => {
      if (!chosen.has(node.attrs.blockId as string)) return !node.isTextblock
      if (BLOCK_COLOUR_NODES.includes(node.type.name)) out.push({ node, pos })
      else out.push(...colourTargets(state, { from: pos, to: pos + node.nodeSize }))
      return false
    })
    return out
  }
  if (range) {
    const out: At[] = []
    doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!BLOCK_COLOUR_NODES.includes(node.type.name) || pos < range.from || pos + node.nodeSize > range.to) return true
      out.push({ node, pos })
      return false
    })
    return out
  }
  const { $from } = selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (!BLOCK_COLOUR_NODES.includes(node.type.name)) continue
    const parent = d > 1 ? $from.node(d - 1) : null
    if (parent && node.isTextblock && (parent.type.name === 'blockquote' || (ITEMS.includes(parent.type.name) && $from.index(d - 1) === 0))) {
      return [{ node: parent, pos: $from.before(d - 1) }]
    }
    return [{ node, pos: $from.before(d) }]
  }
  return []
}

/** Gives blocks a pick's colour, or takes one row's off (Default), in tr. */
export function colourBlocksIn(tr: Transaction, targets: At[], pick: ColourPick) {
  for (const { node, pos } of targets) {
    if (!node.type.spec.attrs?.blockColor) continue
    const was = node.attrs.blockColor ?? null
    const now = pickOf(was)
    // Default takes off only its own row's colour: "Default" text leaves a background.
    const next = pick.colour ? pickValue(pick) : now && now.background === pick.background ? null : was
    if (next !== was) tr.setNodeMarkup(tr.mapping.map(pos), undefined, { ...node.attrs, blockColor: next })
  }
}

/** The colour a block has now, for the grid to show as chosen. */
export const blockPickOf = (node: PMNode | undefined): ColourPick | null => pickOf(node?.attrs.blockColor)

const RECENT_KEY = 'onecamp-doc-colours'
/** The selection bar's old store (one text colour as a CSS variable), read once and let go. */
export const LEGACY_LAST_KEY = 'onecamp-doc-last-colour'
/** How many "Last used" the grid shows. */
export const RECENT_MAX = 3

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((v): v is string => !!pickOf(v)) : []
  } catch {
    return []
  }
}

function writeRecent(values: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(values.slice(0, RECENT_MAX)))
  } catch {
    /* a private window: for this visit only */
  }
}

/**
 * The colours used last on this device, newest first. A colour the old
 * selection bar kept is taken over (and its key let go, so that bar, until it
 * is rewired, finds nothing to apply a second time).
 */
export function recentColours(): ColourPick[] {
  let values = readRecent()
  try {
    const legacy = localStorage.getItem(LEGACY_LAST_KEY)
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_LAST_KEY)
      const c = colourName(legacy)
      if (c) writeRecent((values = [c, ...values.filter((v) => v !== c)]))
    }
  } catch {
    /* nothing kept */
  }
  return values.map((v) => pickOf(v)!)
}

/** Remembers a colour as the last used (Default isn't one). */
export function rememberColour(pick: ColourPick) {
  const value = pickValue(pick)
  if (!value) return
  writeRecent([value, ...readRecent().filter((v) => v !== value)])
}
