"use client"

import dynamic from "next/dynamic"
import { DocAccessNote } from "@/components/docEditor/DocAccessNote"
import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { MessageSquare } from "@/lib/icons"
import { CommentComposer } from "@/components/docComments/CommentComposer"
import { ThreadRow } from "@/components/docComments/ThreadRow"
import { ThreadsSkeleton, ThreadsToolbar, useThreadList } from "@/components/docComments/ThreadsPanelParts"
import { useDocThreads } from "@/components/docComments/useDocThreads"
import { guestsSpoke, useGuestConversation } from "@/components/docComments/useGuestConversation"

// The doc's conversation with its guests, loaded off the first load: most docs have none.
const GuestConversation = dynamic(() => import("@/components/docComments/GuestConversation").then((m) => m.GuestConversation), { ssr: false })

/**
 * A doc's comments on a phone (docs programme B7): its threads, Open and
 * Resolved, from anyone or one person, each opening its own live page, and
 * the page's composer at the foot. Live where the doc's page isn't mounted:
 * the doc's topic is subscribed here (N33). A failed read is an error with Try
 * again, never "No comments yet" (I19, N46).
 */
export const DocMobileCommentList = ({ docId }: { docId: string }) => {
    const t = useDocThreads(docId)
    const view = useThreadList(docId, t)
    // "No comments yet" only when the whole page is: not over guests' comments.
    const guests = guestsSpoke(useGuestConversation(docId))

    // A notice names one comment (?comment=): its thread's own page, once it is here.
    const router = useRouter()
    const named = useSearchParams()?.get("comment")
    const holder = named ? t.threads.find((x) => x.comments.some((c) => c.comment_uuid === named))?.id : undefined
    useEffect(() => {
        if (holder) router.replace(`/app/doc/${docId}/comment/${encodeURIComponent(holder)}`)
    }, [holder, docId, router])

    return (
        <div data-doc-comments="" className="flex h-full flex-col">
            {!t.isError && t.threads.length > 0 && (
                <ThreadsToolbar
                    tab={view.tab}
                    onTab={view.setTab}
                    counts={view.counts}
                    people={view.people}
                    person={view.person}
                    onPerson={view.setPerson}
                    me={t.me?.user_uuid}
                />
            )}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-2" aria-busy={t.status === "loading"}>
                {t.isError ? (
                    // In the trash (410): nothing to try again, and nothing to add.
                    t.isDeleted ? (
                        <EmptyState icon={MessageSquare} title="This doc was deleted" description="Its comments come back if the doc is restored." className="py-8" />
                    ) : (
                        <ErrorState subject="the comments" detail={t.errorDetail} onRetry={() => void t.mutate()} className="py-8" />
                    )
                ) : t.status === "loading" && t.threads.length === 0 ? (
                    <ThreadsSkeleton />
                ) : view.list.length === 0 && view.person ? (
                    <EmptyState
                        icon={MessageSquare}
                        title={view.tab === "open" ? `No open threads from ${view.personName}` : `Nothing resolved from ${view.personName}`}
                        className="py-8"
                        action={
                            <Button variant="outline" size="sm" onClick={() => view.setPerson("")}>
                                Show everyone&apos;s
                            </Button>
                        }
                    />
                ) : view.list.length === 0 && view.tab === "resolved" ? (
                    <EmptyState
                        icon={MessageSquare}
                        title="Nothing resolved yet"
                        description="Resolve a thread when it's settled. It's kept here, and can be reopened."
                        className="py-8"
                    />
                ) : view.list.length === 0 && guests === false ? (
                    <EmptyState
                        icon={MessageSquare}
                        title="No comments yet"
                        description={
                            t.canComment
                                ? "Select text in the doc and tap Comment, or comment on the page below."
                                : "No one has commented on this doc yet."
                        }
                        className="py-8"
                    />
                ) : (
                    view.list.map((th) => <ThreadRow key={th.id} docId={docId} thread={th} />)
                )}
                {!t.isDeleted ? <GuestConversation docId={docId} /> : null}
            </div>
            {!t.canComment && !t.isDeleted && t.level !== "none" && (
                // Said, never a box that silently isn't there (docs incident, 14 Oct 2026).
                <DocAccessNote docId={docId} level={t.level} want="comment" suffix=", so you can't comment on it" className="shrink-0 border-t border-line px-4 py-3" />
            )}
            {t.canComment && !t.isDeleted && (
                <div className="shrink-0 border-t border-line px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
                    <CommentComposer
                        docId={docId}
                        placeholder="Comment on this page…"
                        label="Comment on the page"
                        sendLabel="Comment"
                        onSend={(b) => t.start({ kind: "none" }, b)}
                    />
                </div>
            )}
        </div>
    )
}
