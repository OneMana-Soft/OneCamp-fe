"use client"

import * as React from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { ChevronDown, Type } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { cn } from "@/lib/utils/helpers/cn"

import { BLOCK_TYPES } from "./blockTypes"
import { setPhoneScrollMargin } from "./phoneScrollMargin"
import { phoneBarGroups } from "./actions/text"
import { NO_BUS, busFor } from "./registry/commandBus"
import { actionGroupsFor } from "./registry/readers"
import type { ActionContext } from "./registry/types"

export { shiftBlock } from "./blockShift"

/**
 * The phone's formatting (content.md D08): no floating bar, because the
 * system's selection handles fight it. A 44 px bar docked above the keyboard
 * instead, following the visual viewport, scrolling sideways with a fade on
 * its right. It shows only while the editor has focus.
 *
 * Its buttons are the actions registered for the phone's bar (actions/
 * text.ts: the marks, a list and a to-do, indent and outdent, undo and redo,
 * Comment, an @ and an image, Ask AI behind the AI gate), in their groups; a
 * package's action for it shows here too. Turn into and Hide keyboard are the
 * bar's own.
 */
/** The bar's height: 44 px of buttons and its 1 px top line. */
export const ACCESSORY_BAR_HEIGHT = 45

export function DocAccessoryBar({
  editor,
  context,
  onAIClick,
  onComment,
}: {
  editor: Editor
  /** The context its actions run in (the doc's page gives its own: its doc, bus and gate). */
  context?: () => ActionContext
  /** Ask AI, when the host handles it itself. */
  onAIClick?: () => void
  /** Comment, when the host handles it itself. */
  onComment?: () => void
}) {
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

  // Toasts sit above whatever owns the bottom of a phone's screen (app/
  // phone.css: --phone-floor, which a page that owns its bottom edge reads
  // from --mobile-drawer-h, as a chat's composer publishes it). While the bar
  // shows, it owns that edge: it publishes its top, so a toast clears it.
  // A toast used to land on the bar.
  React.useLayoutEffect(() => {
    if (!focused) return
    const root = document.documentElement
    root.style.setProperty("--mobile-drawer-h", `${bottom + ACCESSORY_BAR_HEIGHT}px`)
    // And the caret stays above it (M8).
    setPhoneScrollMargin(editor, bottom + ACCESSORY_BAR_HEIGHT)
    return () => {
      root.style.removeProperty("--mobile-drawer-h")
      setPhoneScrollMargin(editor, null)
    }
  }, [focused, bottom, editor])

  // The actions' context, read as the editor changes (the bar's state is
  // which are enabled and which are pressed).
  const ctxOf = React.useCallback(
    (): ActionContext => context?.() ?? { docId: busFor(editor)?.docId ?? "", editor, canEdit: editor.isEditable, bus: busFor(editor) ?? NO_BUS, gate: { ai: true } },
    [context, editor],
  )
  const groups = () => actionGroupsFor("phoneBar", ctxOf(), phoneBarGroups(editor.state.selection.empty), { disabled: "show" })
  // What the bar shows, as the editor changes: it renders only when this does.
  useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && focused ? groups().flatMap((g) => g.actions.map((a) => `${a.action.id}:${a.enabled ? 1 : 0}${a.checked ? 1 : 0}`)).join(" ") : "",
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
          {groups().flatMap((g) =>
            g.actions.map((a) => {
              const Icon = a.icon
              const run = () => {
                if (a.action.id === "ai.ask" && onAIClick) return onAIClick()
                if (a.action.id === "text.comment" && onComment) return onComment()
                void a.run()
              }
              if (a.action.id === "ai.ask") {
                return (
                  <button key={a.action.id} type="button" aria-label={a.label} onMouseDown={keep} onClick={run} className={cn(btn(), "w-auto gap-1.5 px-3 text-ui-sm font-medium text-ink")}>
                    <Spark size={14} className="!size-3.5 text-agent" />
                    {a.label}
                  </button>
                )
              }
              return (
                <button
                  key={a.action.id}
                  type="button"
                  aria-label={a.label}
                  aria-pressed={a.checked === undefined ? undefined : a.checked}
                  disabled={!a.enabled}
                  onMouseDown={keep}
                  onClick={run}
                  className={cn(btn(a.checked), "disabled:opacity-40")}
                >
                  {Icon ? <Icon /> : a.label}
                </button>
              )
            }),
          )}
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
