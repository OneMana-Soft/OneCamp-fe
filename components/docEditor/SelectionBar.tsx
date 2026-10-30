"use client"

import * as React from "react"
import { getMarkRange, useEditorState, type Editor } from "@tiptap/react"

import { Check, ChevronDown, Link } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils/helpers/cn"
import { isComposingKey } from "@/lib/keys/ime"

import { BLOCK_TYPES, currentBlockLabel } from "./blockTypes"
import { docKeymapOf } from "@/components/minimal-tiptap/extensions/doc-keymap/storage"
import { SELECTION_GROUPS } from "./actions/text"
import { NO_BUS, busFor } from "./registry/commandBus"
import { actionGroupsFor, type ShownAction } from "./registry/readers"
import type { ActionContext } from "./registry/types"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

/**
 * The doc's formatting, on selection (content.md D08). It replaces the
 * permanent toolbar row: a FloatingBar that floats 8 px above a non-empty
 * selection (flipping below near the top), with Ask AI, Turn into, the marks,
 * Colour (B2's colour.open, the "style" group) and Comment. Alt-F10 (or
 * Mod-Shift-\) moves focus into it, arrows walk it and Escape goes back to
 * the text.
 *
 * It follows the editor itself (useEditorState with a selector), so typing
 * with nothing selected re-renders nothing here, and the doc's frame never
 * renders for it.
 */

/** Whether the selection is exactly one link, which has a bar of its own (L7). */
/** The groups a reader's bar shows: asking and commenting, never changing. */
const READER_GROUPS = ["ai", "comment"]

/** Whether a reader's selection has anything to offer them. Pure. */
export function readerOffers(ctx: ActionContext): boolean {
  const a = ctx.abilities
  return !!a && (a.comment || (!!ctx.gate?.ai && a.askRead))
}

export function selectionIsOneLink(editor: Editor, from: number, to: number): boolean {
  const type = editor.schema.marks.link
  if (!type || !editor.isActive("link")) return false
  const range = getMarkRange(editor.state.doc.resolve(from), type) ?? getMarkRange(editor.state.doc.resolve(Math.min(from + 1, to)), type)
  return !!range && range.from <= from && range.to >= to
}

interface SelectionBarProps {
  editor: Editor
  /** The context its actions run in (the doc's page gives its own: its doc, bus and gate). */
  context?: () => ActionContext
  /** Ask AI, when the host handles it itself. */
  onAIClick?: () => void
  /** Comment, when the host handles it itself. */
  onComment?: () => void
  hide?: boolean
}

type Menu = null | "turn" | "link"

// The floating shell (bubble-menu.tsx: Tiptap's view, with tippy) loads with
// the first selection, off the doc's first load: until then there is nothing
// to float over. It attaches to the editor as a view, never as a plugin, so it
// can come late (registry/factory.ts), and reads the selection it came for.
const BubbleMenu = lazyPiece(() => import("@/components/minimal-tiptap/components/bubble-menu/bubble-menu").then((m) => ({ default: m.BubbleMenu })))

