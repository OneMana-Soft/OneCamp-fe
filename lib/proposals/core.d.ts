/**
 * Types for core.js, the proposals core shared byte for byte with the
 * collaboration service (live/ops/proposalCore.js). The code is JavaScript so
 * the two copies can be the same file; these are its shapes.
 */

import type { Node as PMNode, Slice } from '@tiptap/pm/model'
import type { Transform } from '@tiptap/pm/transform'
import type * as Y from 'yjs'
import type { JSONContent } from '@tiptap/core'
import type { ProposalHunk } from './types'

export const CORE_VERSION: number
export const LIMITS: Readonly<{ blocks: number; hunks: number; diffCells: number }>

export interface DiffRun { same: boolean; a0: number; a1: number; b0: number; b1: number }
export interface Range { from: number; to: number }
export interface Placed { hunk: ProposalHunk; from: number; to: number }
export interface Located { exact: boolean; placed: Placed[]; conflicts: string[] }

export function nodeKey(node: PMNode): string
export function nodesKey(nodes: PMNode[]): string
export function childrenOf(node: PMNode): PMNode[]
export function diffRuns(a: string[], b: string[]): DiffRun[] | null
/** Text as the diff's words: runs of letters and digits (any script), runs of white space, and every other character alone; joined, the text. */
export function wordsOf(text: string): string[]
export function diffBlocks(base: PMNode[], proposed: PMNode[]): ProposalHunk[]
export function nodesFromJSON(schema: PMNode['type']['schema'], json: JSONContent[] | undefined | null): PMNode[]
export function targetForRange(doc: PMNode, from: number, to: number): Range
export function siblingsBetween(doc: PMNode, from: number, to: number): PMNode[] | null
export function proposalFromReplacement(
  scratch: Transform,
  from: number,
  to: number,
  slice: Slice,
): { target: Range; base: PMNode[]; proposed: PMNode[] }
export function placeIn(start: number, nodes: PMNode[], hunk: ProposalHunk): Range | null
export function checkPlace(doc: PMNode, place: Range | null, hunk: ProposalHunk): boolean
export function validHunks(base: PMNode[], hunks: ProposalHunk[]): boolean
export function applyPlaced<T extends Transform>(tr: T, placed: Placed[]): T
export function insertBelowAt(doc: PMNode, pos: number, nodes: PMNode[]): number | null
export function insertBelow(tr: Transform, pos: number, proposed: JSONContent[]): number | null

/** The binding's map from Yjs types to ProseMirror nodes. */
export type YMapping = Map<unknown, PMNode>

export function relativeAt(fragment: Y.XmlFragment, doc: PMNode, pos: number, assoc: number): Y.RelativePosition | null
export function encodeRelative(rel: Y.RelativePosition | null): string
export function resolveRelative(ydoc: Y.Doc, fragment: Y.XmlFragment, mapping: YMapping, encoded: string | undefined): number | null
export function encodePlaces(
  fragment: Y.XmlFragment,
  doc: PMNode,
  start: number,
  base: PMNode[],
  hunks: ProposalHunk[],
): ProposalHunk[]
export function encodeTarget(fragment: Y.XmlFragment, doc: PMNode, target: Range): { start: string; end: string }
export function locate(
  doc: PMNode,
  range: Range | null,
  base: JSONContent[] | undefined,
  hunks: ProposalHunk[],
  ids: string[] | null,
  resolve: ((encoded: string) => number | null) | null,
): Located
