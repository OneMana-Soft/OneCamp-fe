"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The content area's pop list (content.md §1.5): the slash menu, mentions,
 * references, the column type picker, the formula autocomplete and the
 * booking page's time zones. `pop`, e3, r12, 4 px padding; groups with 24 px
 * sentence-case headers; 32 px rows with a 24 px tile, the label and kbd
 * chips; and one highlight pill that slides between rows (`menu-cursor`)
 * instead of each row flashing. The highlighted row's description sits in a
 * footer, so rows stay one line.
 *
 * Keys come from wherever focus is (a Tiptap suggestion keeps focus in the
 * editor), so the list exposes `onKeyDown` on its ref: ↑ ↓ wrap, Enter and
 * Tab pick. It returns true when it handled the key.
 */
export interface CommandListItem {
  id: string
  /** What the row reads; a string gets query matching for free. */
  label: React.ReactNode
  /** Plain text for matching and the accessible name, when label isn't a string. */
  text?: string
  group?: string
  /** The 24 px tile (or avatar) before the label. */
  tile?: React.ReactNode
  /** Shortcut chips on the right, e.g. ["##"]. */
  kbd?: string[]
  /** Trailing content (a tag, a check) instead of kbd chips. */
  trailing?: React.ReactNode
  /** One line, shown in the footer while this row is highlighted. */
  description?: string
  /** A second line under the label, always shown (an agent's "Agent · acts for you"); the row grows to 44px. */
  meta?: React.ReactNode
  disabled?: boolean
  /** The tooltip of a disabled row, e.g. "Not inside a table". */
  disabledReason?: string
}

export interface CommandListHandle {
  onKeyDown: (event: KeyboardEvent | React.KeyboardEvent) => boolean
}

export interface CommandListProps {
  items: CommandListItem[]
  onSelect: (item: CommandListItem) => void
  /** The list's accessible name. */
  label: string
  /** A 28 px header row, e.g. "/ head" or "Blocks". */
  header?: React.ReactNode
  /** The query, so matched characters render at 590. */
  query?: string
  /** Group headers' leading glyphs, by group name (the AI spark). */
  groupIcons?: Record<string, React.ReactNode>
  /** Shown when there are no items. */
  empty?: React.ReactNode
  /** Rows after the items that aren't items (an "Ask AI to write…" row). */
  after?: React.ReactNode
  /** Show the footer with the highlighted row's description and key hints. */
  footer?: boolean | React.ReactNode
  className?: string
  /** Max height of the scrolling rows, in px. */
  maxHeight?: number
  /** Controlled highlight. */
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
  /** Rows at 36 px instead of 32 (the AI panel, the relation picker). */
  roomy?: boolean
}

/** Renders text with the query's characters (in order, a fuzzy match) at 590. */
export function highlightMatch(text: string, query: string | undefined): React.ReactNode {
  const q = (query || "").trim().toLowerCase()
  if (!q) return text
  const lower = text.toLowerCase()
  const at = lower.indexOf(q)
  if (at >= 0) {
    return (
      <>
        {text.slice(0, at)}
        <span className="font-semibold">{text.slice(at, at + q.length)}</span>
        {text.slice(at + q.length)}
      </>
    )
  }
  // In-order characters.
  const out: React.ReactNode[] = []
  let qi = 0
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && lower[i] === q[qi]) {
      out.push(
        <span key={i} className="font-semibold">
          {text[i]}
        </span>,
      )
      qi++
    } else out.push(text[i])
  }
  return qi === q.length ? <>{out}</> : text
}

/** True when every character of the query appears in order in the text. */
export function fuzzyMatch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("kbd", className)}>{children}</kbd>
}

