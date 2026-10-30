"use client"

/**
 * GuestDocComments — the external guest's feedback thread for a shared doc.
 *
 * Shows the guest comments left on this doc and, when the share link carries
 * the "comment" capability, a composer to add one. This is deliberately a
 * GUEST-ONLY thread: the internal member comment discussion is never exposed to
 * an outside guest. Members see these guest comments merged into their own
 * comment panel, badged "Guest".
 *
 * Identity: the guest enters a display name once, remembered in this browser
 * for this link (as every guest page does). It is attribution only and never
 * resolves to a member account.
 *
 * Problems are said HERE, under the field they are about. Nothing under /guest
 * mounts a toaster, so the toasts this used to raise never showed: a guest who
 * forgot their name, or whose comment the server refused, saw the button come
 * back and nothing else.
 */

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Skeleton } from "@/components/ui/skeleton"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { PaperCard } from "@/components/guest/PublicFrame"
import { Eye } from "@/lib/icons"
import {
  listGuestDocComments,
  createGuestDocComment,
  type GuestDocComment,
} from "@/services/guestService"
import { retryingText, sendFailedText } from "@/services/publicApi"
import { GUEST_NAME_MAX, guestWhen, useGuestAnswer, useGuestName } from "@/components/guest/guestUi"
import { cn } from "@/lib/utils/helpers/cn"
import { threadsOf } from "@/lib/guestThread/threadsOf"

// Loaded only where a link may comment.
const GuestDocVerdict = dynamic(() => import("@/components/guest/GuestDocVerdict").then((m) => m.GuestDocVerdict), { ssr: false })

interface GuestDocCommentsProps {
  token: string
}

const NO_NAME = "Add your name first, so the team knows who wrote this."

/**
 * The comments card under the shared doc (content.md D21): 816 px, r16, e1,
 * 24 px in, the comments in the doc panel's card style (an avatar in the
 * guest's hue, the name, the Guest tag, when, then the words at 14/22). The
 * composer is a card: "Your name" (kept for this link), the comment, and
 * Comment once both are filled; a new comment rises in.
 */
export function GuestDocComments({ token }: GuestDocCommentsProps) {
  const { data, trouble } = useGuestAnswer(`doc-comments:${token}`, () => listGuestDocComments(token))
  const [posted, setPosted] = React.useState<GuestDocComment[]>([])
  const canComment = data?.capability === "comment"
  const comments = [...(data?.comments ?? []), ...posted]
  const [savedName, saveName] = useGuestName(token)
  const [nameDraft, setNameDraft] = React.useState<string | null>(null)
  const name = nameDraft ?? savedName
  const [draft, setDraft] = React.useState("")
  const [posting, setPosting] = React.useState(false)
  const [nameError, setNameError] = React.useState("")
  const [sendError, setSendError] = React.useState("")
  const [justPosted, setJustPosted] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const nameId = React.useId()
  const bodyId = React.useId()

  const post = async () => {
    const body = draft.trim()
    if (!body || posting) return
    if (!name.trim()) {
      setNameError(NO_NAME)
      nameRef.current?.focus()
      return
    }
    setPosting(true)
    setSendError("")
    const res = await createGuestDocComment(token, name, body)
    setPosting(false)
    if (res.ok) {
      saveName(name.trim())
      setPosted((prev) => [...prev, res.data])
      setDraft("")
      setJustPosted(true)
      return
    }
    // The server's words for a view-only link or an empty comment; why to
    // wait for a busy or unreachable server. The draft stays.
    setSendError(sendFailedText(res))
  }

  if (!data) {
    // A dead link is said by the page around this.
    if (trouble === "gone") return null
    return (
      <PaperCard elevation="e1" className="max-w-[816px] p-5 sm:p-6" aria-busy="true">
        {trouble ? (
          <p role="status" className="text-ui-sm text-ink-3">{retryingText[trouble]}</p>
        ) : (
          <p role="status" className="sr-only">Loading comments…</p>
        )}
        <div aria-hidden="true" className="mt-3 grid gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </PaperCard>
    )
  }

  return (
    <PaperCard elevation="e1" className="max-w-[816px] p-5 sm:p-6" data-guest-comments="">
      <section aria-labelledby="guest-comments-title">
        <h2 id="guest-comments-title" className="flex items-baseline gap-2 text-heading text-ink">
          Comments
          {comments.length > 0 && <span className="text-ui-sm font-normal tabular-nums text-ink-3">{comments.length}</span>}
        </h2>

        {comments.length === 0 ? (
          <p className="mt-2 text-ui text-ink-2">{canComment ? "No comments yet. Leave the first one below." : "No comments yet."}</p>
        ) : (
          <ul className="mt-3 grid gap-4">
            {threadsOf(comments).flatMap((t) => [t.comment, ...t.replies]).map((c) => (
              <li key={c.id} className={cn("flex gap-3", c.from_team && "ml-10", posted.some((p) => p.id === c.id) && "content-row-in")} data-guest-reply={c.from_team ? "" : undefined}>
                {/* A teammate's face is their own, seeded by their name as in the workspace; the label says where they're from. */}
                <IdentityMark variant="avatar" size={28} id={avatarSeed(c.author_name || c.guest_name)} label={c.author_name || c.guest_name || "Guest"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-ui font-medium text-ink">{c.guest_name}</span>
                    {c.from_team ? null : <PrincipalTag kind="guest" />}
                    <time className="text-meta text-ink-3" dateTime={c.created_at}>
                      {guestWhen(c.created_at)}
                    </time>
                  </div>
                  {/* Bodies are plain text from the server; render as text (never HTML). */}
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-ui text-ink">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {justPosted ? (
          <p className="mt-3 text-ui-sm text-ink-2" role="status">
            The team sees your comment beside the doc.
          </p>
        ) : null}

        {canComment ? (
          <form
            className="mt-5 rounded-xl bg-sunken p-3"
            data-guest-composer=""
            onSubmit={(e) => {
              e.preventDefault()
              void post()
            }}
          >
            <div className="grid gap-1">
              <label htmlFor={nameId} className="text-ui-sm font-medium text-ink-2">
                Your name
              </label>
              <Input
                ref={nameRef}
                id={nameId}
                name="name"
                value={name}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  setNameError("")
                }}
                autoComplete="name"
                maxLength={GUEST_NAME_MAX}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? `${nameId}-err` : undefined}
                placeholder="So the team knows who wrote this"
              />
            </div>
            {nameError ? (
              <p id={`${nameId}-err`} className="mt-1 text-meta text-danger-ink text-pretty">
                {nameError}
              </p>
            ) : null}
            <label htmlFor={bodyId} className="sr-only">
              Comment
            </label>
            <Textarea
              id={bodyId}
              name="comment"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setSendError("")
                setJustPosted(false)
              }}
              placeholder="What would you change, or what works?"
              rows={3}
              maxLength={4000}
              className="mt-2 max-h-60"
            />
            {sendError && (
              <p role="alert" className="mt-1 text-meta font-medium text-danger-ink">
                {sendError}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="submit" size="sm" disabled={!draft.trim() || !name.trim()} busy={posting}>
                Comment
              </Button>
            </div>
          </form>
        ) : null}
        {canComment ? (
          <GuestDocVerdict token={token} name={name} onNoName={() => { setNameError(NO_NAME); nameRef.current?.focus() }} />
        ) : (
          <p className="mt-4 inline-flex items-center gap-1.5 text-meta text-ink-3">
            <Eye className="size-3.5" aria-hidden="true" /> This link is view only.
          </p>
        )}
      </section>
    </PaperCard>
  )
}
