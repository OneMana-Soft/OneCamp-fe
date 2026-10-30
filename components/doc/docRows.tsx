"use client"

// A doc as a list row (docs programme B5): the docs home's list view, its
// search results, a project's docs. 36 px on a wide screen: the page's icon,
// its title, where it sits ("in Engineering › RFCs"), who owns it and when it
// last changed. A phone's row is two lines at 56 px, a finger's height. A
// link, so it opens from the keyboard and in a new tab, and is fetched ahead
// on intent (A2).
//
// Docs & Files (docs F1b): a folder, a file or a link wears its kind's mark
// and opens its own way: a folder at its address, known as one before its
// page asks (no live copy to fetch ahead, so a plain link); a file in its
// preview, in place (⌘-click still opens its page in a new tab); a link is a
// real link to its document, in a new tab. A file shows its size and a link
// its site; a colour shows as a dot after the title.

import { LevelMark } from "@/components/doc/LevelMark"
import { levelLabel } from "@/lib/docs/abilities"
import * as React from "react"

import { NodeLink } from "@/components/docFiles/NodeLink"
import { DocRowMenu } from "@/components/docTree/DocRowMenu"
import { ColourDot, NodeMark, markOfListItem, nodeHue } from "@/components/docFiles/NodeMark"
import { seedNodeInfo } from "@/components/docFiles/fileActions"
import { useNodeDialogs, warmFilePreview } from "@/components/docFiles/useNodeDialogs"
import { checkLinkUrl, kindWord, linkSite, openingOf } from "@/lib/docs/docNode"
import { formatFileSizeForAttachment } from "@/lib/utils/format/formatFileSizeForAttachment"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { displayNameOf } from "@/lib/personName"
import { highlightRuns } from "@/lib/search/highlight"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { rememberDocIcon } from "@/lib/docLook"
import type { DocCrumb, DocListItem } from "@/types/docGraph"
import type { DocSearchItem } from "@/types/docHome"
import { app_doc_path } from "@/types/paths"

// The trash's rows name a doc with titleOf too, from its own small module, so
// the trash page doesn't carry these rows and their menu.
import { titleOf } from "@/lib/docs/docTitle"
export { titleOf }

/** "Engineering › RFCs": the pages above a doc, a page the viewer can't open as "…". Pure. */
export function pathLabel(path: DocCrumb[] | undefined): string {
  return (path ?? []).map((c) => (c.redacted ? "…" : titleOf(c.doc_title))).join(" › ")
}

/** When a row last changed, as "2h ago", and in full for its tooltip. Pure. */
export function whenOf(doc: Pick<DocListItem, "doc_updated_at" | "doc_created_at" | "viewed_at">, by: "edited" | "viewed" = "edited") {
  const raw = by === "viewed" ? doc.viewed_at || doc.doc_updated_at || doc.doc_created_at : doc.doc_updated_at || doc.doc_created_at
  const d = raw ? new Date(raw) : null
  if (!d || isNaN(d.getTime())) return { short: "", full: "" }
  return { short: agoOrDate(d), full: fullDateTime(d) }
}

/** Text with the words a search found marked, from the server's passage. Never HTML from the hit. */
export function Marked({ passage, className }: { passage: string; className?: string }) {
  return (
    <span className={className}>
      {highlightRuns(passage).map((r, i) => (r.hit ? <mark key={i}>{r.text}</mark> : <React.Fragment key={i}>{r.text}</React.Fragment>))}
    </span>
  )
}

export interface DocRowProps {
  doc: DocListItem | DocSearchItem
  /** "viewed" on Recent: when the viewer last opened it. */
  when?: "edited" | "viewed"
  /** The viewer may change it: its menu offers Rename and the trash. A list doesn't say, so only its owner is sure. */
  canEdit?: boolean
  /** A search's passages under the row. */
  passages?: string[]
}