export function SelectionBar({ editor, context, onAIClick, onComment, hide }: SelectionBarProps) {
  const barRef = React.useRef<HTMLDivElement>(null)
  // Its buttons beyond Turn into and the link are the actions registered for
  // the selection (actions/text.ts: Ask AI behind the AI gate, the marks,
  // Comment; B2's Colour), in their groups; a package's show here too.
  const ctxOf = React.useCallback(
    (): ActionContext => context?.() ?? { docId: busFor(editor)?.docId ?? "", editor, canEdit: editor.isEditable, bus: busFor(editor) ?? NO_BUS, gate: { ai: true } },
    [context, editor],
  )
  // A reader (an editor that isn't editable) is offered only what their level
  // allows: Ask AI's reading actions from view, Comment from comment (docs
  // incident, 14 Oct 2026). The bar hid from them altogether.
  const reader = !editor.isEditable
  const groups = () => actionGroupsFor("selection", ctxOf(), reader ? READER_GROUPS : SELECTION_GROUPS, { disabled: reader ? "hide" : "show" })
  const comment = React.useCallback(() => {
    if (onComment) return onComment()
    const action = groups().find((g) => g.group === "comment")?.actions.find((a) => a.action.id === "text.comment")
    if (action?.enabled) void action.run()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- groups reads ctxOf
  }, [onComment, ctxOf])
  const onCommentRef = React.useRef(comment)
  React.useLayoutEffect(() => {
    onCommentRef.current = comment
  })
  const [menu, setMenu] = React.useState<Menu>(null)
  // Turn into, opened from the bar with the keyboard (the
  // bar had focus): focus goes into the menu, and back to its button when it
  // closes. Opened with the pointer, focus stays in the text, as the bar's
  // own buttons leave it (moving it out would close the bar).
  const menuRef = React.useRef<HTMLDivElement>(null)
  const openedFrom = React.useRef<HTMLElement | null>(null)
  const openMenu = (next: "turn") => {
    const active = document.activeElement as HTMLElement | null
    openedFrom.current = active && barRef.current?.contains(active) ? active : null
    setMenu(menu === next ? null : next)
  }
  const [url, setUrl] = React.useState("")

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null
      const { from, to } = e.state.selection
      if (from === to) return { empty: true } as const
      return {
        empty: false,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        codeBlock: e.isActive("codeBlock"),
        link: e.isActive("link"),
        block: currentBlockLabel(e),
        // What the actions show (pressed, enabled): the bar renders when it changes.
        actions: groups().flatMap((g) => g.actions.map((a) => `${a.action.id}:${a.enabled ? 1 : 0}${a.checked ? 1 : 0}`)).join(" "),
      } as const
    },
  })

  const shouldShow = React.useCallback(
    ({ editor: e, from, to }: { editor: Editor; from: number; to: number }) => {
      if (hide) return false
      if (!e.isEditable && !readerOffers(ctxOf())) return false
      if (to - from < 1) return false
      // A link has its own bubble, and a node selection (an image, an embed) its own actions.
      // A link has its own bubble (Open, Edit, Copy, Remove): one bar, not two.
      if (selectionIsOneLink(e, from, to)) return false
      const sel = e.state.selection as unknown as { node?: unknown }
      if (sel.node) return false
      return true
    },
    [hide, ctxOf],
  )

  // Alt-F10 or Mod-Shift-\ from the text puts focus on the bar.
  React.useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      // ⌘⇧M comments on the selection (C1). ⌘⇧H, the last colour used
      // (K23), is B2's (extensions/block-color).
      if (mod && e.shiftKey && !e.altKey && !editor.state.selection.empty && !e.isComposing && key === "m" && onCommentRef.current) {
        e.preventDefault()
        onCommentRef.current()
        return
      }
      const toBar = (e.altKey && e.key === "F10") || (mod && e.shiftKey && (e.key === "\\" || e.key === "|"))
      if (!toBar) return
      const first = barRef.current?.querySelector<HTMLElement>("[data-bar-item]")
      if (!first || !barRef.current?.offsetParent) return
      e.preventDefault()
      first.focus()
    }
    dom.addEventListener("keydown", onKey)
    return () => dom.removeEventListener("keydown", onKey)
  }, [editor])

  const back = React.useCallback(() => {
    setMenu(null)
    editor.commands.focus()
  }, [editor])

  // ⌘K with text selected (the doc keymap asks): the link field, focused as
  // soon as the bar has shown (it follows the selection 120 ms later).
  const linkInputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    const keys = docKeymapOf(editor)
    if (!keys) return
    let frame = 0
    const request = () => {
      setMenu("link")
      let tries = 0
      const focusWhenShown = () => {
        const input = linkInputRef.current
        if (input?.isConnected) {
          input.focus()
          return
        }
        if (++tries < 30) frame = requestAnimationFrame(focusWhenShown)
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(focusWhenShown)
      return true
    }
    keys.requestLink = request
    return () => {
      cancelAnimationFrame(frame)
      if (keys.requestLink === request) keys.requestLink = null
    }
  }, [editor])

  const turnItems: CommandListItem[] = React.useMemo(
    () =>
      BLOCK_TYPES.map((b) => {
        const Icon = b.icon
        return {
          id: b.id,
          label: b.label,
          tile: (
            <CommandTile>
              <Icon />
            </CommandTile>
          ),
          trailing: state && !state.empty && state.block === b.label ? <Check className="size-3.5 text-ink-2" aria-hidden="true" /> : undefined,
        }
      }),
    [state],
  )

  const applyLink = () => {
    const href = url.trim()
    if (href) {
      const safe = /^(https?:|mailto:)/i.test(href) ? href : `https://${href}`
      editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run()
    }
    setUrl("")
    setMenu(null)
  }

  const on = state && !state.empty ? state : null
  // The registered actions as the bar draws them now (state above renders it as they change).
  const groupsNow = on ? groups() : []
  const actionsIn = (group: string): ShownAction[] => groupsNow.find((g) => g.group === group)?.actions ?? []

  // Once something has been selected, the shell stays (and is loaded).
  const [selected, setSelected] = React.useState(false)
  React.useEffect(() => {
    if (on) setSelected(true)
  }, [on])
  if (!selected) return null

  return (
    <React.Suspense fallback={null}>
      <BubbleMenu
        editor={editor}
        shouldShow={shouldShow}
        updateDelay={120}
        tippyOptions={{
          duration: 0,
          placement: "top",
          offset: [0, 8],
          zIndex: 60,
          maxWidth: "none",
          popperOptions: {
            modifiers: [
              { name: "flip", options: { fallbackPlacements: ["bottom"], padding: { top: 48 } } },
              { name: "preventOverflow", options: { padding: 12 } },
            ],
          },
          onHidden: () => setMenu(null),
        }}
      >
        <Popover open={menu === "turn"} onOpenChange={(o) => !o && setMenu(null)}>
          <PopoverAnchor asChild>
            <FloatingBar ref={barRef} label="Formatting" onEscape={back} data-doc-selection-bar="">
              {menu === "link" ? (
                <form
                  className="flex items-center gap-1 px-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    applyLink()
                  }}
                >
                  <input
                    ref={linkInputRef}
                    autoFocus
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    data-escape-own=""
                    onKeyDown={(e) => {
                      // An input method's Escape drops the word being made, not the link.
                      if (e.key === "Escape" && !isComposingKey(e.nativeEvent)) {
                        e.preventDefault()
                        e.stopPropagation()
                        back()
                      }
                    }}
                    placeholder="Paste a link"
                    aria-label="Link address"
                    className="h-7 w-56 rounded-md bg-transparent px-2 text-ui-sm text-ink outline-none placeholder:text-ink-3"
                  />
                  <FloatingBarButton label="Add link" type="submit">
                    <Check />
                  </FloatingBarButton>
                </form>
              ) : (
                <>
                  {actionsIn("ai").map((a) => (
                    <FloatingBarButton
                      key={a.action.id}
                      label={a.label}
                      className="group/ai px-2 text-ink"
                      disabled={!a.enabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => (a.action.id === "ai.ask" && onAIClick ? onAIClick() : void a.run())}
                    >
                      <Spark size={14} className="!size-3.5 text-agent transition-transform duration-[220ms] ease-[var(--ease-spring)] group-hover/ai:rotate-90" />
                      <span>{a.label}</span>
                    </FloatingBarButton>
                  ))}
                  {actionsIn("ai").length > 0 && !reader && <FloatingBarDivider />}
                  {!reader && (<>
                  <FloatingBarButton
                    label={`Turn into, now ${on?.block ?? "Text"}`}
                    className="gap-1 px-2 font-[450]"
                    aria-haspopup="listbox"
                    aria-expanded={menu === "turn"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openMenu("turn")}
                  >
                    <span>{on?.block ?? "Text"}</span>
                    <ChevronDown className="!size-3 text-ink-3" />
                  </FloatingBarButton>
                  <FloatingBarDivider />
                  {actionsIn("marks").map((a) => (
                    <MarkButton key={a.action.id} label={a.label} active={a.checked} disabled={!a.enabled} onClick={() => void a.run()}>
                      {a.icon ? <a.icon /> : a.label}
                    </MarkButton>
                  ))}
                  <MarkButton
                    label={on?.link ? "Remove link" : "Link"}
                    active={on?.link}
                    disabled={on?.codeBlock}
                    onClick={() => {
                      if (on?.link) editor.chain().focus().extendMarkRange("link").unsetLink().run()
                      else setMenu("link")
                    }}
                  >
                    <Link />
                  </MarkButton>
                  <FloatingBarDivider />
                  </>)}
                  {groupsNow.filter((g) => g.group !== "ai" && g.group !== "marks").flatMap((g) =>
                    g.actions.map((a) => (
                      <FloatingBarButton
                        key={a.action.id}
                        label={a.label}
                        disabled={!a.enabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => (a.action.id === "text.comment" ? comment() : void a.run())}
                      >
                        {a.icon ? <a.icon /> : a.label}
                      </FloatingBarButton>
                    )),
                  )}
                </>
              )}
            </FloatingBar>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={6}
            className={cn("content-float w-auto border-0 bg-transparent p-0 shadow-none")}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              if (!openedFrom.current) return
              const target = menuRef.current?.querySelector<HTMLElement>('[role="listbox"], [aria-pressed="true"], button')
              target?.focus()
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              openedFrom.current?.focus()
              openedFrom.current = null
            }}
          >
            <div ref={menuRef}>
            {menu === "turn" ? (
              <CommandList
                label="Turn into"
                header="Turn into"
                focusable
                className="w-60"
                items={turnItems}
                onSelect={(item) => {
                  BLOCK_TYPES.find((b) => b.id === item.id)?.run(editor)
                  setMenu(null)
                }}
              />
            ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </BubbleMenu>
    </React.Suspense>
  )
}

function MarkButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <FloatingBarButton label={label} active={!!active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </FloatingBarButton>
  )
}
