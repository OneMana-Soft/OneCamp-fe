"use client"

/**
 * The doc's conversation with its guests, under its threads (docs C5-2): each
 * guest's comment, the team's replies to it ("Visible to guest"), a reply box
 * for whoever may comment, and Remove for whoever may moderate. The doc's
 * latest client verdict sits at its top. Nothing at all when no guest has
 * commented and no client has given a verdict.
 */

import * as React from "react"
import dynamic from "next/dynamic"
import { formatDistanceToNow } from "date-fns"

import { Button } from "@/components/ui/button"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/ui/error-state"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import { Check, Eye, Globe, MessageSquare } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { removeGuestComment, replyToGuest, type DocVerdict, type GuestThreadComment } from "@/lib/guestThread/guestThread"
import { threadsOf } from "@/lib/guestThread/threadsOf"
import { useGuestConversation } from "./useGuestConversation"

function When({ at }: { at: string }) {
  return <span className="text-meta text-ink-3">{formatDistanceToNow(new Date(at), { addSuffix: true })}</span>
}

function Verdict({ verdict }: { verdict: DocVerdict }) {
  const approved = verdict.decision === "approved"
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-sunken px-3 py-2.5" data-doc-verdict={verdict.decision}>
      <span aria-hidden="true" className={approved ? "mt-0.5 text-[var(--camp-moss-ink)]" : "mt-0.5 text-warning-ink"}>
        {approved ? <Check className="size-4" /> : <MessageSquare className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui-sm text-ink">
          {approved ? `${verdict.name} approved this doc` : `${verdict.name} asked for changes`} <When at={verdict.created_at} />
        </p>
        {verdict.note ? <p className="mt-0.5 whitespace-pre-wrap text-ui-sm text-ink-2">{verdict.note}</p> : null}
      </div>
    </div>
  )
}

function Comment({ c, children }: { c: GuestThreadComment; children?: React.ReactNode }) {
  return (
    <div className={c.from_team ? "ml-6 border-l border-line pl-3" : ""} data-guest-comment={c.from_team ? "team" : "guest"}>
      <p className="flex flex-wrap items-center gap-x-1.5 text-ui-sm">
        <span className="font-medium text-ink">{c.guest_name}</span>
        {c.from_team ? (
          <span className="inline-flex items-center gap-1 text-meta text-ink-3">
            <Eye aria-hidden="true" className="size-3" />
            Visible to guest
          </span>
        ) : (
          <PrincipalTag kind="guest" />
        )}
        <When at={c.created_at} />
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-body text-ink">{c.body}</p>
      {children}
    </div>
  )
}

// The "⋯" menu, only for someone who may moderate, and loaded only then: its
// menu and its phone sheet stay off the doc's first load.
const CommentMenu = dynamic(() => import("./GuestCommentMenu").then((m) => m.GuestCommentMenu), { ssr: false })

export function GuestConversation({ docId }: { docId: string }) {
  const { thread, verdict } = useGuestConversation(docId)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [replyTo, setReplyTo] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  // A reply opened low in a long thread brings its box and buttons into view, clear of the panel's composer.
  const replyRef = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (replyTo) replyRef.current?.scrollIntoView({ block: "nearest" })
  }, [replyTo])

  const data = thread.data?.data
  const review = verdict.data?.data?.review ?? null
  const threads = threadsOf(data?.comments ?? [])
  if (thread.isError && !data) {
    return <ErrorState compact subject="the guests' comments" onRetry={() => void thread.mutate()} className="px-4" />
  }
  if (!threads.length && !review) return null

  const send = async (parentId: string) => {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await replyToGuest(docId, parentId, draft)
      setDraft("")
      setReplyTo(null)
      await thread.mutate()
    } catch (e) {
      toast({ title: "Your reply wasn't sent", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Guests" className="flex flex-col gap-3 border-line px-3 pb-3 pt-4 not-first:border-t" data-guest-conversation="">
      <h3 className="flex items-center gap-2 px-1 text-meta font-medium text-ink-2">
        <Globe aria-hidden="true" className="size-3.5" />
        Guests
      </h3>
      {review ? <Verdict verdict={review} /> : null}
      {threads.map(({ comment, replies }) => (
        <div key={comment.id} className="flex flex-col gap-2 rounded-xl bg-raised p-3 shadow-e1" data-guest-thread={comment.id}>
          <Comment c={comment} />
          {replies.map((r) => (
            <Comment key={r.id} c={r} />
          ))}
          {replyTo === comment.id ? (
            <form
              ref={replyRef}
              className="ml-6 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send(comment.id)
              }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply… your guest sees this"
                aria-label={`Reply to ${comment.guest_name}, visible to them`}
                maxLength={4000}
                autoFocus
                className="min-h-[72px]"
              />
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" busy={busy} disabled={!draft.trim()}>
                  Reply to guest
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-1">
              {data?.can_reply ? (
                <Button variant="ghost" size="sm" className="text-ink-2" onClick={() => setReplyTo(comment.id)}>
                  Reply
                </Button>
              ) : null}
              {data?.can_moderate ? (
                <CommentMenu
                  name={comment.guest_name}
                  onRemove={() =>
                    confirm({
                      title: `Remove ${comment.guest_name}'s comment?`,
                      description: "It goes from the doc and from the guest's page, with the replies to it. This is recorded.",
                      confirmText: "Remove comment",
                      destructive: true,
                      onConfirm: async () => {
                        try {
                          await removeGuestComment(docId, comment.id)
                          await thread.mutate()
                        } catch (e) {
                          toast({ title: "The comment wasn't removed", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
                        }
                      },
                    })
                  }
                />
              ) : null}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
