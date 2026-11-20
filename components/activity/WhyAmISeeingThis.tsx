"use client"

import * as React from "react"
import { useSWRConfig } from "swr"
import { HubToolButton } from "@/components/ui/hubRow"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"
import { CircleHelp } from "@/lib/icons"
import { NotifyGet } from "@/services/endpoints/inbox.notify"
import type { WhyRecordPanel } from "@/components/notifications/NotifyWhyPanel"
import type { WhyAnswer } from "@/lib/notifications/whyWords"
import type { UnifiedActivityItem } from "@/types/activity"
import type { CommentInfoInterface } from "@/types/comment"

/**
 * An Inbox row's "Why am I seeing this?" (A4 H3), in the row's tools (on a
 * touch screen, behind its Actions): the session's own record of the item's
 * chat message (GET /notify/why/{message}), its cause, each step's verdict and
 * what was sent, held, dropped or taken back. The place's name is the row's.
 *
 * Permission model: any member, guests included, asks about their own Inbox
 * items only; another person's item answers "no record", as does none.
 */

/**
 * The chat message an Inbox item is about, as the router recorded it: a
 * mention's post or chat message, a reply in a post's or a chat's thread (the
 * router records it under the reply's own id, V-837) or a mention in one, a
 * reaction's message; else none (a comment on a task, a doc or a board).
 */
export function whyMessageId(a: UnifiedActivityItem): string | null {
  if (a.activity_type === "MENTION" && a.mention) {
    const m = a.mention
    if (m.mention_post) return m.mention_post_uuid || m.mention_post.post_uuid || null
    if (m.mention_chat) return m.mention_chat_uuid || m.mention_chat.chat_uuid || null
    if (m.mention_comment && inThread(m.mention_comment)) return m.mention_comment_uuid || m.mention_comment.comment_uuid || null
    return null
  }
  if (a.activity_type === "COMMENT" && a.comment && inThread(a.comment)) return a.comment.comment_uuid || null
  if (a.activity_type === "REACTION" && a.reaction && !a.reaction.comment?.comment_uuid) {
    return a.reaction.post?.post_uuid || a.reaction.chat?.chat_uuid || null
  }
  return null
}

/** A reply in a post's or a chat message's thread: not a comment on a task, a doc or a board. */
const inThread = (c: CommentInfoInterface) => Boolean(c.comment_post || c.comment_chat)

/** The panel, from the notifications settings' one lazy chunk (main, 9 Nov): never on the Inbox's first load. */
const Panel = lazyPart<React.ComponentProps<typeof WhyRecordPanel>>(
  () => import("@/components/notifications/KeywordsAndVipsCard").then((m) => m.WhyRecordPanel),
  { failed: ({ onClose }) => <OverlayUnavailable title="Couldn't open why you're seeing this" onClose={onClose} /> },
)
const warm = () => void Panel.warm()

export function WhyAmISeeingThis({ messageId, place }: { messageId: string; place: string }) {
  // The open panel's door: this button's element, or null while it is shut.
  const [door, setDoor] = React.useState<HTMLElement | null>(null)
  const id = React.useId()
  return (
    <>
      <HubToolButton
        label="Why am I seeing this?"
        aria-haspopup="dialog"
        aria-expanded={!!door}
        aria-controls={door ? id : undefined}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={(e) => setDoor(door ? null : e.currentTarget)}
      >
        <CircleHelp />
      </HubToolButton>
      {door ? <WhyRecord messageId={messageId} place={place} door={door} id={id} onClose={() => setDoor(null)} /> : null}
    </>
  )
}

// A record changes as a message is deleted or a rule moves, so each open asks again (no dedupe), and a closed panel's
// answer goes with it: an open shows Looking it up until its own answer, never the last one. Not under a focus.
const READ = { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 }

function WhyRecord({ messageId, ...rest }: { messageId: string; place: string; door: HTMLElement; id: string; onClose: () => void }) {
  const key = `${NotifyGet.Why}/${encodeURIComponent(messageId)}`
  const read = useFetch<WhyAnswer>(key, undefined, READ, OWN_ERRORS)
  const { cache } = useSWRConfig()
  React.useEffect(() => () => cache.delete(key), [cache, key])
  return <Panel.Part answer={read.data} error={read.isError} onAgain={() => void read.mutate()} {...rest} />
}
