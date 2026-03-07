import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq} from "@/types/attachment";
import {FilePreview} from "@/store/slice/channelSlice";
import {CommentInfoInterface} from "@/types/comment";
import {GroupedReaction} from "@/types/reaction";
import {UserProfileDataInterface} from "@/types/user";

interface createOrUpdateCommentBody {
    body: string
    channelId: string
}

interface AddPreviewFiles {
    filesUploaded: FilePreview
    channelId: string
}

interface RemoveUploadedFile {
    key: string,
    channelId: string
}

interface ClearInputState {
    channelId: string,
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    channelId: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    channelId: string
}

interface UpdatePreviewFilesUUID {
    key: string,
    uuid: string,
    channelId: string
}

interface UpdatePostComment {
    postId: string,
    comments: CommentInfoInterface[]
}

interface UpdateCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}


interface UpdateCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}


interface CreateCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreateCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface RemoveCommentReaction {
    postId: string
    reactionId: string,
    commentIndex: number,
}

interface RemoveCommentReactionByCommentId {
    postId: string
    reactionId: string,
    commentId: string,
}

interface UpdateChannelCommentReactionId {
    postId: string
    commentIndex: number
    oldReactionId: string
    newReactionId: string
}

interface UpdateComment {
    postId: string
    commentIndex: number
    htmlText: string
}

interface UpdateCommentByCommentUUID {
    postId: string
    commentUUID: string
    htmlText: string
}

interface RemoveComment {
    postId: string
    commentIndex: number
}

interface RemoveCommentByCommentUUID {
    postId: string
    commentUUID: string
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    postId: string
    attachments: AttachmentMediaReq[]
}

export interface commentInputState {
    commentMsgBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[],
}
export interface  ExtendedComments {
    [key: string]:  CommentInfoInterface[];
}

export interface ExtendedChannelCommentInputState {
    [key: string]: commentInputState;
}

const initialState: {commentInputState:ExtendedChannelCommentInputState, postComments:ExtendedComments} = {
    commentInputState: {} as ExtendedChannelCommentInputState,
    postComments: {} as ExtendedComments,
}

