import { MessageContent } from "./messageContent"
import {CommentInfoInterface} from "@/types/comment";
import TaskActivity from "@/components/task/taskActivity";
import {ProgressiveList} from "@/components/ui/progressiveList";
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "@/lib/icons";


interface CommentsListProps {
    comments: CommentInfoInterface[],
    removeReaction: (reactionId: string, commentId:string, idx:number) => void
    addOrUpdateReaction: (emojiId:string, reactionId: string, commentUUID:string, idx:number) => void
    removeComment: (id:string, idx: number) => void
    updateComment: (id:string, body: string, idx:number) => void
    getMediaURL: string
}

export const CommentsList = ({ comments, addOrUpdateReaction, removeReaction, removeComment, updateComment, getMediaURL }: CommentsListProps) => {
    if (!comments || comments.length === 0) {
        return null
    }

    return (
        <div className="gap-y-2 flex flex-col">
            {comments.length > 0 &&
                <ProgressiveList
                    items={comments}
                    renderItem={(comment, idx) =><MessageContent
                        key={comment.comment_uuid}
                        userInfo={comment.comment_by}
                        createdAt={comment.comment_created_at}
                        content={comment.comment_text}
                        rawReactions={comment.comment_reactions}
                        addReaction={(emojiId:string, reactionId: string) => {addOrUpdateReaction(emojiId, reactionId, comment.comment_uuid, idx)}}
                        removeReaction={(reactionId: string)=>{removeReaction(reactionId, comment.comment_uuid, idx)}}
                        deleteMessage={(commentUUID)=>{removeComment(commentUUID, idx)}}
                        updateMessage={(commentUUID, body) => {updateComment(commentUUID, body, idx)}}
                        commentUUID={comment.comment_uuid}
                        getMediaUrl={getMediaURL}
                        attachments={comment.comment_attachments}
                    />}
                    getItemKey={(comment) => comment.comment_uuid || ''}
                    emptyState={<EmptyState icon={MessageSquare} title="No comments yet" description="Be the first to share an update or ask a question." className="py-6" />}
                    className=""
                    initialCount={50}
                    batchSize={50}
                />
            }

        </div>
    )
}
