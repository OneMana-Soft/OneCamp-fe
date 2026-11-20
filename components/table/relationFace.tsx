"use client"

// A relation cell's face (tables T6b): its chips, "+N", what the reader
// can't open, and the "+", as plain markup. RelationCell draws it live; the
// grid's cells at rest (cellFaces' restCell) draw it as is.

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import Link from "next/link"
import { CircleDot, FileText, Folder, Hash, LayoutDashboard, Link2, Lock, User, X, Plus } from "@/lib/icons"
// A call is the phone a call card shows (components/message/callCard), from where the cells take it (cellFaces).
import { Phone } from "lucide-react"
import { TableGlyph } from "@/components/table/TableGlyph"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { isHiddenRef, type RelationRef } from "@/services/tableService"
import { hiddenText } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"
import { tablePath } from "@/lib/tables/route"
import { iconMarkup } from "@/lib/iconMarkup"

/** A linked thing's 14 px glyph: a table row's tile, a page, a task's ring, a project, a channel's #, a call's phone, a person's face. */
export function RefGlyph({ item }: { item: RelationRef }) {
  return refGlyph(item)
}

/** RefGlyph, with its icon as plain markup (the grid's cells at rest draw it by the thousand). Pure. */
export function refGlyph(r: RelationRef): React.ReactNode {
  if (r.type === "row" && r.table_id) return <TableGlyph id={r.table_id} size="sm" className="!size-3.5 !rounded-[4px] [&_svg]:!size-2.5" />
  // A person keyed by their name, as every avatar is (IdentityMark).
  if (r.type === "user" && r.label) return <IdentityMark id={avatarSeed(r.label)} label={r.label} variant="avatar" size={16} className="-ml-0.5 shrink-0" />
  const Icon = r.type === "doc" ? FileText : r.type === "board" ? LayoutDashboard : r.type === "task" ? CircleDot : r.type === "project" ? Folder : r.type === "channel" ? Hash : r.type === "call" ? Phone : r.type === "user" ? User : Link2
  return iconMarkup(Icon, { className: "size-3.5 shrink-0 text-ink-3", "aria-hidden": true })
}

/**
 * Where a linked chip goes: a table's row opens in its record panel, a channel
 * at its page (the Link Router's path, lib/conversation/route, written here as
 * the other kinds' are, so the chips' chunk, which a guest's, a doc's and the
 * site's tables load too, reaches no conversation code). A call's place is
 * asked of the server on a click, by the opener the tables page hands the
 * cells (CellContext.openCall).
 */
function hrefOf(r: RelationRef): string | null {
  if (r.type === "row" && r.table_id) return tablePath(r.table_id, { row: r.id })
  if (r.type === "doc") return `/app/doc/${r.id}`
  if (r.type === "board") return `/app/board/${r.id}`
  if (r.type === "project") return `/app/project/${r.id}`
  if (r.type === "task") return `/app/task/${r.id}`
  if (r.type === "channel") return `/app/channel/${r.id}`
  return null
}

/** A chip's name that opens what it names: its link, or a call's button. */
const CHIP_NAME = "truncate rounded-sm"

/**
 * A relation cell's markup: its chips, "+N", what the reader can't open, and
 * the "+" (add). RelationCell's, live (remove given, a chip's link a client
 * link, a call's name a button to its opener); and the grid's cell at rest, as plain
 * markup (remove absent: the grid brings the cell to life before a click
 * reaches a chip, its × or the +). Pure.
 */
export function relationMarkup({
  refs,
  room,
  readOnly,
  people,
  remove,
  openCall,
  add,
}: {
  refs: RelationRef[]
  room: { max: number; wrap: boolean }
  readOnly?: boolean
  people: boolean
  /** Live: unlinks a chip's item. */
  remove?: (id: string) => void
  /** Opens a linked call (the tables page's opener, CellContext.openCall); without one, a call's chip is its name. */
  openCall?: (id: string) => void
  /** The "+" and its picker (live), or the "+" alone (at rest). */
  add: React.ReactNode
}) {
  // Items the reader can't open show as one chip, never by name or id.
  const hidden = refs.filter((r) => r.type !== "more" && (isHiddenRef(r) || !r.label)).length
  const named = refs.filter((r) => r.type !== "more" && !isHiddenRef(r) && r.label)
  const shown = named.slice(0, room.max)
  const more = refs.find((r) => r.type === "more")
  return (
    <div className={cn("relative flex h-full min-h-8 items-center gap-1 px-3", room.wrap ? "flex-wrap content-center py-1" : "overflow-hidden")}>
      {shown.map((ref) => {
        const href = !readOnly ? hrefOf(ref) : null
        return (
          <span
            key={ref.id}
            data-relation-chip=""
            data-chip={readOnly ? "" : "x"}
            className="group/chip relative inline-flex h-[22px] min-w-0 max-w-full items-center gap-1 rounded-md bg-raised pl-1.5 pr-1.5 text-meta font-medium text-ink shadow-e1 transition-shadow hover:shadow-e2"
          >
            {refGlyph(ref)}
            {href ? (
              remove ? (
                <Link href={href} className={CHIP_NAME} title={`Open ${ref.label}`}>
                  {ref.label}
                </Link>
              ) : (
                <a href={href} className={CHIP_NAME} title={`Open ${ref.label}`}>
                  {ref.label}
                </a>
              )
            ) : ref.type === "call" && !readOnly && openCall ? (
              <button type="button" className={CHIP_NAME} title={`Open ${ref.label}`} onClick={() => openCall(ref.id)}>
                {ref.label}
              </button>
            ) : (
              <span className="truncate">{ref.label}</span>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={remove ? () => remove(ref.id) : undefined}
                className="chip-x"
                data-touch-target=""
                title={people ? "Remove" : "Unlink"}
                aria-label={`${people ? "Remove" : "Unlink"} ${ref.label}`}
              >
                {iconMarkup(X, { className: "size-3" })}
              </button>
            )}
          </span>
        )
      })}
      {named.length > shown.length ? (
        <span className="chip h-[22px] shrink-0 text-ink-2" data-relation-more="" title={named.slice(shown.length).map((r) => r.label).join(", ")}>
          +{formatLocale(named.length - shown.length, {})}
        </span>
      ) : null}
      {more ? <span className="chip h-[22px] shrink-0 text-ink-2">{more.label}</span> : null}
      {hidden > 0 ? (
        // In a narrow cell it gives way first (shrink 4), so a named chip beside it keeps its name: at 390 a call's
        // chip had shrunk to its glyph and its x, its name 0 px wide.
        <span
          data-relation-hidden=""
          title="You don't have access to what's linked here"
          className="inline-flex h-[22px] min-w-0 max-w-full shrink-[4] items-center gap-1 rounded-md bg-hover px-1.5 text-meta text-ink-3 ring-1 ring-inset ring-line"
        >
          {iconMarkup(Lock, { className: "size-3 shrink-0", "aria-hidden": true })}
          <span className="truncate">{hiddenText(hidden)}</span>
        </span>
      ) : null}
      {add}
    </div>
  )
}

/** A relation cell's "+": RelationCell's picker trigger, and the grid's at rest. Pure. */
export function relationAdd(refs: RelationRef[], people: boolean) {
  return (
    <button
      type="button"
      aria-label={people ? "Add a person" : "Add a link"}
      className={cn(
        "inline-flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-md text-meta text-ink-3 transition-opacity hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        refs.length > 0
          ? "w-5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          : "px-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
      )}
    >
      {iconMarkup(Plus, { className: "size-3" })} {refs.length === 0 ? (people ? "Add" : "Link") : ""}
    </button>
  )
}
