"use client"

import { DocAccessNote } from "@/components/docEditor/DocAccessNote"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotComment } from "@/components/ui/graphics/hubSpots"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { MessageSquare } from "@/lib/icons"
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader"
import { useMedia } from "@/context/MediaQueryContext"
import { Separator } from "@/components/ui/separator"
import { CommentComposer } from "@/components/docComments/CommentComposer"
import { ThreadCard } from "@/components/docComments/ThreadCard"
import { NewThreadCard, ThreadsSkeleton, ThreadsToolbar, useThreadList } from "@/components/docComments/ThreadsPanelParts"
import { useMatches, usePlaces, useUi } from "@/components/docComments/commentsUi"
import { useDocThreads } from "@/components/docComments/useDocThreads"

/**
 * A doc's comments beside it (docs programme B7; content.md D16): its threads
 * as cards, Open and Resolved, from anyone or one person, with the page's own
 * composer at the foot. A thread being started on the doc's words is written
 * at the top. Each card shows the words it is on, and choosing them shows
 * them in the doc; a thread whose words were changed says so (D-9).
 *
 * The threads come from one place (useDocThreads), live; a failed read is an
 * error with Try again, never "No comments yet" (I19, N46).
 */
export const DocCommentList = ({ docId }: { docId: string }) => {
    const { isDesktop } = useMedia()
    const t = useDocThreads(docId)
    const places = usePlaces(docId)
    const pending = useUi(docId, (ui) => ui.pending)
    const view = useThreadList(docId, t, places)

    // How many exact matches each changed thread's words have, for "Reattach here".
    const matches = useMatches(docId)

    return (
        <div data-doc-comments="" className="flex h-full flex-col">
            {isDesktop && (
                <>
                    <RightPanelHeader titleKey="docComment" />
                    <Separator orientation="horizontal" />
                </>
            )}
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

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" aria-busy={t.status === "loading"}>
                {pending && t.canComment && <NewThreadCard key={pending.start ?? pending.block_id ?? "new"} docId={docId} anchor={pending} t={t} />}
                {t.isError ? (
                    // Ahead of every empty branch: "No comments yet" would invite
                    // a comment on a doc whose discussion just failed to load. A
                    // doc in the trash (410) has nothing to try again.
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
                ) : view.list.length === 0 && !pending ? (
                    <EmptyState
                        // The v3 spot, not a lone outline icon (QA DSA-18).
                        illustration={<SpotComment size={64} />}
                        title="No comments yet"
                        description={
                            t.canComment
                                ? "Select any text in the doc and choose Comment, or comment on the page below."
                                : "No one has commented on this doc yet."
                        }
                        className="py-8"
                    />
                ) : (
                    view.list.map((th) => (
                        <ThreadCard key={th.id} docId={docId} thread={th} actions={t.actions} place={places.get(th.id)} matches={matches.get(th.id)} />
                    ))
                )}
            </div>

            {!t.canComment && !t.isDeleted && t.level !== "none" && (
                // Said, never a box that silently isn't there (docs incident, 14 Oct 2026).
                <DocAccessNote docId={docId} level={t.level} want="comment" suffix=", so you can't comment on it" className="shrink-0 border-t border-line px-4 py-3" />
            )}
            {t.canComment && !t.isDeleted && (
                <div className="shrink-0 p-3 pt-1">
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
