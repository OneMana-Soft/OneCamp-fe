"use client"

// A doc as a list row (docs programme B5): the docs home's list view, its
// search results, a project's docs. 36 px on a wide screen: the page's icon,
// its title, where it sits ("in Engineering › RFCs"), who owns it and when it
// last changed. A phone's row is two lines at 56 px, a finger's height. A
// link, so it opens from the keyboard and in a new tab, and is fetched ahead
// on intent (A2).

import { LevelMark } from "@/components/doc/LevelMark"
import { levelLabel } from "@/lib/docs/abilities"
import * as React from "react"

import { DocIcon } from "@/components/docEditor/DocIcon"
import { DocRowMenu } from "@/components/docTree/DocRowMenu"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { displayNameOf } from "@/lib/personName"
import { highlightRuns } from "@/lib/search/highlight"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocCrumb, DocListItem } from "@/types/docGraph"
import type { DocSearchItem } from "@/types/docHome"
import { app_doc_path } from "@/types/paths"

/** What a doc's title shows: the title, or the placeholder it has until someone names it (D-6). */
export const titleOf = (t: string | undefined) => (t ?? "").trim() || "Untitled"

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
  const title = titleOf(doc.doc_title)
  const where = pathLabel(doc.path)
  const time = whenOf(doc as DocListItem, when)
  const owner = doc.owner
  const titleMark = "title_highlight" in doc ? doc.title_highlight : undefined
  const [menuOpen, setMenuOpen] = React.useState(false)
  // A long press on a phone opens the row's menu, as the "⋯" does.
  const press = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = React.useRef(false)
  const endPress = () => {
    if (press.current) clearTimeout(press.current)
    press.current = null
  }

  return (
    <div className="group/row relative" data-doc-row={doc.doc_uuid}>
      <IntentLink
        href={`${app_doc_path}/${doc.doc_uuid}`}
        aria-label={[title, where && `in ${where}`, time.short && `${when === "viewed" ? "opened" : "edited"} ${time.short}`, levelLabel("level" in doc ? doc.level : undefined).toLowerCase()].filter(Boolean).join(", ")}
        onTouchStart={() => {
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
          }
        }}
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg px-2 text-ink outline-none transition-colors duration-[140ms] ease-[var(--ease-out)]",
          "hover:bg-hover hover:duration-0 focus-visible:ring-2 focus-visible:ring-brand active:bg-press",
          // A wide screen's row is one 36 px line; a phone's two lines at 56 px.
          passages?.length ? "py-2 sm:min-h-9" : "h-14 sm:h-9",
          // The long press is ours (the row's menu), not the browser's link callout.
          "pr-10 [-webkit-touch-callout:none] sm:pr-10",
        )}
      >
        <DocIcon icon={doc.doc_icon} size={16} className="self-start mt-[3px] sm:mt-0 sm:self-center" />
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className={cn("min-w-0 truncate text-ui font-[450]", !doc.doc_title?.trim() && "text-ink-3")}>
            {titleMark ? <Marked passage={titleMark} /> : title}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-ui-sm text-ink-3 sm:flex-1">
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
      </IntentLink>
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
          focusable
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="size-7 sm:size-6"
        />
      </span>
    </div>
  )
}
