"use client"

import {CommentInfoInterface} from "@/types/comment";
import {MobileMessage} from "@/components/mobileMessage/mobileMessage";
import {UserProfileDataInterface} from "@/types/user";
import { continuedFlags } from "@/lib/messageGrouping";

interface CommentsListProps {
    comments: CommentInfoInterface[]
    addReaction: (emojiId:string, reactionId: string, commentId: string, idx: number) => void
    removeReaction: (reactionId: string, commentId: string, idx:number) => void
    updateMessage: (id: string, body: string, idx:number) => void;
    deleteMessage: (id: string, idx:number) => void;
    getMediaURL: string
    docId?: string
    postUUID?: string
    chatUUID?: string
    chatMessageUUID?: string
    channelUUID?: string
    groupUUID?: string
    isAdmin?: boolean

}

export const MobileMessageCommentList = ({ groupUUID, docId, updateMessage, isAdmin, deleteMessage, postUUID, channelUUID, chatUUID, chatMessageUUID, removeReaction, comments, getMediaURL, addReaction }: CommentsListProps) => {


    if (!comments || comments.length === 0) {
        return null
    }

    // Replies by the same person within five minutes read as one turn.
    const continued = continuedFlags(comments, (c) => ({ author: c.comment_by?.user_uuid, at: c.comment_created_at, isBot: !!c.comment_by?.is_bot }))



    return (
        <div className="">
            {comments?.map((comment, idx) => (
                <MobileMessage
                    key={comment.comment_uuid}
                    userInfo={comment?.comment_by || {} as UserProfileDataInterface}
                    createdAt={comment?.comment_created_at || ''}
                    grpId={groupUUID}
                    content={comment.comment_text}
                    attachments={comment.comment_attachments}
                    addReaction={(emojiId:string, reactionId: string)=>{addReaction(emojiId, reactionId, comment.comment_uuid, idx)}}
                    removeReaction={(reactionId: string)=>{removeReaction(reactionId, comment.comment_uuid, idx)}}
                    updateMessage={(id: string, body: string)=>{updateMessage(id, body, idx)}}
                    deleteMessage={(id: string)=>{deleteMessage(id, idx)}}
                    getMediaUrl={getMediaURL}
                    commentUUID={comment.comment_uuid}
                    chatUUID={chatUUID}
                    chatMessageUUID={chatMessageUUID}
                    channelUUID={channelUUID}
                    postUUID={postUUID}
                    docId={docId}
                    rawReactions={comment.comment_reactions}
                    isAdmin={isAdmin}
                    continued={continued[idx]}
                />
            ))}
        </div>
    )
}
