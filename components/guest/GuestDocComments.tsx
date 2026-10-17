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
import { Button } from "@/components/ui/button"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Skeleton } from "@/components/ui/skeleton"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { PaperCard } from "@/components/guest/PublicFrame"
import { Eye, Loader2 } from "@/lib/icons"
import {
  listGuestDocComments,
  createGuestDocComment,
  type GuestDocComment,
} from "@/services/guestService"
import { retryingText, sendFailedText } from "@/services/publicApi"
import { GUEST_NAME_MAX, guestWhen, useGuestAnswer, useGuestName } from "@/components/guest/guestUi"
import { cn } from "@/lib/utils/helpers/cn"

interface GuestDocCommentsProps {
  token: string
}

const NO_NAME = "Add your name first, so the team knows who wrote this."

/**
 * The comments card under the shared doc (content.md D21): 816 px, r16, e1,
 * 24 px in, the comments in the doc panel's card style (an avatar in the
 * guest's hue, the name, the Guest tag, when, then the words at 14/22). The
 * composer is a floating card: "Your name" inline at the top (remembered for
 * this link), the comment at 15/23, and Comment, enabled once both are filled.
 * A new comment rises in (row-in) with a line saying the team will see it.
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
            {comments.map((c) => (
              <li key={c.id} className={cn("flex gap-3", posted.some((p) => p.id === c.id) && "content-row-in")}>
                <IdentityMark variant="avatar" size={28} id={avatarSeed(c.guest_name)} label={c.guest_name || "Guest"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-ui font-medium text-ink">{c.guest_name}</span>
                    <PrincipalTag kind="guest" />
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
            className="composer-card mt-5 rounded-xl bg-raised p-3"
            data-guest-composer=""
            onSubmit={(e) => {
              e.preventDefault()
              void post()
            }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor={nameId} className="shrink-0 text-ui-sm text-ink-3">
                Your name
              </label>
              <input
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
                className="h-8 min-w-0 flex-1 rounded-lg bg-sunken px-2.5 text-ui text-ink outline-none placeholder:text-ink-3 focus-visible:focus-halo aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive max-sm:text-base sm:max-w-60"
                placeholder="So the team knows who wrote this"
              />
            </div>
            {nameError ? (
              <p id={`${nameId}-err`} className="mt-1 text-meta text-danger-ink">
                {nameError}
              </p>
            ) : null}
            <label htmlFor={bodyId} className="sr-only">
              Comment
            </label>
            <textarea
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
              className="mt-2 block w-full resize-y bg-transparent px-0.5 text-body text-ink outline-none placeholder:text-ink-3 max-sm:text-base"
            />
            {sendError && (
              <p role="alert" className="mt-1 text-meta font-medium text-danger-ink">
                {sendError}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="submit" size="sm" disabled={posting || !draft.trim() || !name.trim()} className="relative">
                <span className={cn(posting && "invisible")}>Comment</span>
                {posting ? <Loader2 className="absolute size-3.5 animate-spin" aria-label="Posting" /> : null}
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 inline-flex items-center gap-1.5 text-meta text-ink-3">
            <Eye className="size-3.5" aria-hidden="true" /> This link is view only.
          </p>
        )}
      </section>
    </PaperCard>
  )
}
