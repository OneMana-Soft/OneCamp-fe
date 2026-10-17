"use client"

/**
 * One thread (docs programme B7; content.md D16): a sunken r12 card with the
 * words it is on, its comments, and what may be done with it. Notion's
 * discussion, with what Notion lacks: an honest "Original text was changed"
 * with one click to put it back where an exact match is (D-9), and an unread
 * dot that clears as you read.
 *
 * - The quote shows the words the thread is on; choosing it shows them in the
 *   doc. A thread whose words were changed says so, keeps its quote, and
 *   offers "Reattach here" when the same words are in the doc; one whose
 *   blocks were removed says that instead.
 * - Resolve and Reopen for whoever may (its author, or anyone who can edit).
 * - Long threads fold: the first comment and the latest two.
 * - The reply box is a light stand-in until it is used: a card list doesn't
 *   build an editor per card.
 * - Each comment is the conversation's own row (MessageContent): edit your
 *   own, delete your own (asked once, in the menu: N45), react; a moderator
 *   (the doc's owner, full access, an admin) may delete anyone's.
 */
import * as React from "react"
import { AlertCircle, Check, RotateCcw } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDispatch } from "react-redux"
import { MessageContent } from "@/components/rightPanel/messageContent"
import { MobileMessage } from "@/components/mobileMessage/mobileMessage"
import { continuedFlags } from "@/lib/messageGrouping"
import { openUI } from "@/store/slice/uiSlice"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { useToast } from "@/hooks/use-toast"
import type { ResolvedAnchor } from "@/lib/anchors/types"
import type { ThreadView } from "@/components/threads/types"
import { CommentComposer } from "./CommentComposer"
import { UnreadDot } from "./UnreadDot"
import { foldComments, lostLabel, onPage, quoteLine, quotesWords, threadLabel } from "./threadView"
import type { ThreadActions } from "./useDocThreads"
import { setUi, uiOf, useUi } from "./commentsUi"
import { reattachAnchor, showInDoc } from "./inDoc"

export interface ThreadCardProps {
    docId: string
    thread: ThreadView
    actions: ThreadActions
    /** Where its words are in the doc beside it; absent where the doc isn't open (the phone's pages). */
    place?: ResolvedAnchor
    /** Exact matches of a changed thread's words, for "Reattach here". */
    matches?: number
    /** The phone's thread page: no card, every comment, the reply box its page's. */
    page?: boolean
}

/** How long an unread thread is in view before it counts as read. */
const SEEN_AFTER_MS = 1200

/** Calls seen once el has been mostly in view for a moment. */
function useSeen(el: React.RefObject<HTMLElement | null>, seen: (() => void) | undefined) {
    const latest = React.useRef(seen)
    React.useLayoutEffect(() => {
        latest.current = seen
    })
    const wanted = !!seen
    React.useEffect(() => {
        const node = el.current
        if (!wanted || !node || typeof IntersectionObserver === "undefined") return
        let timer: ReturnType<typeof setTimeout> | null = null
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) {
                    timer ??= setTimeout(() => latest.current?.(), SEEN_AFTER_MS)
                } else if (timer) {
                    clearTimeout(timer)
                    timer = null
                }
            },
            { threshold: 0.6 },
        )
        io.observe(node)
        return () => {
            io.disconnect()
            if (timer) clearTimeout(timer)
        }
    }, [el, wanted])
}

function IconAction({ label, onClick, children, busy }: { label: string; onClick(): void; children: React.ReactNode; busy?: boolean }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={label}
                    // Busy as Button is (aria-busy), not disabled: a button that
                    // disables under the keyboard drops focus to the page.
                    aria-busy={busy || undefined}
                    onClick={(e) => {
                        e.stopPropagation()
                        if (!busy) onClick()
                    }}
                    {...ix("icon")}
                    data-touch-target=""
                    className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:text-ink aria-busy:pointer-events-none aria-busy:opacity-70 [&_svg]:size-4"
                >
                    {children}
                </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    )
}

