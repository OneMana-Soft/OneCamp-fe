"use client"

import * as React from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { AtSign, Bold, ChevronDown, Image as ImageIcon, Italic, List, ListTodo, Type } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { cn } from "@/lib/utils/helpers/cn"

import { BLOCK_TYPES } from "./blockTypes"

/**
 * The phone's formatting (content.md D08): no floating bar, because the
 * system's selection handles fight it. A 44 px bar docked above the keyboard
 * instead, following the visual viewport, scrolling sideways with a fade on
 * its right. It shows only while the editor has focus.
 */
export function DocAccessoryBar({ editor, onAIClick }: { editor: Editor; onAIClick: () => void }) {
  const [focused, setFocused] = React.useState(false)
  const [bottom, setBottom] = React.useState(0)
  const [turnOpen, setTurnOpen] = React.useState(false)

  React.useEffect(() => {
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    editor.on("focus", onFocus)
    editor.on("blur", onBlur)
    return () => {
      editor.off("focus", onFocus)
      editor.off("blur", onBlur)
    }
  }, [editor])

  // Above the keyboard: the layout viewport's bottom less the visual one's.
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return
    const place = () => setBottom(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)))
    place()
    vv.addEventListener("resize", place)
    vv.addEventListener("scroll", place)
    return () => {
      vv.removeEventListener("resize", place)
      vv.removeEventListener("scroll", place)
    }
  }, [])

  const on = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && focused ? { bold: e.isActive("bold"), italic: e.isActive("italic"), bullet: e.isActive("bulletList"), todo: e.isActive("taskList") } : null,
  })

  if (!focused) return null

  const keep = (e: React.SyntheticEvent) => e.preventDefault()
  const btn = (active?: boolean) =>
    cn(
      "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 outline-none active:bg-press [&_svg]:size-[18px]",
      active && "bg-press text-ink",
    )

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      data-doc-accessory-bar=""
      style={{ bottom }}
      className="fixed inset-x-0 z-[var(--z-sticky)] border-t border-line bg-raised"
    >
      {turnOpen ? (
        <div className="flex h-11 items-center gap-1 overflow-x-auto px-2 no-scrollbar">
          {BLOCK_TYPES.map((b) => {
            const Icon = b.icon
            return (
              <button
                key={b.id}
                type="button"
                aria-label={b.label}
                onMouseDown={keep}
                onClick={() => {
                  b.run(editor)
                  setTurnOpen(false)
                }}
                className={btn(b.isActive(editor))}
              >
                <Icon />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex h-11 items-center gap-1 overflow-x-auto px-2 no-scrollbar [mask-image:linear-gradient(90deg,#000_calc(100%-8px),transparent)]">
          <button type="button" aria-label="Turn into" aria-expanded={turnOpen} onMouseDown={keep} onClick={() => setTurnOpen(true)} className={btn()}>
            <Type />
            <ChevronDown className="!size-3" />
          </button>
          <button type="button" aria-label="Bold" aria-pressed={!!on?.bold} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(on?.bold)}>
            <Bold />
          </button>
          <button type="button" aria-label="Italic" aria-pressed={!!on?.italic} onMouseDown={keep} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(on?.italic)}>
            <Italic />
          </button>
          <button type="button" aria-label="Bulleted list" aria-pressed={!!on?.bullet} onMouseDown={keep} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(on?.bullet)}>
            <List />
          </button>
          <button
            type="button"
            aria-label="To-do list"
            aria-pressed={!!on?.todo}
            onMouseDown={keep}
            onClick={() => BLOCK_TYPES.find((b) => b.id === "todo")?.run(editor)}
            className={btn(on?.todo)}
          >
            <ListTodo />
          </button>
          <button type="button" aria-label="Mention someone" onMouseDown={keep} onClick={() => editor.chain().focus().insertContent("@").run()} className={btn()}>
            <AtSign />
          </button>
          <button
            type="button"
            aria-label="Insert image"
            onMouseDown={keep}
            onClick={() => (editor.chain().focus() as unknown as { toggleImage: () => { run: () => boolean } }).toggleImage().run()}
            className={btn()}
          >
            <ImageIcon />
          </button>
          <button type="button" aria-label="Ask AI" onMouseDown={keep} onClick={onAIClick} className={cn(btn(), "w-auto gap-1.5 px-3 text-ui-sm font-medium text-ink")}>
            <Spark size={14} className="!size-3.5 text-agent" />
            Ask AI
          </button>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Hide keyboard"
            onMouseDown={keep}
            onClick={() => editor.commands.blur()}
            className={btn()}
          >
            <ChevronDown />
          </button>
        </div>
      )}
    </div>
  )
}
