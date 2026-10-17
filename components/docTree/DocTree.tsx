"use client"

// One space's page tree (docs programme B5, structure.md P0.4): the
// workspace's pages, the person's private ones, the ones shared with them, or
// a project's or team's. A3's TreeView draws it and moves pages by drag and by
// ⌥⇧ and an arrow; this file says what a doc row is: its icon, "+" to add a
// page inside, "⋯" for its menu, 28 px tall, and children read a level at a
// time, eight to a level until "Show more".

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { TreeView } from "@/components/tree/TreeView"
import { useTree } from "@/components/tree/useTree"
import type { TreeMove } from "@/components/tree/treeDnd"
import { DocIcon } from "@/components/docEditor/DocIcon"
import { DocRowMenu } from "@/components/docTree/DocRowMenu"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { prefetchDocOnIntent, DOC_INTENT_MS } from "@/components/navigationBar/desktop/IntentLink"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { moveReason, planMove } from "@/lib/docMove"
import { docHue } from "@/lib/docLook"
import { Loader2, Plus } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { docTreeAdapter, treeMoveTarget, type DocTreeRow } from "@/services/docGraphService"
import type { DocSpace } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"

/** How many pages a level shows before "Show N more". */
export const TREE_CAP = 8

// One adapter per space, for the page's life: every place showing a space's
// tree reads the same cached levels.
const adapters = new Map<DocSpace, ReturnType<typeof docTreeAdapter>>()
export function adapterFor(space: DocSpace) {
  let a = adapters.get(space)
  if (!a) {
    a = docTreeAdapter(space)
    adapters.set(space, a)
  }
  return a
}

/** "2 pages you can't open": counted, never named (I12). */
export const hiddenLabel = (n: number) => (n === 1 ? "1 page you can't open" : `${n} pages you can't open`)

/** The doc a path is on, if it is one. Pure. */
export function docIdOfPath(pathname: string | null | undefined): string | null {
  return /^\/app\/doc\/([0-9a-zA-Z-]{8,})/.exec(pathname ?? "")?.[1] ?? null
}

/** A move the server refused, or couldn't check: said, never silent. */
const notMoved = (e: unknown) => toast({ title: "The page didn't move", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })

