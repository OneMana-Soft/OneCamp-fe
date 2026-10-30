"use client"

// What each node of the doc tree looks like at a glance (docs F1b, Docs &
// Files): a page its own icon; a folder a folder on its colour's tile, ink on
// the sunken tile when it has none (D-31: ink is the default look, not a
// colour); a file by its type (the file glyph every attachment wears); a link
// by its provider (a Google Sheet reads as a sheet, a Figma file as a design),
// never a third party's icon. A row tints in its colour first, then in its
// kind's own hue; a page, a file or a link with a colour shows it as a dot
// after its title.

import type { LucideIcon } from "lucide-react"

import { DocIcon } from "@/components/docEditor/DocIcon"
import { FILE_KIND_HUE, FILE_KIND_ICON, FileGlyph, FileTypeIcon, fileKind } from "@/components/fileIcon/fileTypeIcon"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { linkProvider, type LinkFamily } from "@/lib/docs/docNode"
import { docHue } from "@/lib/docLook"
import { ArrowUpRight, FileCode, FileSpreadsheet, FileText, Folder, Github, Globe, HardDrive, Layers, PlayCircle, Presentation } from "@/lib/icons"
import type { CampHue } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocListItem, DocNodeKind, TreeNodeJSON } from "@/types/docGraph"

/** A node as its mark needs it, from a tree row or a list row. */
export interface MarkedNode {
  id: string
  kind?: DocNodeKind
  color?: CampHue | null
  /** A page's icon. */
  icon?: string
  linkUrl?: string
  /** A link known by its provider's family alone: the work graph's chip leaves the address out (DGRAPH-LEAD-5). */
  linkFamily?: LinkFamily
  file?: { name: string; mime?: string }
}

export const markOfRow = (n: TreeNodeJSON): MarkedNode => ({
  id: n.uuid ?? "",
  kind: n.node_kind,
  color: n.color,
  icon: n.node_kind ? undefined : n.icon,
  linkUrl: n.link_url,
  file: n.file ? { name: n.file.name, mime: n.file.mime } : undefined,
})

export const markOfListItem = (d: DocListItem): MarkedNode => ({
  id: d.doc_uuid,
  kind: d.doc_node_kind,
  color: d.doc_color,
  icon: d.doc_node_kind ? undefined : d.doc_icon,
  linkUrl: d.doc_link_url,
  file: d.doc_file ? { name: d.doc_file.name, mime: d.doc_file.mime } : undefined,
})

const FAMILY_ICON: Record<LinkFamily, LucideIcon> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  drive: HardDrive,
  design: Layers,
  code: FileCode,
  video: PlayCircle,
  site: Globe,
}

/** A provider's family wears its file kind's hue: a Google Sheet is moss as a .xlsx is. */
const FAMILY_HUE: Record<LinkFamily, CampHue | null> = {
  doc: FILE_KIND_HUE.doc,
  sheet: FILE_KIND_HUE.sheet,
  slides: FILE_KIND_HUE.slides,
  drive: "lake",
  design: "dusk",
  code: null,
  video: FILE_KIND_HUE.video,
  site: null,
}

/** A link's family and glyph: from its address where the node has one, else from the family it came with. */
function linkLook(node: MarkedNode): { family: LinkFamily; Glyph: LucideIcon; provider: string } {
  const provider = node.linkUrl ? linkProvider(node.linkUrl) : null
  const family = provider?.family ?? node.linkFamily ?? "site"
  return { family, Glyph: provider?.id === "github" ? Github : FAMILY_ICON[family], provider: provider?.id ?? family }
}

/** The hue a row tints in: its colour, else its kind's (a file's type, a link's provider, a page's icon). Pure. */
export function nodeHue(node: MarkedNode): CampHue | null {
  if (node.color) return node.color
  switch (node.kind) {
    case "folder":
      return null
    case "file":
      return FILE_KIND_HUE[fileKind(node.file?.name, node.file?.mime)]
    case "link":
      return FAMILY_HUE[linkLook(node).family]
    default:
      return docHue(node.id, node.icon)
  }
}

/** A node's glyph on a tile (the work graph's): a folder, its file's type, its link's family, a page's document. Pure. */
export function nodeGlyph(node: MarkedNode): LucideIcon {
  switch (node.kind) {
    case "folder":
      return Folder
    case "file":
      return FILE_KIND_ICON[fileKind(node.file?.name, node.file?.mime)]
    case "link":
      return linkLook(node).Glyph
    default:
      return FileText
  }
}

type MarkSize = 16 | 20 | 32 | 40

const TILE: Record<MarkSize, string> = {
  16: "size-4 rounded-[4px] [&>svg]:size-[11px]",
  20: "size-5 rounded-[5px] [&>svg]:size-[13px]",
  32: "size-8 rounded-[9px] [&>svg]:size-[18px]",
  40: "size-10 rounded-[10px] [&>svg]:size-[22px]",
}

/** A node's mark, at a row's 16 or 20 px or a card's 32 or 40. */
export function NodeMark({ node, size = 16, className }: { node: MarkedNode; size?: MarkSize; className?: string }) {
  if (node.kind === "folder") {
    const hue = node.color ?? null
    return (
      <span
        aria-hidden="true"
        data-node-mark="folder"
        data-hue={hue ?? undefined}
        className={cn("inline-flex shrink-0 items-center justify-center", TILE[size], hue ? [HUE_CLASS[hue], "bg-hue-tint text-hue"] : "bg-sunken text-ink-2 inset-ring inset-ring-line-2", className)}
      >
        <Folder fill="currentColor" fillOpacity={0.16} />
      </span>
    )
  }
  if (node.kind === "file") {
    const name = node.file?.name ?? ""
    return (
      <span aria-hidden="true" data-node-mark="file" className={cn("inline-flex shrink-0 items-center justify-center", className)}>
        {size >= 32 ? <FileGlyph name={name} fileType={node.file?.mime} size={size as 32 | 40} /> : <FileTypeIcon name={name} fileType={node.file?.mime} size={size} />}
      </span>
    )
  }
  if (node.kind === "link") {
    const { family, Glyph, provider } = linkLook(node)
    const hue = FAMILY_HUE[family]
    return (
      <span
        aria-hidden="true"
        data-node-mark="link"
        data-provider={provider}
        className={cn("relative inline-flex shrink-0 items-center justify-center", hue ? [HUE_CLASS[hue], "text-hue"] : "text-ink-2", size >= 32 && [TILE[size], hue ? "bg-hue-tint" : "bg-sunken"], className)}
        style={size < 32 ? { width: size, height: size } : undefined}
      >
        {size < 32 ? <Glyph size={size} /> : <Glyph />}
        {size >= 32 ? (
          // It opens somewhere else: an arrow on the tile's corner, as an alias's.
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-raised text-ink-2 shadow-e1">
            <ArrowUpRight className="!size-2.5" />
          </span>
        ) : null}
      </span>
    )
  }
  return (
    <span aria-hidden="true" data-node-mark="page" className={cn("inline-flex shrink-0 items-center justify-center", className)}>
      <DocIcon icon={node.icon} id={node.id} size={size} />
    </span>
  )
}

/** A colour as a dot after a page's, a file's or a link's title. */
export function ColourDot({ hue, className }: { hue: CampHue; className?: string }) {
  return <span aria-hidden="true" data-colour-dot={hue} className={cn(HUE_CLASS[hue], "inline-block size-2 shrink-0 rounded-full bg-hue", className)} />
}
