"use client"

import * as React from "react"
import { EditorContent, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@/components/minimal-tiptap/components/bubble-menu/bubble-menu"
import type { Content } from "@tiptap/core"

import { useMinimalTiptapEditor } from "@/components/minimal-tiptap/hooks/use-minimal-tiptap"
import { Bold, Code, Italic, List, ListOrdered, Strikethrough } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A borderless editor with no toolbar at rest (design v3, work.md W36, W31):
 * the text and nothing else, and formatting in a small pop toolbar (e3, r10)
 * that appears over a selection, as in docs. "/" and markdown shortcuts work
 * as in every editor here. The create composer's description uses it.
 */
export function QuietEditor({
  value,
  onChange,
  placeholder,
  className,
  contentClassName,
  onFiles,
}: {
  value?: Content
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  contentClassName?: string
  /** Files pasted or dropped into the text. */
  onFiles?: (files: File[]) => void
}) {
  const editor = useMinimalTiptapEditor({
    kind: "task",
    value,
    output: "html",
    placeholder,
    throttleDelay: 300,
    editorClassName: "focus:outline-none",
    onUpdate: (c) => onChange(c?.toString() || ""),
  })
  if (!editor) return <div className={cn("min-h-[72px]", className)} />
  return (
    <div
      className={cn("relative", className)}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? [])
        if (files.length && onFiles) onFiles(files)
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer?.files ?? [])
        if (files.length && onFiles) {
          e.preventDefault()
          onFiles(files)
        }
      }}
    >
      <EditorContent editor={editor} className={cn("minimal-tiptap-editor", contentClassName)} />
      <SelectionToolbar editor={editor} />
    </div>
  )
}

const MARKS = [
  { name: "bold", label: "Bold", Icon: Bold, run: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "Italic", Icon: Italic, run: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { name: "strike", label: "Strikethrough", Icon: Strikethrough, run: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { name: "code", label: "Code", Icon: Code, run: (e: Editor) => e.chain().focus().toggleCode().run() },
  { name: "bulletList", label: "Bulleted list", Icon: List, run: (e: Editor) => e.chain().focus().toggleBulletList().run() },
  { name: "orderedList", label: "Numbered list", Icon: ListOrdered, run: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
] as const

function SelectionToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, from, to }) => from !== to && e.isEditable}
      tippyOptions={{ duration: 120, placement: "top" }}
    >
      <div role="toolbar" aria-label="Formatting" data-selection-toolbar="" className="flex items-center gap-0.5 rounded-lg bg-pop p-1 shadow-e3">
        {MARKS.map(({ name, label, Icon, run }) => (
          <button
            key={name}
            type="button"
            aria-label={label}
            aria-pressed={editor.isActive(name)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(editor)}
            className={cn("inline-flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-press hover:text-foreground", editor.isActive(name) && "bg-press text-foreground")}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
    </BubbleMenu>
  )
}