export const channelCommentSlice = createSlice({
    name: 'channelComment',
    initialState,
    reducers: {

        createOrUpdateChannelCommentMsg: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { body, channelId } = action.payload;

            if (!state.commentInputState[channelId]) {
                state.commentInputState[channelId] = { commentMsgBody: '', filesUploaded: [] , filesPreview: []};
            }


            state.commentInputState[channelId].commentMsgBody = body;
        },


        addChannelCommentMsgPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { filesUploaded, channelId } = action.payload;
            if (!state.commentInputState[channelId]) {
                state.commentInputState[channelId] = { commentMsgBody: '', filesUploaded: [] , filesPreview: []};
            }
            state.commentInputState[channelId].filesPreview.push(filesUploaded);
        },

        deleteChannelCommentMsgPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, channelId } = action.payload;

            if (!state.commentInputState[channelId]) {
                state.commentInputState[channelId] = { commentMsgBody: '', filesUploaded: [] , filesPreview: []};
            }

            state.commentInputState[channelId].filesPreview = state.commentInputState[channelId].filesPreview.filter((media) => {
                if (media.key === key) {
                    if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                        media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                    }
                    return false;
                } else {
                    return true;
                }
            });

        },

        updateChannelCommentMsgPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, channelId } = action.payload;

            state.commentInputState[channelId].filesPreview = state.commentInputState[channelId].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateChannelCommentMsgPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const {  key, uuid, channelId } = action.payload;

            state.commentInputState[channelId].filesPreview = state.commentInputState[channelId].filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },


        addChannelCommentMsgUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, channelId } = action.payload;

            state.commentInputState[channelId].filesUploaded.push(filesUploaded);
        },

        removeChannelCommentMsgUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, channelId} = action.payload;

            state.commentInputState[channelId].filesUploaded = state.commentInputState[channelId].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearChannelCommentMsgInputState: (state, action: {payload: ClearInputState}) => {

            const { channelId} = action.payload;

            state.commentInputState[channelId] = { commentMsgBody: '', filesUploaded: [] , filesPreview: []};

        },

        addChannelComments: (state, action: {payload: UpdatePostComment}) => {
            const { postId, comments } = action.payload;

            state.postComments[postId] = [...comments];

        },

        updateChannelComment: (state, action: {payload: UpdateComment}) => {
            const { postId, commentIndex, htmlText } = action.payload;
            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_text = htmlText
            }

        },

        updateChannelCommentByCommentUUID: (state, action: {payload: UpdateCommentByCommentUUID}) => {
            const { postId, commentUUID, htmlText } = action.payload;
            state.postComments[postId] = state.postComments[postId]?.map((comment)=> {
                if(comment.comment_uuid == commentUUID) {
                    comment.comment_text = htmlText
                }
                return comment
            })

        },

        removeChannelComment: (state, action: {payload: RemoveComment}) => {
            const { postId, commentIndex } = action.payload;
            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId].splice(commentIndex, 1);
            }
        },

        removeChannelCommentByCommentUUID: (state, action: {payload: RemoveCommentByCommentUUID}) => {
            const { postId, commentUUID } = action.payload;
            state.postComments[postId] = state.postComments[postId]?.filter((comment) => {
                return comment.comment_uuid !== commentUUID
            })
        },

        createChannelComment: (state, action: {payload: CreateComment}) => {
            const {postId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.postComments[postId]) {
                state.postComments[postId] = [] as CommentInfoInterface[]
            }
            state.postComments[postId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },



        updateChannelCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { postId, commentIndex, emojiId, reactionId } = action.payload;

            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions = state.postComments[postId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }
        },

        updateChannelCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { postId, commentId, emojiId, reactionId } = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {
                if(c.comment_uuid == commentId) {
                    c.comment_reactions = c.comment_reactions?.map((r) => {
                        if (r.uid == reactionId) {
                            r.reaction_emoji_id = emojiId
                        }
                        return r
                    })
                }
                return c
            })

        },

        createChannelCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { postId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.postComments[postId].length) {

                if(!state.postComments[postId][commentIndex].comment_reactions) {
                    state.postComments[postId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.postComments[postId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        createChannelCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { postId, commentId, emojiId, reactionId , addedBy} = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {

                if(c.comment_uuid == commentId) {
                    if(!c.comment_reactions) {
                        c.comment_reactions = [] as GroupedReaction[]
                    }

                    c.comment_reactions.push({
                        reaction_emoji_id: emojiId,
                        uid: reactionId,
                        reaction_added_by: addedBy,
                        reaction_added_at: new Date().toISOString(),
                        reaction_on_content_added_by: addedBy
                    })
                }
                return c
            })
        },

        removeChannelCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { postId, commentIndex, reactionId } = action.payload;

            if (state.postComments[postId] && commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions =  state.postComments[postId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removeChannelCommentReactionByReactionId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { postId, commentId, reactionId } = action.payload;

            state.postComments[postId] = state.postComments[postId]?.map((c) => {

                if(c.comment_uuid == commentId) {

                    c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return c
            })

        },

        updateChannelCommentReactionId: (state, action: {payload: UpdateChannelCommentReactionId}) => {
            const { postId, commentIndex, oldReactionId, newReactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.postComments[postId].length) {
                state.postComments[postId][commentIndex].comment_reactions = state.postComments[postId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == oldReactionId) {
                        reaction.uid = newReactionId
                    }
                    return reaction
                })
            }
        },

        // SYNC: Clear all loaded channel comments to force API refetch after stale reconnection
        invalidateChannelComments: (state) => {
            state.postComments = {} as ExtendedComments
        },

    }
})


export const {
    createOrUpdateChannelCommentMsg,
    addChannelCommentMsgPreviewFiles,
    deleteChannelCommentMsgPreviewFiles,
    updateChannelCommentMsgPreviewFilesUUID,
    addChannelCommentMsgUploadedFiles,
    removeChannelCommentMsgUploadedFiles,
    clearChannelCommentMsgInputState,
    updateChannelCommentMsgPreviewFiles,
    addChannelComments,
    updateChannelComment,
    updateChannelCommentByCommentUUID,
    removeChannelComment,
    removeChannelCommentByCommentUUID,
    createChannelComment,
    updateChannelCommentReaction,
    updateChannelCommentReactionByCommentId,
    createChannelCommentReaction,
    createChannelCommentReactionByCommentId,
    removeChannelCommentReaction,
    removeChannelCommentReactionByReactionId,
    updateChannelCommentReactionId,
    invalidateChannelComments
} = channelCommentSlice.actions

export default channelCommentSlice;