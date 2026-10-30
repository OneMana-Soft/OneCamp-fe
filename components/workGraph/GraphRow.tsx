"use client"

import * as React from "react"

import { nodeGlyph, nodeHue, type MarkedNode } from "@/components/docFiles/NodeMark"
import { fileKind, type FileKind } from "@/components/fileIcon/fileTypeIcon"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { isCampHue } from "@/lib/campHue"
import { Calendar, CheckSquare, FileText, Folder, FolderKanban, Hash, Lightbulb, MessageCircle, MessageSquare, MessageSquareText, Presentation, User, Users } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { ChatFace } from "@/components/message/chatFace"
import { linkFamilyOf } from "@/lib/docs/docNode"
import { hrefOf, kindHue, nextIndex, nodeKindOf, titleOf, type GraphHop, type GraphKind, type KindHue } from "@/lib/workGraph/workGraph"
import type { DocNodeKind } from "@/types/docGraph"

const ICON: Record<GraphKind, React.ComponentType<{ className?: string }>> = {
  doc: FileText,
  task: CheckSquare,
  project: FolderKanban,
  person: User,
  board: Presentation,
  channel: Hash,
  message: MessageSquare,
  chat: MessageSquareText,
  team: Users,
  comment: MessageCircle,
  memory: Lightbulb,
  event: Calendar,
}

/** A mark's tile classes: an area's tint, the agents' indigo, or neutral ink for what is no area (people). */
export function tileClass(hue: KindHue): string {
  if (hue === "ink") return "bg-sunken text-ink-2"
  if (hue === "agent") return "bg-agent-muted text-agent"
  return `${HUE_CLASS[hue]} bg-hue-tint text-hue`
}

/** The interaction layer's hue for a mark: none for ink. */
export const ixHue = (hue: KindHue) => (hue === "ink" ? undefined : hue)

/** What a mark is drawn from: a thing's kind, and for a doc its id, title and data (its node kind, colour, icon, link family). */
type Markable = Pick<GraphHop, "kind"> & Partial<Pick<GraphHop, "id" | "title" | "data">>

interface Mark {
  Icon: React.ComponentType<{ className?: string }>
  hue: KindHue
  node?: DocNodeKind
  file?: FileKind
}

/**
 * A doc's chip as the docs tree's mark reads a node (docs F1b's NodeMark): a
 * file is named by its title, and a link comes with its provider's family
 * alone, never its address (DGRAPH-LEAD-5).
 */
const markedOf = (h: Markable): MarkedNode => {
  const data = h.data ?? {}
  const kind = nodeKindOf(h) ?? undefined
  return {
    id: h.id ?? "",
    kind,
    color: isCampHue(data.color) ? data.color : null,
    icon: !kind && typeof data.icon === "string" ? data.icon : undefined,
    linkFamily: kind === "link" ? linkFamilyOf(data.link_family) : undefined,
    file: kind === "file" ? { name: h.title ?? "" } : undefined,
  }
}

/**
 * A thing's mark. A doc is marked as the docs tree marks its node, by one
 * rule (NodeMark's nodeGlyph and nodeHue): its colour first; a folder ink until
 * it has one, a file by its type, a link by its provider's family, a page in
 * its own hue. Anything else, and a search hit known by its kind alone, its
 * kind's icon on its area's hue (lib/workGraph kindHue).
 */
function markOf(h: Markable): Mark {
  if (h.kind === "doc" && h.id) {
    const node = markedOf(h)
    return { Icon: nodeGlyph(node), hue: nodeHue(node) ?? "ink", node: node.kind, file: node.kind === "file" ? fileKind(node.file?.name) : undefined }
  }
  return { Icon: ICON[h.kind] ?? FileText, hue: kindHue(h.kind) }
}

/** The hue a thing's row tints in: its tile's. */
const hueOf = (h: Markable): KindHue => markOf(h).hue

/** A thing's tile: its mark (markOf) on its hue. A search hit is marked by its kind alone. */
export function KindTile({ kind, hop, size = "md" }: { kind: GraphKind; hop?: Markable; size?: "sm" | "md" }) {
  const { Icon, hue, node, file } = markOf(hop ?? { kind })
  return (
    <span
      aria-hidden="true"
      data-graph-tile={kind}
      data-node-kind={node}
      data-file-kind={file}
      className={cn(
        tileClass(hue),
        // An uncoloured folder's sunken tile keeps an edge on a white panel, as the docs tree's does.
        node === "folder" && hue === "ink" && "inset-ring inset-ring-line-2",
        "flex shrink-0 items-center justify-center",
        size === "md" ? "size-8 rounded-[10px] [&>svg]:size-4" : "size-6 rounded-[7px] [&>svg]:size-3.5",
      )}
    >
      {node === "folder" ? <Folder fill="currentColor" fillOpacity={0.16} /> : <Icon />}
    </span>
  )
}

/** The row look, shared by links and buttons: the interaction layer (data-interactive="row", its hue) draws hover and selected; a ring on focus, no layout shift. */
export const rowClass =
  "group flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-[background-color,box-shadow,transform] duration-[160ms] ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"

/**
 * One connected thing: its tile, its name and why it's here. It opens where
 * the thing lives; one that opens nowhere (a note) is a plain row.
 */
export function GraphRow({
  hop,
  why,
  onNavigate,
  rowProps,
}: {
  hop: GraphHop
  why: string
  onNavigate?: () => void
  rowProps?: React.HTMLAttributes<HTMLElement> & Record<string, unknown>
}) {
  const href = hrefOf(hop)
  const name = titleOf(hop)
  const inner = (
    <>
      {hop.kind === "person" ? (
        <ChatFace name={name} profileKey={typeof hop.data?.avatar_key === "string" ? hop.data.avatar_key : undefined} userUUID={hop.id} size={32} className="shrink-0" />
      ) : (
        <KindTile kind={hop.kind} hop={hop} />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-ui font-medium text-ink">{name}</span>
        <span className="block truncate text-meta text-ink-3">{why}</span>
      </span>
    </>
  )
  const common = { "data-graph-row": hop.kind, ...ix("row", { hue: ixHue(hueOf(hop)) }), ...rowProps }
  if (!href) {
    return (
      <div {...common} tabIndex={0} className={rowClass}>
        {inner}
      </div>
    )
  }
  return (
    <IntentLink href={href} onClick={onNavigate} aria-label={`${name}, ${why}`} {...common} className={rowClass}>
      {inner}
    </IntentLink>
  )
}

/**
 * Arrow keys, Home and End move through a list's rows; Tab leaves it. One
 * listener on the list, the rows found by their data attribute.
 */
export function useRovingRows() {
  return React.useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-graph-row],[data-graph-pick]"))
    if (!rows.length) return
    e.preventDefault()
    rows[nextIndex(e.key, rows.indexOf(document.activeElement as HTMLElement), rows.length)]?.focus()
  }, [])
}
