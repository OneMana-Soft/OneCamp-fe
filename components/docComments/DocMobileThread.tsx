"use client"

/**
 * One thread on a phone (docs programme B7, N33): its own page, live. Its
 * words, every comment, and the reply box docked above the keyboard; a
 * resolved thread offers Reopen there instead. Opening it reads it. A thread
 * that is gone (its comments deleted, or the doc no longer shared) says so,
 * with the way back.
 *
 * The new-thread page is here too: Comment on the doc's words, on a phone,
 * comes here with them, and sending makes the thread and opens its page.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { MessageSquare, RotateCcw } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { CommentComposer } from "./CommentComposer"
import { ThreadCard } from "./ThreadCard"
import { ThreadsSkeleton } from "./ThreadsPanelParts"
import { setUi, useUi } from "./commentsUi"
import { setPhoneModerator } from "./phoneModeration"
import { quoteLine } from "./threadView"
import { useDocThreads } from "./useDocThreads"

const docPath = (docId: string) => `/app/doc/${docId}`

/** The bar docked at the foot of a phone's comment page, above the keyboard and the home indicator. */
function Dock({ children }: { children: React.ReactNode }) {
    return <div className="shrink-0 border-t border-line bg-sheet px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{children}</div>
}

export function DocMobileThread({ docId, threadId }: { docId: string; threadId: string }) {
    const t = useDocThreads(docId)
    const { toast } = useToast()
    const thread = t.threads.find((x) => x.id === threadId)

    // Opening it reads it; it stays the thread looked at while open.
    const { markRead } = t
    const unread = !!thread?.unread
    React.useEffect(() => {
        if (unread) void markRead(threadId)
    }, [unread, threadId, markRead])
    React.useEffect(() => {
        setUi(docId, { active: threadId })
        return () => setUi(docId, { active: null })
    }, [docId, threadId])
    // Its long-press sheet offers Delete on anyone's comment to a moderator.
    React.useEffect(() => setPhoneModerator(docId, t.canModerate), [docId, t.canModerate])

    const reopen = async () => {
        try {
            await t.reopen(threadId)
        } catch (e) {
            toast({ title: "Couldn't reopen the thread", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
        }
    }

    let body: React.ReactNode
    if (t.isError) {
        body = t.isDeleted ? (
            <EmptyState icon={MessageSquare} title="This doc was deleted" description="Its comments come back if the doc is restored." className="py-8" />
        ) : (
            <ErrorState subject="this thread" detail={t.errorDetail} onRetry={() => void t.mutate()} className="py-8" />
        )
    } else if (!thread && t.status === "loading") {
        body = <ThreadsSkeleton cards={1} />
    } else if (!thread) {
        body = (
            <EmptyState
                icon={MessageSquare}
                title="This thread isn't here any more"
                description="Its comments may have been deleted. The doc's other comments are still there."
                className="py-8"
                action={
                    <Button variant="outline" size="sm" asChild>
                        <Link href={`${docPath(docId)}/comment`}>All comments</Link>
                    </Button>
                }
            />
        )
    } else {
        body = <ThreadCard docId={docId} thread={thread} actions={t.actions} page />
    }

    return (
        <div data-doc-thread-page="" className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-1 pb-3 pt-2">{body}</div>
            {thread && thread.status === "open" && thread.can_reply && (
                <Dock>
                    <CommentComposer docId={docId} placeholder="Reply…" label="Reply in this thread" sendLabel="Reply" onSend={(b) => t.reply(threadId, b)} />
                </Dock>
            )}
            {thread && thread.status === "resolved" && (
                <Dock>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-ui-sm text-ink-2">This thread is resolved.</span>
                        {thread.can_resolve && (
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void reopen()}>
                                <RotateCcw className="size-3.5" aria-hidden="true" />
                                Reopen
                            </Button>
                        )}
                    </div>
                </Dock>
            )}
        </div>
    )
}

export function DocMobileNewThread({ docId }: { docId: string }) {
    const t = useDocThreads(docId)
    const router = useRouter()
    const pending = useUi(docId, (ui) => ui.pending)

    if (!pending) {
        return (
            <EmptyState
                icon={MessageSquare}
                title="Choose what to comment on"
                description="Select text in the doc and tap Comment, or comment on the whole page from Comments."
                className="py-12"
                action={
                    <Button variant="outline" size="sm" asChild>
                        <Link href={docPath(docId)}>Back to the doc</Link>
                    </Button>
                }
            />
        )
    }

    return (
        <div data-doc-new-thread="" className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-4 pt-4">
                <p className="mb-1 text-meta text-ink-3">Commenting on</p>
                <p className="line-clamp-4 border-l-2 border-camp-sun pl-2.5 text-body text-ink-2">{quoteLine(pending.quote, 400) || "This block"}</p>
            </div>
            <Dock>
                <CommentComposer
                    docId={docId}
                    autoFocus
                    placeholder="Add a comment…"
                    label="Comment on the selected text"
                    sendLabel="Comment"
                    onSend={async (b) => {
                        const thread = await t.start(pending, b)
                        setUi(docId, { pending: null })
                        router.replace(`${docPath(docId)}/comment/${encodeURIComponent(thread.id)}`)
                    }}
                    onCancel={() => {
                        setUi(docId, { pending: null })
                        router.back()
                    }}
                />
            </Dock>
        </div>
    )
}
