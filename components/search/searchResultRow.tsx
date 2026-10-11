"use client"

/**
 * One search result, as a two-line HubRow (hub.md S9).
 *
 * The lead follows design v3's identity rules, where every type used to get a
 * hued tile: a project its gradient tile, a task its status glyph, a message
 * its author's face, a person their avatar, and a channel, a doc, a board or
 * a file a glyph in ink-3, since a channel and a doc carry no hue. The title
 * carries the match (the sun highlighter), the second line says where it is
 * and who, and a doc or a task that matched in its body adds the passage.
 */
import * as React from "react"

import { HubRow, HubToolButton } from "@/components/ui/hubRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Eye, FileText, FolderKanban, Hash, LayoutDashboard, Link, Paperclip, Users } from "@/lib/icons"
import { hueFor } from "@/lib/campHue"
import { displayNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { getHighlightedTitle, isResultPreviewable, Snippet } from "@/lib/utils/helpers/search"
import { highlightText } from "@/lib/search/highlight"
import { resultTime } from "@/lib/search/scopes"
import type { SearchResult } from "@/services/searchService"

/** A task's status, as one of the glyph set's six. */
export function statusKindOf(status: string | undefined): StatusKind {
  const s = (status || "").toLowerCase()
  if (s === "done" || s === "completed") return "done"
  if (s.includes("cancel")) return "cancelled"
  if (s.includes("review")) return "review"
  if (s.includes("progress") || s === "doing") return "progress"
  if (s.includes("backlog")) return "backlog"
  return "todo"
}

/** The row's lead, by type (hub.md S9's table). */
export function SearchLead({ result }: { result: SearchResult }) {
  switch (result.type) {
    case "project": {
      const hue = hueFor(result.project?.project_id)
      return (
        <span data-search-lead="project" data-hue={hue} className={cn(avatarHueClass(hue), "grid size-6 place-items-center rounded-[7px] [&_svg]:size-3.5")}>
          <FolderKanban />
        </span>
      )
    }
    case "task":
      return (
        <span data-search-lead="task" className="grid size-6 place-items-center">
          <StatusGlyph status={statusKindOf(result.task?.task_status)} />
        </span>
      )
    case "chat":
    case "post":
    case "comment": {
      const r = result[result.type] ?? {}
      const id = r.chat_by_user_id || r.post_by_user_id || r.comment_by_user_id
      const name = r.chat_by_user_full_name || r.post_by_user_full_name || r.comment_by_user_full_name
      return (
        <span data-search-lead="message" className="grid place-items-center">
          <IdentityMark variant="avatar" size={24} id={id} label={name} />
        </span>
      )
    }
    case "user":
      return (
        <span data-search-lead="person" className="grid place-items-center">
          <IdentityMark variant="avatar" size={28} id={result.user?.user_id} label={displayNameOf(result.user)} />
        </span>
      )
    default: {
      const Glyph = result.type === "channel" ? Hash : result.type === "team" ? Users : result.type === "board" ? LayoutDashboard : result.type === "attachment" ? Paperclip : FileText
      return (
        <span data-search-lead={result.type} className="grid size-6 place-items-center text-ink-3 [&_svg]:size-4">
          <Glyph />
        </span>
      )
    }
  }
}

const dot = <span className="text-ink-4"> · </span>

/** Where a result is and who, in the words a person uses. */
function SearchMeta({ result }: { result: SearchResult }) {
  const parts: React.ReactNode[] = []
  const push = (n: React.ReactNode) => n && parts.push(n)
  switch (result.type) {
    case "project":
      push("Project")
      push(result.project?.project_team_name)
      break
    case "task": {
      const t = result.task ?? {}
      if (t.task_project_name)
        push(
          <span className="inline-flex items-center gap-1">
            <IdentityMark variant="square" size={12} id={t.task_project_id} />
            {t.task_project_name}
          </span>,
        )
      if (t.task_assignee_user_full_name)
        push(
          <span className="inline-flex items-center gap-1">
            <IdentityMark variant="avatar" size={16} id={t.task_assignee_user_id} label={t.task_assignee_user_full_name} />
            {t.task_assignee_user_full_name}
          </span>,
        )
      break
    }
    case "doc":
      push("Doc")
      push(result.doc?.doc_created_by_user_full_name)
      break
    case "board":
      push("Board")
      push(result.board?.board_created_by_user_full_name)
      break
    case "post":
      push(result.post?.post_ch_name ? `#${result.post.post_ch_name}` : "Message")
      push(result.post?.post_by_user_full_name)
      break
    case "chat":
      push("Direct message")
      push(result.chat?.chat_by_user_full_name)
      break
    case "comment":
      push(result.comment?.comment_doc_title ? `Comment on ${result.comment.comment_doc_title}` : "Reply")
      push(result.comment?.comment_by_user_full_name)
      break
    case "user":
      push(result.user?.user_job_title || result.user?.user_email)
      if (result.user?.user_is_guest) push(<PrincipalTag kind="guest" />)
      break
    case "channel":
      push("Channel")
      break
    case "team":
      push("Team")
      break
    case "attachment":
      push(result.attachment?.attachment_channel_name ? `File in #${result.attachment.attachment_channel_name}` : result.attachment?.attachment_doc_title ? `File in ${result.attachment.attachment_doc_title}` : "File")
      break
  }
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? dot : null}
          {p}
        </React.Fragment>
      ))}
    </>
  )
}

