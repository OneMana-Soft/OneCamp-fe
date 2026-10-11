"use client"

import * as React from "react"
import { BubbleMenu, useEditorState, type Editor } from "@tiptap/react"

import { Bold, Check, ChevronDown, Code, Italic, Link, MessageSquarePlus, Strikethrough, Underline } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics"
import { CommandList, CommandTile, type CommandListItem } from "@/components/ui/CommandList"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils/helpers/cn"

import { BLOCK_TYPES, currentBlockLabel } from "./blockTypes"

/**
 * The doc's formatting, on selection (content.md D08). It replaces the
 * permanent toolbar row: a FloatingBar that floats 8 px above a non-empty
 * selection (flipping below near the top), with Ask AI, Turn into, the marks,
 * a text colour and Comment. Alt-F10 (or Mod-Shift-\) moves focus into it,
 * arrows walk it and Escape goes back to the text.
 *
 * It follows the editor itself (useEditorState with a selector), so typing
 * with nothing selected re-renders nothing here, and the doc's frame never
 * renders for it.
 */

/** Text colours: the camp hues' ink cuts, which read on the sheet in both themes. */
export const TEXT_COLOURS: Array<{ label: string; value: string | null; swatch: string }> = [
  { label: "Default", value: null, swatch: "var(--ink)" },
  { label: "Sky", value: "var(--camp-sky-ink)", swatch: "var(--camp-sky-ink)" },
  { label: "Moss", value: "var(--camp-moss-ink)", swatch: "var(--camp-moss-ink)" },
  { label: "Sun", value: "var(--camp-sun-ink)", swatch: "var(--camp-sun-ink)" },
  { label: "Berry", value: "var(--camp-berry-ink)", swatch: "var(--camp-berry-ink)" },
  { label: "Dusk", value: "var(--camp-dusk-ink)", swatch: "var(--camp-dusk-ink)" },
]

interface SelectionBarProps {
  editor: Editor
  onAIClick: () => void
  onComment?: () => void
  hide?: boolean
}

type Menu = null | "turn" | "colour" | "link"

export function SelectionBar({ editor, onAIClick, onComment, hide }: SelectionBarProps) {
  const barRef = React.useRef<HTMLDivElement>(null)
  const [menu, setMenu] = React.useState<Menu>(null)
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
        colour: (e.getAttributes("textStyle").color as string | undefined) ?? null,
        block: currentBlockLabel(e),
      } as const
    },
  })

  const shouldShow = React.useCallback(
    ({ editor: e, from, to }: { editor: Editor; from: number; to: number }) => {
      if (hide || !e.isEditable) return false
      if (to - from < 1) return false
      // A link has its own bubble, and a node selection (an image, an embed) its own actions.
      if (e.isActive("link") && to - from < 2) return false
      const sel = e.state.selection as unknown as { node?: unknown }
      if (sel.node) return false
      return true
    },
    [hide],
  )

  // Alt-F10 or Mod-Shift-\ from the text puts focus on the bar.
  React.useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    const onKey = (e: KeyboardEvent) => {
      const toBar = (e.altKey && e.key === "F10") || ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "\\" || e.key === "|"))
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

  return (
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
      <Popover open={menu === "turn" || menu === "colour"} onOpenChange={(o) => !o && setMenu(null)}>
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
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
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
                <FloatingBarButton
                  label="Ask AI"
                  className="group/ai px-2 text-ink"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onAIClick}
                >
                  <Spark size={14} className="!size-3.5 text-agent transition-transform duration-[220ms] ease-[var(--ease-spring)] group-hover/ai:rotate-90" />
                  <span>Ask AI</span>
                </FloatingBarButton>
                <FloatingBarDivider />
                <FloatingBarButton
                  label={`Turn into, now ${on?.block ?? "Text"}`}
                  className="gap-1 px-2 font-[450]"
                  aria-haspopup="listbox"
                  aria-expanded={menu === "turn"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMenu(menu === "turn" ? null : "turn")}
                >
                  <span>{on?.block ?? "Text"}</span>
                  <ChevronDown className="!size-3 text-ink-3" />
                </FloatingBarButton>
                <FloatingBarDivider />
                <MarkButton label="Bold" active={on?.bold} disabled={on?.codeBlock} onClick={() => editor.chain().focus().toggleBold().run()}>
                  <Bold />
                </MarkButton>
                <MarkButton label="Italic" active={on?.italic} disabled={on?.codeBlock} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <Italic />
                </MarkButton>
                <MarkButton label="Underline" active={on?.underline} disabled={on?.codeBlock} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                  <Underline />
                </MarkButton>
                <MarkButton label="Strikethrough" active={on?.strike} disabled={on?.codeBlock} onClick={() => editor.chain().focus().toggleStrike().run()}>
                  <Strikethrough />
                </MarkButton>
                <MarkButton label="Inline code" active={on?.code} disabled={on?.codeBlock} onClick={() => editor.chain().focus().toggleCode().run()}>
                  <Code />
                </MarkButton>
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
                <FloatingBarButton
                  label="Text colour"
                  aria-haspopup="dialog"
                  aria-expanded={menu === "colour"}
                  disabled={on?.codeBlock}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setMenu(menu === "colour" ? null : "colour")}
                >
                  <span className="relative inline-flex size-4 flex-col items-center justify-center text-ui-sm font-semibold leading-none">
                    A
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 h-[3px] w-3 rounded-[2px]"
                      style={{ background: on?.colour ?? "var(--ink-3)" }}
                    />
                  </span>
                </FloatingBarButton>
                {onComment ? (
                  <FloatingBarButton label="Comment" onMouseDown={(e) => e.preventDefault()} onClick={onComment}>
                    <MessageSquarePlus />
                  </FloatingBarButton>
                ) : null}
              </>
            )}
          </FloatingBar>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn("content-float w-auto border-0 bg-transparent p-0 shadow-none")}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {menu === "turn" ? (
            <CommandList
              label="Turn into"
              header="Turn into"
              className="w-60"
              items={turnItems}
              onSelect={(item) => {
                BLOCK_TYPES.find((b) => b.id === item.id)?.run(editor)
                setMenu(null)
              }}
            />
          ) : menu === "colour" ? (
            <div role="group" aria-label="Text colour" className="content-float grid grid-cols-6 gap-1 rounded-xl bg-pop p-2 shadow-e3">
              {TEXT_COLOURS.map((c) => {
                const active = (on?.colour ?? null) === c.value
                return (
                  <button
                    key={c.label}
                    type="button"
                    aria-label={c.label}
                    title={c.label}
                    aria-pressed={active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (c.value) editor.chain().focus().setColor(c.value).run()
                      else editor.chain().focus().unsetColor().run()
                      setMenu(null)
                    }}
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-md text-ui-sm font-semibold outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand",
                      active && "bg-press",
                    )}
                    style={{ color: c.swatch }}
                  >
                    A
                  </button>
                )
              })}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </BubbleMenu>
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