export function DocTree({
  space,
  label,
  onOpened,
  dense = true,
  cap = TREE_CAP,
}: {
  space: DocSpace
  label: string
  onOpened?: () => void
  dense?: boolean
  /** How many pages a level shows before "Show more": eight in the sidebar, more on a page. */
  cap?: number
}) {
  const adapter = adapterFor(space)
  const tree = useTree<DocTreeRow>(adapter, { storageKey: `docTree.open.${space}`, pageSize: cap, onMoveError: notMoved })
  const router = useRouter()
  const activeId = docIdOfPath(usePathname())
  const { create, busy } = useCreateDoc()
  const { setOpen, move } = tree
  const confirm = useConfirm()

  // A page dragged or keyed somewhere is planned as every move is (planMove,
  // PROGRAM §3.2): it keeps its own access, and a move that would still
  // change who can open it (into another project's or team's space, or out
  // of one) asks first, and is made only when told.
  const plannedMove = React.useCallback(
    async (m: TreeMove, from: string | null, node: DocTreeRow, announce?: string) => {
      let plan: Awaited<ReturnType<typeof planMove>>
      try {
        plan = await planMove(treeMoveTarget(m, space), false)
      } catch (e) {
        notMoved(e)
        return
      }
      if (!plan.ask) return move(m, from, node, announce)
      const name = node.title || "Untitled"
      confirm({
        title: plan.preview.summary,
        description: moveReason(plan.preview, name) ?? `Moving “${name}” changes who can open it.`,
        confirmText: "Move",
        onConfirm: () => move(m, from, node, announce),
      })
    },
    [move, space, confirm],
  )

  const addInside = React.useCallback(
    (row: DocTreeRow) => {
      void create({ parentId: row.id, parentPrivate: row.node.private, busyKey: `tree:${row.id}` }).then((id) => {
        if (id) setOpen(row.id, true)
      })
    },
    [create, setOpen],
  )

  // A pointer resting on a row for a moment is about to open it: its page and
  // its live copy are fetched ahead (A2), as a sidebar link does.
  const rest = React.useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-tree-id]")?.dataset.treeId
    if (!id || rest.current?.id === id) return
    if (rest.current) clearTimeout(rest.current.timer)
    rest.current = {
      id,
      timer: setTimeout(() => {
        prefetchDocOnIntent(id)
        router.prefetch(`${app_doc_path}/${id}`)
      }, DOC_INTENT_MS),
    }
  }
  const onPointerLeave = () => {
    if (rest.current) clearTimeout(rest.current.timer)
    rest.current = null
  }
  React.useEffect(() => onPointerLeave, [])

  // A row's menu without a pointer: the menu key or ⇧F10 on the row with
  // focus, as a desktop app's context menu; a right click on the row too.
  const [menuFor, setMenuFor] = React.useState<string | null>(null)
  const rowOf = (el: EventTarget | null) => (el as HTMLElement | null)?.closest<HTMLElement>("[role=treeitem][data-tree-id]")?.dataset.treeId ?? null
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return
    const id = rowOf(e.target)
    if (!id) return
    e.preventDefault()
    setMenuFor(id)
  }
  const onContextMenu = (e: React.MouseEvent) => {
    const id = rowOf(e.target)
    if (!id) return
    e.preventDefault()
    setMenuFor(id)
  }

  return (
    // In the sidebar its rows are 28 px: a tree is denser than the places
    // above it. On a page (a project's docs) they are 36, as a list's are.
    <div
      data-doc-tree={space}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
      onKeyDownCapture={onKeyDown}
      onContextMenu={onContextMenu}
      className={dense ? "[&_.shell-row]:h-7" : "[&_.shell-row]:h-9"}
    >
      <TreeView
        tree={{ ...tree, move: plannedMove }}
        label={label}
        placeholder="Untitled"
        hiddenLabel={hiddenLabel}
        emptyLabel="No pages inside"
        icon={(row) => <DocIcon icon={row.node.icon} id={row.id} size={16} />}
        hue={(row) => docHue(row.id, row.node.icon)}
        activeId={activeId}
        onOpen={(row) => {
          router.push(`${app_doc_path}/${row.id}`)
          onOpened?.()
        }}
        movedLabel={(row) => `Moved ${row.title || "Untitled"}`}
        actions={(row) => {
          const canEdit = row.canEdit !== false
          const doc = { id: row.id, title: row.title, icon: row.node.icon }
          // "+" and "⋯" take no room until the row is pointed at or has
          // focus, so a title has the row's whole width, as Notion's do: kept
          // in place and faded, they cut every title 48 px short. Its menu
          // open, or a page being added inside it, keeps them there.
          const held = menuFor === row.id || busy === `tree:${row.id}`
          return (
            <span data-tree-actions="" className={cn("items-center gap-0.5", held ? "flex" : "hidden group-hover:flex group-focus-within:flex [@media(hover:none)]:flex")}>
              {canEdit && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Add a page inside ${row.title || "Untitled"}`}
                  title="Add a page inside"
                  disabled={!!busy}
                  data-tree-add=""
                  onClick={(e) => {
                    e.stopPropagation()
                    addInside(row)
                  }}
                  className="inline-flex size-5 items-center justify-center rounded-sm text-ink-3 outline-none hover:bg-[var(--press)] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                >
                  {busy === `tree:${row.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                </button>
              )}
              <DocRowMenu
                doc={doc}
                canEdit={canEdit}
                onAddInside={() => addInside(row)}
                open={menuFor === row.id}
                onOpenChange={(o) => setMenuFor(o ? row.id : null)}
              />
            </span>
          )
        }}
      />
    </div>
  )
}