export const ThreadCard = React.memo(function ThreadCard({ docId, thread, actions: t, place, matches = 0, page }: ThreadCardProps) {
    const { toast } = useToast()
    const card = React.useRef<HTMLElement>(null)
    const id = thread.id
    const active = useUi(docId, (ui) => ui.active === id)
    const [unfolded, setUnfolded] = React.useState(false)
    const [replying, setReplying] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const replyButton = React.useRef<HTMLButtonElement>(null)

    const fail = React.useCallback(
        (what: string) => (e: unknown) =>
            toast({ title: what, description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
        [toast],
    )

    const { markRead } = t
    const unread = thread.unread
    // Looked at: chosen, or focused into. Its words are drawn strong, and it is read.
    const activate = React.useCallback(() => {
        if (uiOf(docId).active !== id) setUi(docId, { active: id })
        if (unread) void markRead(id)
    }, [docId, id, unread, markRead])
    const hover = (on: boolean) => {
        const now = uiOf(docId).hovered
        setUi(docId, { hovered: on ? id : now === id ? null : now })
    }
    useSeen(card, unread && !page ? () => void markRead(id) : undefined)

    // Its words in the doc beside it, when they are there.
    const inDoc = place?.state === "attached"
    const show = () => {
        setUi(docId, { active: id })
        showInDoc(docId, id)
    }
    const reattach = async () => {
        const anchor = reattachAnchor(docId, thread.anchor.quote)
        if (!anchor) {
            toast({ title: "Couldn't reattach the thread", description: "Those words aren't in the doc any more.", variant: "destructive" })
            return
        }
        setBusy(true)
        try {
            await t.reanchor(id, anchor)
            setUi(docId, { active: id })
            requestAnimationFrame(() => showInDoc(docId, id))
        } catch (e) {
            fail("Couldn't reattach the thread")(e)
        } finally {
            setBusy(false)
        }
    }

    const settle = async (resolve: boolean) => {
        setBusy(true)
        try {
            await (resolve ? t.resolve(thread.id) : t.reopen(thread.id))
        } catch (e) {
            fail(resolve ? "Couldn't resolve the thread" : "Couldn't reopen the thread")(e)
        } finally {
            setBusy(false)
        }
    }

    const detached = place?.state === "detached"
    const anchored = !onPage(thread)
    const quote = quoteLine(thread.anchor.quote)
    const open = thread.status === "open"
    const { shown, hidden, at } = foldComments(thread.comments, unfolded || !!page)
    const mediaUrl = `${GetEndpointUrl.GetDocMedia}/${docId}`

    // A phone's long-press sheet deletes at once: the question is asked here,
    // once (N45). The panel's menu asks in place before it calls.
    const dispatch = useDispatch()
    const confirmRemove = (commentId: string) =>
        dispatch(
            openUI({
                key: "confirmAlert",
                data: {
                    title: "Delete this comment?",
                    description: "It's removed from the doc for everyone. This can't be undone.",
                    confirmText: "Delete comment",
                    destructive: true,
                    onConfirm: () => void t.remove(commentId).catch(fail("Couldn't delete the comment")),
                },
            }),
        )
    // A phone groups a person's comments in a row into one turn, as its threads do.
    const continued = React.useMemo(() => {
        if (!page) return new Map<string, boolean>()
        const flags = continuedFlags(thread.comments, (c) => ({ author: c.comment_by?.user_uuid, at: c.comment_created_at, isBot: !!c.comment_by?.is_bot }))
        return new Map(thread.comments.map((c, i) => [c.comment_uuid, flags[i]]))
    }, [page, thread.comments])

    const react = (commentId: string) => (emojiId: string, reactionId: string) =>
        void t.react(commentId, emojiId, reactionId).catch(fail("Couldn't add your reaction"))
    const unreact = (commentId: string) => (reactionId: string) =>
        void t.unreact(commentId, reactionId).catch(fail("Couldn't take back your reaction"))
    const edit = (id: string, body: string) => void t.edit(id, body).catch(fail("Couldn't save your edit"))

    const row = (c: ThreadView["comments"][number]) =>
        page ? (
            <MobileMessage
                key={c.comment_uuid}
                userInfo={c.comment_by}
                createdAt={c.comment_created_at}
                content={c.comment_text}
                rawReactions={c.comment_reactions}
                attachments={c.comment_attachments}
                commentUUID={c.comment_uuid}
                docId={docId}
                getMediaUrl={mediaUrl}
                addReaction={react(c.comment_uuid)}
                removeReaction={unreact(c.comment_uuid)}
                updateMessage={edit}
                deleteMessage={confirmRemove}
                continued={continued.get(c.comment_uuid)}
            />
        ) : (
            <MessageContent
                key={c.comment_uuid}
                userInfo={c.comment_by}
                createdAt={c.comment_created_at}
                content={c.comment_text}
                rawReactions={c.comment_reactions}
                attachments={c.comment_attachments}
                commentUUID={c.comment_uuid}
                getMediaUrl={mediaUrl}
                isAdmin={t.canModerate}
                addReaction={react(c.comment_uuid)}
                removeReaction={unreact(c.comment_uuid)}
                updateMessage={edit}
                // Asked once, in the menu that offered it (N45).
                deleteMessage={(id) => void t.remove(id).catch(fail("Couldn't delete the comment"))}
            />
        )

    return (
        <article
            ref={card}
            data-thread-card=""
            data-thread-id={thread.id}
            data-active={active || undefined}
            aria-label={threadLabel(thread)}
            // Focusable from code (a thread asked for is brought into view and
            // focused), not a Tab stop of its own: its controls are.
            tabIndex={-1}
            onClick={activate}
            // Focus into it looks at it; not focus back on the reply stand-in
            // after Esc, which let go of it (its own click activates it).
            onFocus={(e) => {
                if (e.target !== replyButton.current) activate()
            }}
            onPointerEnter={page ? undefined : () => hover(true)}
            onPointerLeave={page ? undefined : () => hover(false)}
            className={cn(
                page
                    ? "flex flex-col gap-1 outline-none"
                    : "content-rise flex flex-col gap-1 rounded-xl bg-sunken px-1.5 py-1.5 outline-none transition-[background-color,box-shadow,translate] duration-[140ms] ease-out focus-visible:ring-2 focus-visible:ring-ring",
                !page && active && "bg-raised shadow-e2",
            )}
        >
            <header className="flex min-h-7 items-start gap-1.5 pl-2.5 pr-0.5">
                {thread.unread && <UnreadDot className="mt-[11px]" />}
                {anchored ? (
                    <button
                        type="button"
                        data-thread-quote=""
                        disabled={!inDoc}
                        onClick={(e) => {
                            e.stopPropagation()
                            show()
                        }}
                        title={inDoc ? "Show in the doc" : undefined}
                        className={cn(
                            "mt-1 min-w-0 flex-1 rounded-[4px] border-l-2 pl-2 text-left text-ui-sm transition-colors duration-[140ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                            detached ? "border-ink-4 text-ink-3" : "border-camp-sun text-ink-2 enabled:hover:text-ink",
                        )}
                    >
                        <span className="line-clamp-2">{quote || "This block"}</span>
                    </button>
                ) : (
                    <span className="mt-1.5 min-w-0 flex-1 text-meta text-ink-3">On the page</span>
                )}
                {thread.can_resolve && (
                    <span className="flex shrink-0">
                        {open ? (
                            <IconAction label="Resolve" onClick={() => void settle(true)} busy={busy}>
                                <Check aria-hidden="true" />
                            </IconAction>
                        ) : (
                            <IconAction label="Reopen" onClick={() => void settle(false)} busy={busy}>
                                <RotateCcw aria-hidden="true" />
                            </IconAction>
                        )}
                    </span>
                )}
            </header>

            {detached && (
                <p data-thread-detached="" className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-2.5 text-meta text-ink-3">
                    <span className="inline-flex items-center gap-1">
                        <AlertCircle className="size-3.5" aria-hidden="true" />
                        {lostLabel(thread.anchor)}
                    </span>
                    {matches > 0 && thread.can_resolve && quotesWords(thread.anchor) && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                                e.stopPropagation()
                                void reattach()
                            }}
                            className="rounded-[4px] font-medium text-ink-2 underline decoration-ink-4 underline-offset-2 transition-colors duration-[140ms] ease-out hover:text-ink hover:decoration-ink-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                            {matches === 1 ? "Reattach here" : "Reattach to the first match"}
                        </button>
                    )}
                </p>
            )}

            <div className="flex flex-col">
                {shown.slice(0, at).map(row)}
                {hidden > 0 && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            setUnfolded(true)
                        }}
                        className="mx-4 my-0.5 self-start rounded-[4px] text-meta font-medium text-ink-2 transition-colors duration-[140ms] ease-out hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                        {hidden === 1 ? "Show 1 more reply" : `Show ${hidden} more replies`}
                    </button>
                )}
                {shown.slice(at).map(row)}
            </div>

            {!page && open && thread.can_reply && (
                <div className="px-1.5 pb-0.5 pt-1">
                    {replying || active ? (
                        <CommentComposer
                            docId={docId}
                            placeholder="Reply…"
                            label="Reply in this thread"
                            sendLabel="Reply"
                            autoFocus={replying}
                            onSend={(b) => t.reply(thread.id, b)}
                            onCancel={() => {
                                // Let go of the card too: its reply box goes, and focus
                                // returns to the stand-in that opened it.
                                setReplying(false)
                                if (uiOf(docId).active === id) setUi(docId, { active: null })
                                requestAnimationFrame(() => replyButton.current?.focus())
                            }}
                        />
                    ) : (
                        <button
                            ref={replyButton}
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setReplying(true)
                                activate()
                            }}
                            className="flex h-9 w-full items-center rounded-xl bg-raised px-3 text-left text-body text-ink-3 shadow-e1 transition-shadow duration-[140ms] ease-out hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                            Reply…
                        </button>
                    )}
                </div>
            )}
        </article>
    )
})