/** The fields whose passage says why a result matched when its title didn't. */
const BODY_FIELDS: Partial<Record<SearchResult["type"], string>> = { doc: "doc_body", task: "task_desc" }

function BodyMatch({ result }: { result: SearchResult }) {
  const field = BODY_FIELDS[result.type]
  if (!field) return null
  const fragments = result.highlight?.[field]?.filter((f) => highlightText(f)) ?? []
  if (fragments.length === 0) return null
  const obj = result[result.type] as Record<string, unknown> | undefined
  const full = typeof obj?.[field] === "string" ? (obj[field] as string) : undefined
  return (
    <span data-search-snippet="" className="mt-0.5 line-clamp-2 block text-ui-sm text-ink-2">
      {fragments.slice(0, 2).map((f, i) => (
        <React.Fragment key={i}>
          {i > 0 && " "}
          <Snippet fragment={f} full={full} />
        </React.Fragment>
      ))}
    </span>
  )
}

export interface SearchResultRowProps {
  result: SearchResult
  onOpen: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
  /** The address of what the row opens, for "Copy link". */
  href?: string
}

export function SearchResultRow({ result, onOpen, onPreview, href }: SearchResultRowProps) {
  const at = resultTime(result)
  const copy = href
    ? () => {
        const url = new URL(href, window.location.origin).toString()
        void navigator.clipboard?.writeText(url)
      }
    : undefined
  const tools =
    copy || (onPreview && isResultPreviewable(result)) ? (
      <>
        {onPreview && isResultPreviewable(result) ? (
          <HubToolButton label="Preview" onClick={() => onPreview(result)}>
            <Eye />
          </HubToolButton>
        ) : null}
        {copy ? (
          <HubToolButton label="Copy link" onClick={copy}>
            <Link />
          </HubToolButton>
        ) : null}
      </>
    ) : undefined
  return (
    <HubRow
      as="li"
      density="two-line"
      data-search-row={result.type}
      leadSize={result.type === "user" ? 28 : 24}
      className="min-h-14"
      lead={<SearchLead result={result} />}
      title={
        // The title is the row's one control, stretched over the row.
        <button
          type="button"
          data-search-result=""
          onClick={() => onOpen(result)}
          className="text-left text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand"
        >
          {getHighlightedTitle(result)}
        </button>
      }
      second={<SearchMeta result={result} />}
      meta={at ? formatListTimestamp(new Date(at).toISOString()) : undefined}
      tools={tools}
    >
      <BodyMatch result={result} />
    </HubRow>
  )
}