export function DocRow({ doc, when = "edited", canEdit = false, passages }: DocRowProps) {
  // Its icon, for the lists that name a doc without it (lib/docLook).
  rememberDocIcon(doc.doc_uuid, doc.doc_icon)
  const title = titleOf(doc.doc_title)
  const where = pathLabel(doc.path)
  const time = whenOf(doc as DocListItem, when)
  const owner = doc.owner
  const titleMark = "title_highlight" in doc ? doc.title_highlight : undefined
  const [menuOpen, setMenuOpen] = React.useState(false)
  const item = doc as DocListItem
  const kind = item.doc_node_kind
  const mark = markOfListItem(item)
  const opening = openingOf(kind)
  const link = opening === "external" ? checkLinkUrl(item.doc_link_url ?? "") : null
  const external = link?.ok ? link.url : null
  const detail = kind === "link" ? linkSite(item.doc_link_url) : kind === "file" && item.doc_file ? formatFileSizeForAttachment(item.doc_file.size_bytes) : ""
  const dialogs = useNodeDialogs()
  const preview = (versions = false) => dialogs.open({ kind: "preview", file: { id: doc.doc_uuid, title: doc.doc_title ?? "", facts: item.doc_file, canEdit }, versions })
  // A page fetches its route and live copy on intent (IntentLink); a folder,
  // a file or a link its route only (NodeLink): none on sight. A file's
  // preview comes on the same intent.
  const Anchor = kind ? NodeLink : IntentLink
  const warm = opening === "preview" ? warmFilePreview : undefined
  // A long press on a phone opens the row's menu, as the "⋯" does.
  const press = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = React.useRef(false)
  const endPress = () => {
    if (press.current) clearTimeout(press.current)
    press.current = null
  }

  return (
    <div className="group/row relative" data-doc-row={doc.doc_uuid}>
      <Anchor
        href={external ?? `${app_doc_path}/${doc.doc_uuid}`}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-label={[title, kind && kindWord(kind), where && `in ${where}`, time.short && `${when === "viewed" ? "opened" : "edited"} ${time.short}`, levelLabel("level" in doc ? doc.level : undefined).toLowerCase()].filter(Boolean).join(", ")}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={() => {
          warm?.()
          pressed.current = false
          press.current = setTimeout(() => {
            pressed.current = true
            setMenuOpen(true)
          }, 500)
        }}
        onTouchEnd={endPress}
        onTouchMove={endPress}
        onClick={(e) => {
          // The long press opened the menu; the touch's click opens nothing.
          if (pressed.current) {
            e.preventDefault()
            pressed.current = false
            return
          }
          const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0
          if (opening === "preview" && plain) {
            e.preventDefault()
            preview()
          } else if (opening === "folder") {
            seedNodeInfo({ kind: "doc", uuid: doc.doc_uuid, title: doc.doc_title, has_children: false, node_kind: kind, color: item.doc_color, private: item.doc_private })
          }
        }}
        // A row of the interaction layer, tinting in the doc's own hue (D13).
        {...ix("row", { hue: nodeHue(mark) ?? undefined })}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg px-2 text-ink",
          // A wide screen's row is one 36 px line; a phone's two lines at 56 px.
          passages?.length ? "py-2 sm:min-h-9" : "h-14 sm:h-9",
          // The long press is ours (the row's menu), not the browser's link callout.
          "pr-10 [-webkit-touch-callout:none] sm:pr-10",
        )}
      >
        <NodeMark node={mark} size={16} className="self-start mt-[3px] sm:mt-0 sm:self-center" />
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className={cn("min-w-0 truncate text-ui font-[450]", !doc.doc_title?.trim() && "text-ink-3")}>
            {titleMark ? <Marked passage={titleMark} /> : title}
          </span>
          {item.doc_color && kind !== "folder" ? <ColourDot hue={item.doc_color} className="max-sm:hidden" /> : null}
          <span className="flex min-w-0 items-center gap-1.5 text-ui-sm text-ink-3 sm:flex-1">
            {detail ? <span className="shrink-0 tabular-nums">{detail}</span> : null}
            {detail && where ? <span aria-hidden="true">·</span> : null}
            {where && <span className="min-w-0 truncate">in {where}</span>}
            <LevelMark level={"level" in doc ? doc.level : undefined} />
            {/* The phone's second line ends with when. */}
            {time.short && (
              <span className="shrink-0 tabular-nums sm:hidden" title={time.full}>
                {where ? "· " : ""}
                {time.short}
              </span>
            )}
          </span>
          {passages && passages.length > 0 && (
            <span data-search-snippet="" className="mt-0.5 line-clamp-2 block text-ui-sm text-ink-2 sm:hidden">
              <Marked passage={passages[0]} />
            </span>
          )}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 text-meta text-ink-3 sm:flex">
          {owner?.user_uuid ? <IdentityMark id={avatarSeed(owner)} variant="avatar" size={20} label={displayNameOf(owner)} /> : null}
          {owner ? <span className="max-w-28 truncate">{displayNameOf(owner).split(/\s+/)[0]}</span> : null}
          {time.short && (
            <span className="tabular-nums" title={time.full}>
              · {time.short}
            </span>
          )}
        </span>
      </Anchor>
      {passages && passages.length > 0 && (
        <div data-search-snippet="" className="-mt-1 hidden pb-2 pl-[34px] pr-10 text-ui-sm text-ink-2 sm:block">
          {passages.slice(0, 2).map((p, i) => (
            <Marked key={i} passage={p} className="line-clamp-1 block" />
          ))}
        </div>
      )}
      <span className="absolute right-2 top-2 flex sm:top-1.5 sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100">
        <DocRowMenu
          doc={{ id: doc.doc_uuid, title: doc.doc_title ?? "", icon: doc.doc_icon }}
          canEdit={canEdit}
          node={{ kind, color: item.doc_color, linkUrl: item.doc_link_url, file: item.doc_file }}
          act={{
            preview: kind === "file" ? () => preview() : undefined,
            versions: kind === "file" ? () => preview(true) : undefined,
            replace: kind === "file" ? () => dialogs.open({ kind: "replace", file: { id: doc.doc_uuid, title: doc.doc_title ?? "" } }) : undefined,
            colourSheet: () => dialogs.open({ kind: "colour", ids: [doc.doc_uuid], current: item.doc_color, title: doc.doc_title }),
          }}
          focusable
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="size-7 sm:size-6"
        />
      </span>
      {dialogs.element}
    </div>
  )
}
