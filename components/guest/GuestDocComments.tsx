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

import * as React from "react"
import { Button } from "@/components/ui/button"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageSquare, Eye } from "@/lib/icons"
import {
  listGuestDocComments,
  createGuestDocComment,
  type GuestDocComment,
} from "@/services/guestService"
import { retryingText, sendFailedText } from "@/services/publicApi"
import { GUEST_NAME_MAX, guestWhen, useGuestAnswer, useGuestName } from "@/components/guest/guestUi"

interface GuestDocCommentsProps {
  token: string
}

const NO_NAME = "Add your name first, so the team knows who wrote this."

export function GuestDocComments({ token }: GuestDocCommentsProps) {
  // Asked for again while the server is busy or out of reach.
  const { data, trouble } = useGuestAnswer(`doc-comments:${token}`, () => listGuestDocComments(token))
  const [posted, setPosted] = React.useState<GuestDocComment[]>([])
  const canComment = data?.capability === "comment"
  const comments = [...(data?.comments ?? []), ...posted]
  // The name this browser remembers for this link, until the guest edits it.
  const [savedName, saveName] = useGuestName(token)
  const [nameDraft, setNameDraft] = React.useState<string | null>(null)
  const name = nameDraft ?? savedName
  const [draft, setDraft] = React.useState("")
  const [posting, setPosting] = React.useState(false)
  const [nameError, setNameError] = React.useState("")
  const [sendError, setSendError] = React.useState("")
  const nameRef = React.useRef<HTMLInputElement>(null)

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
      <section aria-busy="true" className="mt-8 border-t border-border/60 pt-6">
        {trouble ? (
          <p role="status" className="text-sm text-muted-foreground">{retryingText[trouble]}</p>
        ) : (
          <p role="status" className="sr-only">Loading comments…</p>
        )}
        <div aria-hidden="true" className="mt-3 grid gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="guest-comments-title" className="mt-8 border-t border-border/60 pt-6">
      <h2 id="guest-comments-title" className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="h-4 w-4 self-center text-muted-foreground" aria-hidden="true" />
        Comments
        {comments.length > 0 && (
          <span className="text-xs font-normal tabular-nums text-muted-foreground">{comments.length}</span>
        )}
      </h2>

      {comments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {canComment ? "No comments yet. Leave the first one below." : "No comments yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {comments.map((c) => (
            <li key={c.id} className="py-3">
              <div className="mb-1 flex items-center gap-2">
                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-2xs font-medium uppercase text-muted-foreground">
                  {(c.guest_name || "G").charAt(0)}
                </span>
                <span className="text-sm font-medium text-foreground">{c.guest_name}</span>
                <PrincipalTag kind="guest" />
                <time className="text-xs text-muted-foreground" dateTime={c.created_at}>
                  {guestWhen(c.created_at)}
                </time>
              </div>
              {/* Bodies are plain text from the server; render as text (never HTML). */}
              <p className="max-w-prose whitespace-pre-wrap break-words pl-8 text-sm text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void post()
          }}
        >
          <Field label="Your name" error={nameError} className="max-w-xs">
            <Input
              ref={nameRef}
              name="name"
              value={name}
              onChange={(e) => {
                setNameDraft(e.target.value)
                setNameError("")
              }}
              autoComplete="name"
              maxLength={GUEST_NAME_MAX}
            />
          </Field>
          <Field label="Comment">
            <Textarea
              name="comment"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setSendError("")
              }}
              placeholder="What would you change, or what works?"
              rows={3}
              maxLength={4000}
              className="resize-y"
            />
          </Field>
          {sendError && (
            <p role="alert" className="text-xs font-medium text-danger-ink">
              {sendError}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={posting || !draft.trim()}>
              {posting ? "Posting…" : "Comment"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" aria-hidden="true" /> This link is view only.
        </p>
      )}
    </section>
  )
}
