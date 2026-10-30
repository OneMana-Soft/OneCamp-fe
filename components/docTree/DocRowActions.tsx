"use client"

// A docs tree row's "+" and "⋯" (fluid-06, Fix 1). Each row reads its own
// state: whether its menu is open (the tree's store) and whether a page is
// being made inside it (useMakingDoc), so one row's menu or spinner renders
// that row's actions, not the tree's. The menu itself (a Radix dropdown, a
// sheet on a phone: some thirty components a row) mounts the first time it is
// asked for; until then "⋯" is a plain button that asks for it. A row's
// handlers come from the tree through ctx, read as they act.
//
// The menu's code is a chunk of its own (fluid-06, the cold tree): the tree is
// in every page's sidebar, and the menu, its swatches and its actions were
// half of what the tree's first load fetched. It comes ahead of the press that
// opens it (warmRowMenu): a pointer resting on a row, focus from the keyboard,
// "⋯"'s pointerdown, the phone's Pages sheet on the docs home's quiet. Once
// it's in, the menu opens on the press itself, with no frame between; a press
// that comes first keeps "⋯" as it is until the code lands, then opens it.

import * as React from "react"

import type { DocRowMenuProps, RowActs } from "@/components/docTree/DocRowMenu"
import { useMakingDoc } from "@/components/doc/useCreateDoc"
import { useTreeSelect, type TreeStore } from "@/components/tree/treeStore"
import { holdsChildren } from "@/lib/docs/docNode"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { Loader2, MoreHorizontal, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocTreeRow } from "@/services/docGraphService"

/**
 * "⋯" before its menu is drawn: asks for the menu, and its pointerdown fetches
 * the menu's code. Drawn by a call, not as a component: a row renders no more
 * components for it (the sheet's budget counts each).
 */
function moreButton(title: string, onAsk: () => void) {
  return (
    <button
      type="button"
      aria-label={`More for ${title}`}
      aria-haspopup="menu"
      tabIndex={-1}
      data-doc-row-menu=""
      data-touch-target=""
      onPointerDown={warmRowMenu}
      onClick={(e) => {
        // The row opens the doc; the button only asks for its menu.
        e.stopPropagation()
        e.preventDefault()
        onAsk()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-3 outline-none hover:bg-[var(--press)] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
    >
      <MoreHorizontal className="size-3.5" aria-hidden="true" />
    </button>
  )
}

const rowMenu = lazyPart<DocRowMenuProps>(() => import("@/components/docTree/DocRowMenu").then((m) => m.DocRowMenu), {
  // While its code comes, "⋯" stays as it is.
  placeholder: (p) => moreButton(p.doc.title || "Untitled", () => p.onOpenChange?.(true)),
  // Its code couldn't come: "⋯" asks for it again.
  failed: (p) => moreButton(p.doc.title || "Untitled", p.retry),
})

/** Fetches a row menu's code (once) ahead of the press that opens it. */
export function warmRowMenu(): void {
  void rowMenu.warm()
}

/** What a row's actions need of their tree, kept current by the tree. */
export interface RowCtx {
  store: TreeStore
  addInside: (row: DocTreeRow) => void
  actsFor: (row: DocTreeRow) => RowActs
}

export const DocRowActions = React.memo(function DocRowActions({ row, ctx }: { row: DocTreeRow; ctx: React.MutableRefObject<RowCtx> }) {
  const store = ctx.current.store
  const menuOpen = useTreeSelect(store, (s) => s.menuFor === row.id)
  const making = useMakingDoc()
  // Once asked for, the menu stays: its trigger keeps focus's way back.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    if (menuOpen) setMounted(true)
  }, [menuOpen])

  const canEdit = row.canEdit !== false
  const title = row.title || "Untitled"
  const doc = React.useMemo(() => ({ id: row.id, title: row.title, icon: row.node.icon }), [row])
  const node = React.useMemo(() => ({ kind: row.node.node_kind, color: row.node.color, linkUrl: row.node.link_url, file: row.node.file }), [row])
  // Which actions there are is the row's kind's; what each does is the tree's latest.
  const act = React.useMemo(() => {
    const now = ctx.current.actsFor(row)
    const out: RowActs = {}
    for (const k of Object.keys(now) as Array<keyof RowActs>) if (now[k]) out[k] = () => ctx.current.actsFor(row)[k]?.()
    return out
  }, [row, ctx])
  const addInside = React.useCallback(() => ctx.current.addInside(row), [row, ctx])
  const setOpen = React.useCallback((open: boolean) => store.set({ menuFor: open ? row.id : null }), [store, row.id])
  const ask = React.useCallback(() => setOpen(true), [setOpen])

  // "+" and "⋯" take no room until the row is pointed at or has focus, so a
  // title has the row's whole width, as Notion's do: kept in place and faded,
  // they cut every title 48 px short. Its menu open, or a page being added
  // inside it, keeps them there.
  const held = menuOpen || making === `tree:${row.id}`
  return (
    // Under a finger (the phone's Pages sheet) each takes a tap across 44 px,
    // and the two stand apart so neither takes the other's (phone.css F3, F3b).
    <span data-tree-actions="" data-touch-group="20" className={cn("items-center gap-0.5", held ? "flex" : "hidden group-hover:flex group-focus-within:flex [@media(hover:none)]:flex")}>
      {canEdit && holdsChildren(row.node.node_kind) && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Add a page inside ${title}`}
          title="Add a page inside"
          disabled={!!making}
          data-tree-add=""
          data-touch-target=""
          onClick={(e) => {
            e.stopPropagation()
            addInside()
          }}
          className="inline-flex size-5 items-center justify-center rounded-sm text-ink-3 outline-none hover:bg-[var(--press)] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
        >
          {making === `tree:${row.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
        </button>
      )}
      {mounted || menuOpen ? (
        <rowMenu.Part doc={doc} canEdit={canEdit} node={node} act={act} onAddInside={addInside} open={menuOpen} onOpenChange={setOpen} />
      ) : (
        moreButton(title, ask)
      )}
    </span>
  )
})
