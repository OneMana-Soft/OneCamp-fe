"use client"

// One space's page tree (docs programme B5, structure.md P0.4): the
// workspace's pages, the person's private ones, the ones shared with them, or
// a project's or team's. A3's TreeView draws it and moves pages by drag and by
// ⌥⇧ and an arrow; this file says what a doc row is: its icon, "+" to add a
// page inside, "⋯" for its menu, 28 px tall, and children read a level at a
// time, eight to a level until "Show more".
//
// Docs & Files (docs F1b) puts folders, files and links in the tree. Each
// kind wears its mark (components/docFiles/NodeMark) and a line of detail (a
// link's site, a file's size), a colour as its tile or a dot, and opens its
// own way: a page and a folder at their address (a folder's facts put where
// its page looks first, so it opens as a folder at once), a file in its
// preview, a link in a new tab. "+" only on what holds others. On a page (not
// the sidebar) a row ends with who made its last change and when. Where the tree
// is a project's Docs & Files or a folder's contents (selectable), rows are
// chosen together and coloured or moved at once from the bulk bar; files
// dropped on a folder upload into it, and on the rest of the tree into the
// tree's own place (dropRoot).
//
// Rows that hold (fluid-06, Fix 1): what the tree hands its rows (marks,
// details, actions, what opening does) is the same function for the tree's
// life, reading the tree's latest handlers through a ref (live), so a change
// here never renders the rows again. The doc on screen reaches the rows
// through the tree's store (ActiveSync): an address change renders the two
// current places, not the tree. A row's "+" and "⋯" read their own state
// (DocRowActions), and its menu mounts when it is first asked for.
//
// What only some trees use is fetched when it's about to be (fluid-06, the
// cold tree; the sidebar's tree is in every page's first load): a row's menu,
// the bulk bar and a file's preview when a pointer rests on a row or the
// keyboard comes in (warmRowParts), a file's preview as its row is pressed,
// the upload's code when files are dragged over (components/docFiles/dropFiles).

import * as React from "react"
import { usePathname } from "next/navigation"
import { useAppRouter } from "@/lib/navigation/appRouter"

