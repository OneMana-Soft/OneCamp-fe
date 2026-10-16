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
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import * as React from "react"
import NextLink from "next/link"
import { isPlainLeftClick } from "@/lib/ui/linkClick"

import { HubRow, HubToolButton } from "@/components/ui/hubRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { StatusGlyph, type StatusKind } from "@/components/ui/graphics/glyphs"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Eye, FileText, Hash, LayoutDashboard, Link, Paperclip, Users } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
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
    case "project":
      return (
        <span data-search-lead="project" className="grid size-6 place-items-center">
          <ProjectTile id={result.project?.project_id} size={24} />
        </span>
      )
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
          <IdentityMark variant="avatar" size={24} id={avatarSeed(name)} label={name} />
        </span>
      )
    }
    case "user":
      return (
        <span data-search-lead="person" className="grid place-items-center">
          <IdentityMark variant="avatar" size={28} id={avatarSeed(result.user)} label={displayNameOf(result.user)} />
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

/** Whether a hit is from a channel that was archived (the server marks it). */
export function inArchivedChannel(result: SearchResult): boolean {
  const entry = (result.post ?? result.comment ?? result.attachment) as { channel_archived?: boolean } | undefined
  return entry?.channel_archived === true
}

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
            <ProjectTile id={t.task_project_id} size={14} />
            {t.task_project_name}
          </span>,
        )
      if (t.task_assignee_user_full_name)
        push(
          <span className="inline-flex items-center gap-1">
            <IdentityMark variant="avatar" size={16} id={avatarSeed(t.task_assignee_user_full_name)} label={t.task_assignee_user_full_name} />
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
  // From a channel that was archived: its members still find its history.
  if (inArchivedChannel(result)) push(<span data-search-archived="" className="text-ink-3">Archived</span>)
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

// Block and truncating itself: a button is an atomic inline box, so the
// row's own ellipsis never reached it and a long title was cut mid-word
// ("…part here by tomo"). Its ::after stretches it over the row.
const TITLE_CONTROL =
  "block w-full truncate text-left text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand"

export interface SearchResultRowProps {
  result: SearchResult
  onOpen: (result: SearchResult) => void
  onPreview?: (result: SearchResult) => void
  /** The address of what the row opens: the row is a link to it, and "Copy link" copies it. */
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
        // The title is the row's one control, stretched over the row. A row
        // with an address is a link (QA DSA-13), so a middle click or Ctrl/⌘
        // click opens it in a new tab and its address can be copied; a plain
        // click still opens it here.
        href ? (
          <NextLink
            href={href}
            data-search-result=""
            onClick={(e) => {
              if (!isPlainLeftClick(e)) return
              e.preventDefault()
              onOpen(result)
            }}
            className={TITLE_CONTROL}
          >
            {getHighlightedTitle(result)}
          </NextLink>
        ) : (
          <button type="button" data-search-result="" onClick={() => onOpen(result)} className={TITLE_CONTROL}>
            {getHighlightedTitle(result)}
          </button>
        )
      }
      second={<SearchMeta result={result} />}
      meta={at ? formatListTimestamp(new Date(at).toISOString()) : undefined}
      tools={tools}
    >
      <BodyMatch result={result} />
    </HubRow>
  )
}
