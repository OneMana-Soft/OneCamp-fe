"use client"

import * as React from "react"
import { CheckSquare, ChevronDown, FolderKanban, Link2 } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocBacklinks } from "@/types/docChrome"
import { DocIcon } from "../DocIcon"
import { useBacklinksShown } from "./backlinksPref"

/** How many show before "N more". */
const FIRST = 3

interface Link {
  key: string
  href: string
  label: string
  icon: React.ReactNode
}

/** A doc's backlinks as one list: docs first, then tasks, then projects. Pure. */
export function linksOf(l: Partial<DocBacklinks>): Link[] {
  return [
    ...(l.docs ?? []).map((d) => ({ key: `doc-${d.doc_uuid}`, href: `/app/doc/${d.doc_uuid}`, label: d.doc_title?.trim() || "Untitled", icon: <DocIcon icon={d.doc_icon} size={14} /> })),
    ...(l.tasks ?? []).map((t) => ({ key: `task-${t.task_uuid}`, href: `/app/task/${t.task_uuid}`, label: t.task_name || "Untitled task", icon: <CheckSquare aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" /> })),
    ...(l.projects ?? []).map((p) => ({ key: `project-${p.project_uuid}`, href: `/app/project/${p.project_uuid}`, label: p.project_name || "Untitled project", icon: <FolderKanban aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" /> })),
  ]
}

/** "1 backlink", "3 backlinks", "200+ backlinks" when there were more than were read. */
export const backlinkCount = (n: number, capped?: boolean) => (capped ? `${n}+ backlinks` : `${n} ${n === 1 ? "backlink" : "backlinks"}`)

/**
 * "Linked from" (B6, structure.md P1.3): what links here, together, as "3
 * backlinks", the first few at once and the rest a press away. A doc's can be
 * hidden for oneself (Customize page).
 */
export default function LinkedFromList({ links, refType, refUUID, className }: { links: Partial<DocBacklinks>; refType: "doc" | "board"; refUUID: string; className?: string }) {
  const [shown] = useBacklinksShown(refUUID)
  const [open, setOpen] = React.useState(false)
  const all = linksOf(links)
  if (!all.length || (refType === "doc" && !shown)) return null
  const visible = open ? all : all.slice(0, FIRST)
  const more = all.length - visible.length
  return (
    <section aria-label={backlinkCount(all.length, links.capped)} className={cn("flex flex-wrap items-center gap-1.5", className)} data-linked-from="">
      <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-3">
        <Link2 aria-hidden="true" className="size-3.5" />
        {backlinkCount(all.length, links.capped)}
      </span>
      {visible.map((l) => (
        <IntentLink
          key={l.key}
          href={l.href}
          className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-meta font-medium text-ink outline-none ring-1 ring-inset ring-line transition-colors hover:bg-press focus-visible:ring-2 focus-visible:ring-brand"
        >
          {l.icon}
          <span className="truncate">{l.label}</span>
        </IntentLink>
      ))}
      {more > 0 || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-meta text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          {open ? "Fewer" : `${more} more`}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-[140ms]", open && "rotate-180")} />
        </button>
      ) : null}
    </section>
  )
}
