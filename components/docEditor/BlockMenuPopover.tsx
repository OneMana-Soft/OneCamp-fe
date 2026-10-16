"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { Check, ChevronRight, Search } from "@/lib/icons"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import { cn } from "@/lib/utils/helpers/cn"
import { useEditionGate } from "@/components/docEditor/registry/gate"
import { useRegistryVersion } from "@/components/docEditor/registry/slots"
import type { BlockMenuRequest } from "@/components/minimal-tiptap/extensions/block-commands/menuRequest"
import { blocksOf, chosenLabel, menuRows, searchRows, type MenuRow } from "./blockMenuRows"

/** A menu row as the shared command list draws it: its icon, its keys, a chevron to a list, a check. */
function itemOf(row: MenuRow): CommandListItem {
  const Icon = row.icon
  return {
    id: row.id,
    label: row.danger ? <span className="text-danger-ink">{row.label}</span> : row.label,
    text: row.label,
    tile: Icon ? (
      <span className={cn("inline-flex size-5 shrink-0 items-center justify-center [&_svg]:size-4", row.danger ? "text-danger-ink" : "text-ink-3")}>
        <Icon aria-hidden="true" />
      </span>
    ) : undefined,
    kbd: row.keys,
    trailing: row.list ? (
      <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
    ) : row.checked ? (
      <Check aria-label="Current" className="size-3.5 shrink-0 text-ink-2" />
    ) : undefined,
  }
}

/** The menu on a wide screen: a popover where the handle (or the block's line) is. */
export default function BlockMenuPopover({ editor, docId, request, onClose }: { editor: Editor; docId: string; request: BlockMenuRequest; onClose(refocus: boolean): void }) {
  const gate = useEditionGate()
  useRegistryVersion()
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const [list, setList] = React.useState<{ kind: "turn" | "dir"; top: number; side: "right" | "left" } | null>(null)
  const [listActive, setListActive] = React.useState(0)
  const [input, setInput] = React.useState<HTMLInputElement | null>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  const mainList = React.useRef<CommandListHandle>(null)
  const sideList = React.useRef<CommandListHandle>(null)
  const rows = React.useMemo(() => menuRows(editor, docId, gate, request, onClose), [editor, docId, gate, request, onClose])
  const shown = React.useMemo(() => searchRows(rows, query), [rows, query])
  const listRows = list ? rows[list.kind] : []
  const blocks = blocksOf(editor, request) ?? []
  const anchor = React.useMemo(
    () => ({ getBoundingClientRect: () => new DOMRect(request.anchor.left, request.anchor.top, 1, Math.max(1, request.anchor.bottom - request.anchor.top)) }),
    [request.anchor],
  )

  React.useEffect(() => setActive(0), [query])

  /** Opens a row's list beside the menu, level with the row (the highlighted one). */
  const openList = (row: MenuRow) => {
    if (!row.list) return
    const box = panel.current?.getBoundingClientRect()
    const r = panel.current?.querySelector('[role="option"][data-active]')?.getBoundingClientRect()
    if (!box || !r) return
    const side = box.right + 248 > window.innerWidth - 8 ? "left" : "right"
    if (list?.kind !== row.list) setListActive(Math.max(0, rows[row.list].findIndex((x) => x.checked)))
    setList({ kind: row.list, top: r.top - box.top - 4, side })
  }
  const pick = (row: MenuRow | undefined) => {
    if (!row) return
    if (row.list) openList(row)
    else row.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const inList = !!list
    const n = inList ? listRows.length : shown.length
    const set = inList ? setListActive : setActive
    switch (e.key) {
      case "Home":
      case "End":
        e.preventDefault()
        set(e.key === "Home" ? 0 : Math.max(0, n - 1))
        return
      case "ArrowRight":
        if (!inList && shown[active]?.list) {
          e.preventDefault()
          openList(shown[active])
        }
        return
      case "ArrowLeft":
        if (inList) {
          e.preventDefault()
          setList(null)
        }
        return
      case "Escape":
        e.preventDefault()
        if (inList) setList(null)
        else onClose(true)
        return
      case "Tab":
        // A menu is left with Tab, back to the doc.
        e.preventDefault()
        onClose(true)
        return
    }
    // ↑ ↓ and ↩: the command list's own.
    if ((inList ? sideList : mainList).current?.onKeyDown(e)) e.preventDefault()
  }

  return (
    <Popover open onOpenChange={(open) => !open && onClose(false)}>
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        data-block-menu=""
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          input?.focus()
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="content-float relative w-[288px] overflow-visible p-0 pop-surface"
      >
        <div ref={panel} className="flex max-h-[min(70vh,520px)] flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
            <Search aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <input
              ref={setInput}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setList(null)
              }}
              onKeyDown={onKeyDown}
              placeholder="Search actions"
              aria-label="Search actions"
              // aria-controls and aria-activedescendant come from the command list (useAnnounceList).
              // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
              role="combobox"
              aria-expanded="true"
              className="h-full min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
            />
            {!query ? <span className="max-w-[96px] shrink-0 truncate text-meta text-ink-3">{chosenLabel(editor, blocks, gate)}</span> : null}
          </div>
          <CommandList
            ref={mainList}
            label="Block actions"
            items={shown.map(itemOf)}
            query={query}
            activeIndex={active}
            onActiveIndexChange={(i) => {
              setActive(i)
              // A pointer on a row with a list opens it, as Notion's menu does.
              if (shown[i]?.list) requestAnimationFrame(() => openList(shown[i]))
              else setList(null)
            }}
            onSelect={(item) => pick(shown.find((r) => r.id === item.id))}
            comboboxFor={list ? null : input}
            empty={<p className="px-3 py-3 text-ui-sm text-ink-2">No actions match “{query.trim()}”</p>}
            maxHeight={440}
            // The popover is the surface: the list draws only its rows.
            className="min-h-0 flex-1 !w-full !rounded-none !bg-transparent !shadow-none"
          />
        </div>
        {list ? (
          <div
            data-block-menu-list=""
            className={cn("absolute", list.side === "right" ? "left-[calc(100%+4px)]" : "right-[calc(100%+4px)]")}
            style={{ top: list.top }}
          >
            <CommandList
              ref={sideList}
              label={list.kind === "turn" ? "Turn into" : "Text direction"}
              items={listRows.map(itemOf)}
              activeIndex={listActive}
              onActiveIndexChange={setListActive}
              onSelect={(item) => pick(listRows.find((r) => r.id === item.id))}
              comboboxFor={input}
              className="w-[240px]"
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