export const CommandList = React.forwardRef<CommandListHandle, CommandListProps>(function CommandList(
  {
    items,
    onSelect,
    label,
    header,
    query,
    groupIcons,
    empty,
    after,
    footer = false,
    className,
    maxHeight = 384,
    activeIndex,
    onActiveIndexChange,
    roomy,
  },
  ref,
) {
  const [ownIndex, setOwnIndex] = React.useState(0)
  const index = activeIndex ?? ownIndex
  const setIndex = React.useCallback(
    (i: number) => {
      if (activeIndex === undefined) setOwnIndex(i)
      onActiveIndexChange?.(i)
    },
    [activeIndex, onActiveIndexChange],
  )
  const listId = React.useId()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const [cursor, setCursor] = React.useState<{ y: number; h: number } | null>(null)

  // A new item set starts at the top.
  const signature = items.map((i) => i.id).join("|")
  React.useEffect(() => {
    if (activeIndex === undefined) setOwnIndex(0)
  }, [signature, activeIndex])

  const enabled = React.useCallback((i: number) => !!items[i] && !items[i].disabled, [items])

  const move = React.useCallback(
    (dir: 1 | -1) => {
      if (!items.length) return
      let i = index
      for (let n = 0; n < items.length; n++) {
        i = (i + dir + items.length) % items.length
        if (enabled(i)) break
      }
      setIndex(i)
    },
    [enabled, index, items.length, setIndex],
  )

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowDown") {
          move(1)
          return true
        }
        if (event.key === "ArrowUp") {
          move(-1)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[index]
          if (item && !item.disabled) {
            onSelect(item)
            return true
          }
          return false
        }
        return false
      },
    }),
    [index, items, move, onSelect],
  )

  // The cursor pill follows the highlighted row (one element, translateY).
  React.useLayoutEffect(() => {
    const row = rowRefs.current[index]
    if (!row) {
      setCursor(null)
      return
    }
    setCursor({ y: row.offsetTop, h: row.offsetHeight })
    const box = scrollRef.current
    if (box) {
      if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 28
      else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)
        box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 4
    }
  }, [index, signature])

  let lastGroup: string | undefined
  const active = items[index]
  const activeId = active ? `${listId}-${active.id}` : undefined

  return (
    <div
      className={cn("content-float flex w-[304px] flex-col overflow-hidden pop-surface", className)}
      data-command-list=""
    >
      {header ? (
        <div className="flex h-7 shrink-0 items-center px-3 pt-1 text-meta font-medium text-ink-3">{header}</div>
      ) : null}
      <div
        ref={scrollRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={activeId}
        className="relative overflow-y-auto overscroll-contain p-1"
        style={{ maxHeight }}
      >
        {cursor && items.length ? (
          <span
            aria-hidden="true"
            data-menu-cursor=""
            className="content-menu-cursor pointer-events-none absolute inset-x-1 top-0 rounded-lg bg-press"
            style={{ height: cursor.h, transform: `translateY(${cursor.y}px)` }}
          />
        ) : null}
        {items.length === 0 && empty ? <div className="relative px-2 py-3 text-ui-sm text-ink-2">{empty}</div> : null}
        {items.map((item, i) => {
          const groupHeader =
            item.group && item.group !== lastGroup ? (
              <div
                key={`g-${item.group}`}
                role="presentation"
                className="relative flex h-6 items-center gap-1 px-2 text-meta font-medium text-ink-3 [&_svg]:size-3"
              >
                {groupIcons?.[item.group]}
                {item.group}
              </div>
            ) : null
          lastGroup = item.group
          const text = item.text ?? (typeof item.label === "string" ? item.label : undefined)
          const isActive = i === index
          return (
            <React.Fragment key={item.id}>
              {groupHeader}
              <div
                ref={(el) => {
                  rowRefs.current[i] = el
                }}
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={isActive}
                aria-disabled={item.disabled || undefined}
                aria-label={text}
                title={item.disabled ? item.disabledReason : undefined}
                data-active={isActive || undefined}
                onMouseMove={() => {
                  if (!isActive && !item.disabled) setIndex(i)
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!item.disabled) onSelect(item)
                }}
                className={cn(
                  "group/row relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 text-ui font-[450] text-ink-2",
                  item.meta ? "h-11" : roomy ? "h-9" : "h-8",
                  isActive && "text-ink",
                  item.disabled && "cursor-default text-ink-4",
                )}
              >
                {item.tile ? (
                  <span className="inline-flex shrink-0 transition-transform duration-[220ms] ease-[var(--ease-spring)] group-data-[active]/row:scale-[1.06]">
                    {item.tile}
                  </span>
                ) : null}
                {item.meta ? (
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{typeof item.label === "string" ? highlightMatch(item.label, query) : item.label}</span>
                    <span data-row-meta="" className="truncate text-meta text-ink-3">{item.meta}</span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    {typeof item.label === "string" ? highlightMatch(item.label, query) : item.label}
                  </span>
                )}
                {item.trailing}
                {item.kbd?.length ? (
                  <span className="flex shrink-0 gap-1">
                    {item.kbd.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                ) : null}
              </div>
            </React.Fragment>
          )
        })}
        {after}
      </div>
      {footer ? (
        <div className="flex h-8 shrink-0 items-center gap-2 rounded-b-xl bg-sunken px-3 text-meta text-ink-3">
          <span className="min-w-0 flex-1 truncate">{footer === true ? active?.description ?? "" : footer}</span>
          <span className="flex shrink-0 gap-1" aria-hidden="true">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <Kbd>⏎</Kbd>
          </span>
        </div>
      ) : null}
    </div>
  )
})

/** A 24 px tile on --sunken with an inset line, for a basic row. */
export function CommandTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md bg-sunken text-ink-2 ring-1 ring-inset ring-line [&_svg]:size-3.5",
        className,
      )}
    >
      {children}
    </span>
  )
}