import { TreeView } from "@/components/tree/TreeView"
import { pauseReadAheadWhileOpening, useTree } from "@/components/tree/useTree"
import { useTreeSelection } from "@/components/tree/treeSelection"
import type { TreeMove } from "@/components/tree/treeDnd"
import type { RowActs } from "@/components/docTree/DocRowMenu"
import { DocRowActions, warmRowMenu, type RowCtx } from "@/components/docTree/DocRowActions"
import type { TreeStore } from "@/components/tree/treeStore"
import { ColourDot, NodeMark, markOfRow, nodeHue } from "@/components/docFiles/NodeMark"
import { DocIcon } from "@/components/docEditor/DocIcon"
import type { MoveItem, MoveStop } from "@/lib/docMove"
import { openLink, seedNodeInfo } from "@/components/docFiles/fileActions"
import { prefetchUploads, uploadLater } from "@/components/docFiles/dropFiles"
import { carriesFiles } from "@/lib/utils/file/carriesFiles"
import { useFilePicker } from "@/components/docFiles/useFilePicker"
import { useNodeDialogs, warmFilePreview } from "@/components/docFiles/useNodeDialogs"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { prefetchDocOnIntent, DOC_INTENT_MS } from "@/components/navigationBar/desktop/IntentLink"
import { toast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { whenIdle } from "@/lib/whenIdle"
import { lastInputWasPointer, watchInputModality } from "@/lib/ui/inputModality"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { moveReason, planMove } from "@/lib/docMove"
import { linkSite, openingOf } from "@/lib/docs/docNode"
import { displayNameOf } from "@/lib/personName"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { docTreeAdapter, treeMoveTarget, type DocTreeRow } from "@/services/docGraphService"
import type { UploadPlace } from "@/services/docFilesService"
import type { DocGraphPerson, DocSpace } from "@/types/docGraph"
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

type BulkBarProps = React.ComponentProps<typeof import("@/components/docFiles/BulkBar").BulkBar>
const Nothing = () => null
/** The bar for rows chosen together, a chunk of its own: the sidebar's trees never choose rows. */
const bulkBar = lazyPart<BulkBarProps>(() => import("@/components/docFiles/BulkBar").then((m) => m.BulkBar), { placeholder: Nothing, failed: Nothing })

/** A space's top, as Move to… names it. */
const topName = (space: DocSpace, label: string) => (space === "workspace" ? "Workspace" : space === "private" ? "Private" : label)

/**
 * "Maya · 3h ago": who made a row's last change (the first word of their
 * shown name, as the docs home's rows say it) and when; the time alone when
 * no one is named, and nothing without a time. Their whole name and the date
 * are its tooltip.
 */
function edited(by: DocGraphPerson | undefined, at: string | undefined): React.ReactNode {
  const when = at ? new Date(at) : null
  if (!at || !when || isNaN(when.getTime())) return null
  const name = by ? displayNameOf(by) : ""
  return (
    <span data-edited="" title={[name, fullDateTime(when)].filter(Boolean).join(" · ")}>
      {name ? `${name.split(/\s+/)[0]} · ` : null}
      <time dateTime={at}>{agoOrDate(when)}</time>
    </span>
  )
}

/** The doc on screen, into a tree's store: an address change renders its two current places. */
function ActiveSync({ store }: { store: TreeStore }) {
  const active = docIdOfPath(usePathname())
  React.useEffect(() => store.set({ active }), [store, active])
  return null
}

export const DocTree = React.memo(function DocTree({
  space,
  label,
  onOpened,
  dense = true,
  cap = TREE_CAP,
  selectable = false,
  root,
  moveStart,
  dropRoot,
}: {
  space: DocSpace
  label: string
  onOpened?: () => void
  dense?: boolean
  /** How many pages a level shows before "Show more": eight in the sidebar, more on a page. */
  cap?: number
  /** Rows can be chosen several at once, and coloured or moved together (a project's Docs & Files, a folder's contents). */
  selectable?: boolean
  /** The tree starts at a folder's contents, not the space's top. */
  root?: { id: string; parent?: string | null }
  /** Where Move to… starts: the way down to the tree's top, the top first. */
  moveStart?: MoveStop[]
  /** Files dropped on the tree, but not on a folder in it, upload here. */
  dropRoot?: { place: UploadPlace; label: string }
}) {
  const adapter = adapterFor(space)
  const tree = useTree<DocTreeRow>(adapter, { storageKey: `docTree.open.${root ? `folder:${root.id}` : space}`, pageSize: cap, onMoveError: notMoved })
  const router = useAppRouter()
  const { create } = useCreateDoc()
  const { setOpen, move, store } = tree
  const confirm = useConfirm()
  const selection = useTreeSelection()
  const dialogs = useNodeDialogs()
  const picker = useFilePicker()
  // The rows on screen, with the row each sits in: what a selection's bulk
  // actions and Move to… need to know of them.
  const seen = React.useRef(new Map<string, { row: DocTreeRow; parent: string | null }>())
  const box = React.useRef<HTMLDivElement>(null)

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

  // Each kind opens its own way (lib/docs/docNode openingOf).
  const preview = (row: DocTreeRow, versions = false) =>
    dialogs.open({ kind: "preview", file: { id: row.id, title: row.title, facts: row.node.file, canEdit: row.canEdit !== false }, versions })
  const openRow = (row: DocTreeRow) => {
    switch (openingOf(row.node.node_kind)) {
      case "preview":
        return preview(row)
      case "external":
        return openLink(row.node.link_url)
      case "folder":
        seedNodeInfo(row.node)
        break
    }
    // The page asks for its own data and code: no tree reads ahead meanwhile.
    pauseReadAheadWhileOpening()
    router.push(`${app_doc_path}/${row.id}`)
    onOpened?.()
  }

  // Move to… starts at the tree's top: a folder's way down, or the space's.
  const start: MoveStop[] = moveStart ?? [{ id: null, title: topName(space, label) }]
  // Pages shared with this person are a view, not a place things go.
  const moves = space !== "shared"
  // Each with the row it follows among the siblings that stay, in the rows'
  // order, so Move to…'s Undo puts a run back as it was (lib/docMove).
  const moveRows = (ids: string[]) => {
    const moving = new Set(ids)
    const staying = new Map<string | null, string>()
    const items: MoveItem[] = []
    for (const el of box.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []) {
      const s = el.dataset.treeId ? seen.current.get(el.dataset.treeId) : undefined
      if (!s) continue
      if (moving.has(s.row.id)) items.push({ id: s.row.id, title: s.row.title, from: s.parent, after: staying.get(s.parent) ?? null })
      else staying.set(s.parent, s.row.id)
    }
    if (items.length) dialogs.open({ kind: "move", items, space, start })
  }

  const actsFor = (row: DocTreeRow): RowActs => {
    const kind = row.node.node_kind
    return {
      preview: kind === "file" ? () => preview(row) : undefined,
      versions: kind === "file" ? () => preview(row, true) : undefined,
      replace: kind === "file" ? () => dialogs.open({ kind: "replace", file: { id: row.id, title: row.title } }) : undefined,
      move: moves ? () => moveRows([row.id]) : undefined,
      colourSheet: () => dialogs.open({ kind: "colour", ids: [row.id], current: row.node.color, title: row.title }),
      upload: kind === "folder" ? () => picker.pick({ parent: row.id }, row.title || "Untitled") : undefined,
      addLink: kind === "folder" ? () => dialogs.open({ kind: "link", place: { parentId: row.id, parentPrivate: row.node.private } }) : undefined,
      select: selectable
        ? () => {
            selection.setMode(true)
            if (!selection.selected.has(row.id)) selection.onSelect(row.id, "toggle", [])
          }
        : undefined,
    }
  }
  // What a row's press may need next, fetched ahead (once): its menu, where
  // rows are chosen together the bulk bar, and a file's preview.
  const warmRowParts = (row?: DocTreeRow) => {
    warmRowMenu()
    if (selectable) void bulkBar.warm()
    if (row?.node.node_kind === "file") warmFilePreview()
  }
  const rowOf = (el: EventTarget | null) => (el as HTMLElement | null)?.closest<HTMLElement>("[role=treeitem][data-tree-id]")?.dataset.treeId ?? null
  const rowAt = (el: EventTarget | null) => {
    const id = rowOf(el)
    return id ? seen.current.get(id)?.row : undefined
  }
  // A pointer resting on a row may open its menu next (the row's parts are
  // fetched ahead); one resting on a page's row may open it: its page and its
  // live copy are fetched ahead (A2), as a sidebar link does. A folder, a
  // file or a link has no live copy to fetch. Its kind is read from the row,
  // never from how its icon is drawn.
  const rest = React.useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return
    const row = rowAt(e.target)
    if (!row || rest.current?.id === row.id) return
    if (rest.current) clearTimeout(rest.current.timer)
    rest.current = {
      id: row.id,
      timer: setTimeout(() => {
        warmRowParts(row)
        if (row.node.node_kind) return
        prefetchDocOnIntent(row.id)
        router.prefetch(`${app_doc_path}/${row.id}`)
      }, DOC_INTENT_MS),
    }
  }
  // The keyboard in the tree may open a row's menu next (⇧F10).
  React.useEffect(() => watchInputModality(), [])
  // A finger rests on nothing first: on a touch screen the row's parts come
  // once the page is quiet, ahead of a "⋯" or a long press.
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(hover: none)").matches) return
    return whenIdle(() => {
      warmRowMenu()
      if (selectable) void bulkBar.warm()
    }, 3000)
  }, [selectable])
  const onFocus = (e: React.FocusEvent) => {
    if (!lastInputWasPointer()) warmRowParts(rowAt(e.target))
  }
  // A file's row opens its preview: its code comes as the row is pressed.
  const onPointerDown = (e: React.PointerEvent) => {
    if (rowAt(e.target)?.node.node_kind === "file") warmFilePreview()
  }
  const onPointerLeave = () => {
    if (rest.current) clearTimeout(rest.current.timer)
    rest.current = null
  }
  React.useEffect(() => onPointerLeave, [])

  // A row's menu without a pointer: the menu key or ⇧F10 on the row with
  // focus, as a desktop app's context menu; a right click on the row too.
  const setMenuFor = (id: string | null) => store.set({ menuFor: id })
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

  // Files dragged in from outside: onto a folder that may take them, or the
  // tree's own place. The row's ring, or the tree's, shows where they'd land.
  const [fileOver, setFileOver] = React.useState<string | null>(null)
  const dropTarget = (e: React.DragEvent): string | null => {
    const id = rowOf(e.target)
    const s = id ? seen.current.get(id) : undefined
    if (s && s.row.node.node_kind === "folder" && s.row.canEdit !== false) return s.row.id
    return dropRoot ? "root" : null
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return
    const to = dropTarget(e)
    if (!to) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
    if (to === fileOver) return
    // Files on their way: the upload's code comes while they're dragged.
    if (!fileOver) prefetchUploads()
    setFileOver(to)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!carriesFiles(e)) return
    const to = dropTarget(e)
    setFileOver(null)
    if (!to) return
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files ?? [])
    if (!files.length) return
    if (to === "root" && dropRoot) uploadLater(files, dropRoot.place, dropRoot.label)
    else {
      const folder = seen.current.get(to)?.row
      uploadLater(files, { parent: to }, folder?.title || "Untitled")
    }
  }

  // What the rows call, current, read as they act (fluid-06, Fix 1).
  const live = React.useRef<RowCtx & { openRow: (row: DocTreeRow) => void }>(null!)
  live.current = { store, addInside, actsFor, openRow }
  // A page's mark is its icon: drawn as itself, one component fewer a row.
  const icon = React.useCallback((row: DocTreeRow) => (row.node.node_kind ? <NodeMark node={markOfRow(row.node)} size={16} /> : <DocIcon icon={row.node.icon} id={row.id} size={16} />), [])
  const hue = React.useCallback((row: DocTreeRow) => nodeHue(markOfRow(row.node)), [])
  const meta = React.useCallback(
    (row: DocTreeRow) => {
      const n = row.node
      // A folder wears its colour as its tile; a page, a file or a link as a dot.
      const dot = n.color && n.node_kind !== "folder" ? <ColourDot hue={n.color} /> : null
      const detail =
        n.node_kind === "link"
          ? linkSite(n.link_url)
          : !dense && n.node_kind === "file" && n.file
            ? [formatFileSizeForAttachment(n.file.size_bytes), n.file.versions > 1 ? `v${n.file.versions}` : ""].filter(Boolean).join(" · ")
            : ""
      if (!dot && !detail) return null
      return (
        <>
          {dot}
          {detail ? <span className="min-w-0 truncate tabular-nums">{detail}</span> : null}
        </>
      )
    },
    [dense],
  )
  // A page's tree says who made each row's last change and when ("Maya ·
  // 3h ago"), as Basecamp's Docs & Files does; the sidebar's never does. A
  // server that doesn't say who leaves the time alone: never the owner, who
  // isn't who changed it.
  const aside = React.useCallback((row: DocTreeRow) => (dense ? null : edited(row.node.updated_by, row.node.updated_at)), [dense])
  const actions = React.useCallback((row: DocTreeRow, parent: string | null) => {
    seen.current.set(row.id, { row, parent })
    return <DocRowActions row={row} ctx={live} />
  }, [])
  const onOpen = React.useCallback((row: DocTreeRow) => live.current.openRow(row), [])
  const onLongPress = React.useCallback((row: DocTreeRow) => store.set({ menuFor: row.id }), [store])
  const movedLabel = React.useCallback((row: DocTreeRow) => `Moved ${row.title || "Untitled"}`, [])
  const treeProp = React.useMemo(() => ({ ...tree, move: plannedMove }), [tree, plannedMove])

  const ids = [...selection.selected]
  return (
    // In the sidebar its rows are 28 px: a tree is denser than the places
    // above it. On a page (a project's docs) they are 36, as a list's are.
    <div
      ref={box}
      data-doc-tree={space}
      data-file-over={fileOver === "root" ? "root" : undefined}
      onPointerOver={onPointerOver}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onKeyDownCapture={onKeyDown}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(null)
      }}
      onDrop={onDrop}
      className={cn(
        "relative rounded-xl",
        dense ? "[&_.shell-row]:h-7" : "[&_.shell-row]:h-9",
        // The tree's own place, lit while files are over it.
        "after:pointer-events-none after:absolute after:-inset-1.5 after:rounded-xl after:opacity-0 after:inset-ring-2 after:inset-ring-brand after:transition-opacity after:duration-[160ms] data-[file-over=root]:after:opacity-100",
      )}
    >
      <ActiveSync store={store} />
      <TreeView
        tree={treeProp}
        label={label}
        placeholder="Untitled"
        hiddenLabel={hiddenLabel}
        emptyLabel="Nothing inside"
        root={root}
        selection={selectable ? selection : undefined}
        dropInside={fileOver === "root" ? null : fileOver}
        icon={icon}
        hue={hue}
        meta={meta}
        aside={aside}
        onOpen={onOpen}
        onLongPress={onLongPress}
        movedLabel={movedLabel}
        actions={actions}
      />
      {selectable && (selection.selected.size > 0 || selection.mode) ? (
        <bulkBar.Part
          ids={ids}
          onMove={() => moveRows(ids)}
          onColourSheet={() => dialogs.open({ kind: "colour", ids })}
          onClear={selection.clear}
        />
      ) : null}
      {fileOver === "root" && dropRoot ? (
        <p aria-live="polite" className="content-float pointer-events-none absolute inset-x-0 -bottom-8 text-center text-ui-sm font-medium text-brand">
          Drop to upload to {dropRoot.label}
        </p>
      ) : null}
      {picker.element}
      {dialogs.element}
    </div>
  )
})
