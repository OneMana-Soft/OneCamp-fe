import { MessageContent } from "./messageContent"
import {CommentInfoInterface} from "@/types/comment";
import {ProgressiveList} from "@/components/ui/progressiveList";
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "@/lib/icons";
import { memo, useMemo, useState } from "react";
import { continuedFlags } from "@/lib/messageGrouping";
import { useStableCallback } from "@/hooks/useStableCallback";


interface CommentsListProps {
    comments: CommentInfoInterface[],
    removeReaction: (reactionId: string, commentId:string, idx:number) => void
    addOrUpdateReaction: (emojiId:string, reactionId: string, commentUUID:string, idx:number) => void
    removeComment: (id:string, idx: number) => void
    updateComment: (id:string, body: string, idx:number) => Promise<boolean> | boolean | void
    getMediaURL: string
    /** Shown when there are no replies yet (a thread); nothing when not given. */
    empty?: React.ReactNode
}

// The panel around this list re-renders on every keystroke in its composer and
// recreates these handlers each time. The outer shell hands the list stable
// wrappers that call the latest handler, so the replies re-render only when
// they change.
export const CommentsList = ({ comments, addOrUpdateReaction, removeReaction, removeComment, updateComment, getMediaURL, empty }: CommentsListProps) => {
    return (
        <CommentsListInner
            empty={empty}
            comments={comments}
            addOrUpdateReaction={useStableCallback(addOrUpdateReaction)}
            removeReaction={useStableCallback(removeReaction)}
            removeComment={useStableCallback(removeComment)}
            updateComment={useStableCallback(updateComment)}
            getMediaURL={getMediaURL}
        />
    )
}

// A doc's comments are thread cards of their own (components/docComments/ThreadCard).
const CommentsListInner = memo(function CommentsListInner({ comments, addOrUpdateReaction, removeReaction, removeComment, updateComment, getMediaURL, empty }: CommentsListProps) {
    // Replies by the same person within five minutes read as one turn.
    const continued = useMemo(
        () => continuedFlags(comments ?? [], (c) => ({ author: c.comment_by?.user_uuid, at: c.comment_created_at, isBot: !!c.comment_by?.is_bot })),
        [comments],
    )
    // The replies a thread opened with follow its panel in, 40 ms apart, the
    // first six only (C36); one that arrives later rises in on its own.
    const [initialCount] = useState(() => comments?.length ?? 0)
    if (!comments || comments.length === 0) {
        return <>{empty ?? null}</>
    }

    return (
        <div className="flex flex-col">
            {comments.length > 0 &&
                <ProgressiveList
                    items={comments}
                    renderItem={(comment, idx) => {
                        const message = <MessageContent
                        key={comment.comment_uuid}
                        userInfo={comment.comment_by}
                        createdAt={comment.comment_created_at}
                        updatedAt={comment.comment_updated_at}
                        content={comment.comment_text}
                        rawReactions={comment.comment_reactions}
                        addReaction={(emojiId:string, reactionId: string) => {addOrUpdateReaction(emojiId, reactionId, comment.comment_uuid, idx)}}
                        removeReaction={(reactionId: string)=>{removeReaction(reactionId, comment.comment_uuid, idx)}}
                        deleteMessage={(commentUUID)=>{removeComment(commentUUID, idx)}}
                        updateMessage={(commentUUID, body) => updateComment(commentUUID, body, idx)}
                        commentUUID={comment.comment_uuid}
                        getMediaUrl={getMediaURL}
                        attachments={comment.comment_attachments}
                        continued={continued[idx]}
                    />
                        // A reply that arrives slides in; the first six stagger in with the panel (chat v3).
                        return (
                            <div
                                key={comment.comment_uuid}
                                className={idx >= initialCount ? "animate-msg-in" : idx < 6 ? "animate-panel-in" : undefined}
                                style={idx < 6 && idx < initialCount ? { animationDelay: `${idx * 40}ms` } : undefined}
                            >
                                {message}
                            </div>
                        )
                    }}
                    getItemKey={(comment) => comment.comment_uuid || ''}
                    emptyState={<EmptyState icon={MessageSquare} title="No comments yet" description="Be the first to share an update or ask a question." className="py-6" />}
                    className=""
                    initialCount={50}
                    batchSize={50}
                />
            }

        </div>
    )
})
