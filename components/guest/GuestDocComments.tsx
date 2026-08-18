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
 * Identity: the guest enters a display name once (kept in localStorage for
 * convenience). It is attribution only and never resolves to a member account.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Loader2, MessageSquare, Eye } from "@/lib/icons"
import {
  listGuestDocComments,
  createGuestDocComment,
  type GuestDocComment,
} from "@/services/guestService"
import { formatDistanceToNow } from "date-fns"

const NAME_KEY = "oc_guest_name"

interface GuestDocCommentsProps {
  token: string
}

export function GuestDocComments({ token }: GuestDocCommentsProps) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [canComment, setCanComment] = React.useState(false)
  const [comments, setComments] = React.useState<GuestDocComment[]>([])
  const [name, setName] = React.useState("")
  const [draft, setDraft] = React.useState("")
  const [posting, setPosting] = React.useState(false)

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY)
      if (saved) setName(saved)
    } catch {
      /* localStorage may be blocked; name stays empty */
    }
    let alive = true
    listGuestDocComments(token)
      .then((res) => {
        if (!alive) return
        setCanComment(res.capability === "comment")
        setComments(res.comments)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token])

  const post = async () => {
    const body = draft.trim()
    if (!body) return
    if (!name.trim()) {
      toast({ title: "Please add your name first", variant: "destructive" })
      return
    }
    setPosting(true)
    try {
      localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      /* ignore */
    }
    const res = await createGuestDocComment(token, name, body)
    setPosting(false)
    if (res.ok) {
      setComments((prev) => [...prev, res.comment])
      setDraft("")
      return
    }
    toast({
      title:
        res.error === "view_only"
          ? "This link is view only"
          : res.error === "empty"
            ? "Please enter a comment"
            : "Couldn't post your comment",
      variant: "destructive",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <section className="mt-8 border-t border-border/60 pt-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        Comments
        {comments.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {comments.length}
          </span>
        )}
      </div>

      {comments.length === 0 ? (
        <p className="rounded-lg border border-border/50 bg-card/30 px-3 py-4 text-center text-xs text-muted-foreground">
          {canComment ? "No comments yet. Be the first to leave feedback." : "No comments yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                  {(c.guest_name || "G").charAt(0)}
                </span>
                <span className="text-xs font-medium text-foreground">{c.guest_name}</span>
                <PrincipalTag kind="guest" />
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
              </div>
              {/* Bodies are plain text from the server; render as text (never HTML). */}
              <p className="whitespace-pre-wrap break-words pl-8 text-sm text-foreground/90">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <div className="mt-4 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={80}
            className="h-9 text-sm"
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            maxLength={4000}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={post} disabled={posting || !draft.trim()}>
              {posting ? "Posting…" : "Comment"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Eye className="h-3 w-3" /> This link is view only.
        </p>
      )}
    </section>
  )
}

export default GuestDocComments
