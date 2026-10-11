"use client"

import type { Editor } from "@tiptap/react"
import type { LucideIcon } from "lucide-react"

import { Code, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Type } from "@/lib/icons"

/**
 * The block types a doc's text can be turned into: one list for the
 * selection bar's "Turn into", the phone's "Aa" and the block handle's menu.
 */
export interface BlockType {
  id: string
  label: string
  icon: LucideIcon
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const chain = (editor: Editor) => editor.chain().focus()

export const BLOCK_TYPES: BlockType[] = [
  {
    id: "text",
    label: "Text",
    icon: Type,
    isActive: (e) => e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList") && !e.isActive("taskList"),
    run: (e) => chain(e).clearNodes().setParagraph().run(),
  },
  { id: "h1", label: "Heading 1", icon: Heading1, isActive: (e) => e.isActive("heading", { level: 1 }), run: (e) => chain(e).clearNodes().setHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", icon: Heading2, isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => chain(e).clearNodes().setHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", icon: Heading3, isActive: (e) => e.isActive("heading", { level: 3 }), run: (e) => chain(e).clearNodes().setHeading({ level: 3 }).run() },
  { id: "bullet", label: "Bulleted list", icon: List, isActive: (e) => e.isActive("bulletList"), run: (e) => chain(e).toggleBulletList().run() },
  { id: "ordered", label: "Numbered list", icon: ListOrdered, isActive: (e) => e.isActive("orderedList"), run: (e) => chain(e).toggleOrderedList().run() },
  {
    id: "todo",
    label: "To-do list",
    icon: ListTodo,
    isActive: (e) => e.isActive("taskList"),
    // toggleTaskList exists only where the task list extension is loaded.
    run: (e) => (chain(e) as unknown as { toggleTaskList: () => { run: () => boolean } }).toggleTaskList().run(),
  },
  { id: "quote", label: "Quote", icon: Quote, isActive: (e) => e.isActive("blockquote"), run: (e) => chain(e).toggleBlockquote().run() },
  { id: "code", label: "Code", icon: Code, isActive: (e) => e.isActive("codeBlock"), run: (e) => chain(e).toggleCodeBlock().run() },
]

/** The label of the block the selection is in ("Text", "Heading 2"…). */
export function currentBlockLabel(editor: Editor): string {
  // Lists before text: a list item's own block is a paragraph.
  for (const id of ["todo", "bullet", "ordered", "h1", "h2", "h3", "quote", "code", "text"]) {
    const t = BLOCK_TYPES.find((b) => b.id === id)!
    if (t.isActive(editor)) return t.label
  }
  return "Text"
}
