"use client"

import type { ElementType } from "react"
import type { Editor } from "@tiptap/core"

import "@/components/docEditor/registry"
import { currentTurnIntoLabel, turnIntoFor } from "@/components/docEditor/registry/readers"

/**
 * The block types a doc's text can be turned into: one list for the
 * selection bar's "Turn into", the phone's "Aa" and the block handle's menu.
 * Each block's spec says how it is turned into (BlockSpec.turnInto), so a
 * block a package adds is in this list with nothing else edited.
 */
export interface BlockType {
  id: string
  label: string
  icon: ElementType
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

/** Turn into's entries, in menu order (every edition has them). */
export const BLOCK_TYPES: BlockType[] = turnIntoFor({ ai: false })

/** The label of the block the selection is in ("Text", "Heading 2"…). */
export function currentBlockLabel(editor: Editor): string {
  return currentTurnIntoLabel(editor, BLOCK_TYPES)
}
