import {createSlice} from "@reduxjs/toolkit";
import {AttachmentMediaReq} from "@/types/attachment";
import {FilePreview} from "@/store/slice/channelSlice";
import {ExtendedComments} from "@/store/slice/channelCommentSlice";
import {CommentInfoInterface} from "@/types/comment";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";


export interface ChatCommentInputState {
    commentBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

interface UpdateChatComment {
    chatId: string,
    comments: CommentInfoInterface[]
}

interface RemoveComment {
    chatId: string
    commentIndex: number
}

interface RemoveCommentByCommentID {
    chatId: string
    commentId: string
}

interface UpdateComment {
    chatId: string
    commentIndex: number
    htmlText: string
}

interface UpdateCommentByCommentID {
    chatId: string
    commentId: string
    htmlText: string
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    chatId: string
    attachments: AttachmentMediaReq[]
}

interface UpdateCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}

interface UpdateCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}

interface CreateCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreateCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface RemoveCommentReaction {
    chatId: string
    reactionId: string,
    commentIndex: number,
}

interface RemoveCommentReactionByCommentId {
    chatId: string
    reactionId: string,
    commentId: string,
}

interface UpdateChatCommentReactionId {
    chatId: string
    commentIndex: number
    oldReactionId: string
    newReactionId: string
}

export interface ExtendedChatCommentInputState {
    [key: string]:  ChatCommentInputState;
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    chatUUID: string
}

interface RemoveUploadedFile {
    key: string,
    chatUUID: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    chatUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    chatUUID: string
}

interface UpdatePreviewFilesUUID {
    chatUUID: string,
    key: string,
    uuid: string
}

interface ClearChatComment {
    chatUUID: string
}

interface createOrUpdateCommentBody {
   chatUUID: string
    body: string
}

const initialState = {
    chatCommentInputState: {} as ExtendedChatCommentInputState,
    chatComments: {} as ExtendedComments,
}

export const chatCommentSlice = createSlice({
    name: 'chatComments',
    initialState,
    reducers: {

        createOrUpdateChatCommentBody: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { chatUUID, body } = action.payload;

            if (!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatCommentInputState[chatUUID].commentBody = body;
        },


        addChatCommentPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, chatUUID} = action.payload;

            if(!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatCommentInputState[chatUUID].filesPreview.push(fileUploaded);
        },

        deleteChatCommentPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, chatUUID } = action.payload;

            if(!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.chatCommentInputState[chatUUID].filesPreview = state.chatCommentInputState[chatUUID].filesPreview.filter((media) => {
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

        updateChatCommentPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, chatUUID } = action.payload;
            if(!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatCommentInputState[chatUUID].filesPreview = state.chatCommentInputState[chatUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateChatCommentPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { chatUUID, key, uuid } = action.payload;
            if (state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID].filesPreview = state.chatCommentInputState[chatUUID].filesPreview.map((item) => {
                    return item.key === key ? { ...item, uuid } : item;
                });
            }
        },

        addChatCommentUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, chatUUID } = action.payload;
            if(!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatCommentInputState[chatUUID].filesUploaded.push(filesUploaded);
        },

        removeChatCommentUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, chatUUID } = action.payload;
            if(!state.chatCommentInputState[chatUUID]) {
                state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.chatCommentInputState[chatUUID].filesUploaded = state.chatCommentInputState[chatUUID].filesUploaded.filter((media) => media.attachment_obj_key  !== key);
        },

        clearChatCommentInputState: (state, action :{payload: ClearChatComment}) => {
            const {chatUUID } = action.payload;

            state.chatCommentInputState[chatUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };


        },
        addChatComments: (state, action: {payload: UpdateChatComment}) => {
            const { chatId, comments } = action.payload;

            state.chatComments[chatId] = [...comments];

        },

        removeChatComment: (state, action: {payload: RemoveComment}) => {
            const { chatId, commentIndex } = action.payload;
            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId].splice(commentIndex, 1);
            }
        },

        removeChatCommentByCommentId: (state, action: {payload: RemoveCommentByCommentID}) => {
            const { chatId, commentId } = action.payload;
            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].filter((comment) => {
                    return comment.comment_uuid !== commentId
                })
            }
        },

        updateChatComment: (state, action: {payload: UpdateComment}) => {
            const { chatId, commentIndex, htmlText } = action.payload;
            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_text = htmlText
            }

        },

        updateChatCommentByCommentId: (state, action: {payload: UpdateCommentByCommentID}) => {
            const { chatId, commentId, htmlText } = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((comment) => {
                    if(comment.comment_uuid == commentId){
                        comment.comment_text = htmlText
                    }
                    return comment
                })
            }
        },

        createChatComment: (state, action: {payload: CreateComment}) => {
            const {chatId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.chatComments[chatId]) {
                state.chatComments[chatId] = [] as CommentInfoInterface[]
            }
            state.chatComments[chatId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },

        updateChatCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { chatId, commentIndex, emojiId, reactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions = state.chatComments[chatId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }

        },

        updateChatCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { chatId, commentId, emojiId, reactionId } = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        c.comment_reactions = c.comment_reactions?.map((r) => {
                            if (r.uid == reactionId) {
                                r.reaction_emoji_id = emojiId
                            }
                            return r
                        })
                    }
                    return c
                })
            }
        },

        createChatCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { chatId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {

                if(!state.chatComments[chatId][commentIndex].comment_reactions) {
                    state.chatComments[chatId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.chatComments[chatId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy,
                })
            }
        },

        createChatCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { chatId, commentId, emojiId, reactionId , addedBy} = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        if (!c.comment_reactions) {
                            c.comment_reactions = [] as GroupedReaction[];
                        }
                        c.comment_reactions.push({
                            reaction_emoji_id: emojiId,
                            uid: reactionId,
                            reaction_added_by: addedBy,
                            reaction_added_at: new Date().toISOString(),
                            reaction_on_content_added_by: addedBy,
                        })
                    }
                    return c
                })
            }
        },

        removeChatCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { chatId, commentIndex, reactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions =  state.chatComments[chatId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removeChatCommentReactionByCommentId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { chatId, commentId, reactionId } = action.payload;

            if (state.chatComments[chatId]) {
                state.chatComments[chatId] = state.chatComments[chatId].map((c) => {
                    if(c.comment_uuid == commentId){
                        c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                            return reaction.uid !== reactionId
                        })
                    }
                    return c
                })
            }
        },

        updateChatCommentReactionId: (state, action: {payload: UpdateChatCommentReactionId}) => {
            const { chatId, commentIndex, oldReactionId, newReactionId } = action.payload;

            if (commentIndex > -1 && commentIndex < state.chatComments[chatId].length) {
                state.chatComments[chatId][commentIndex].comment_reactions = state.chatComments[chatId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == oldReactionId) {
                        reaction.uid = newReactionId
                    }
                    return reaction
                })
            }
        },

        // SYNC: Clear all loaded chat comments to force API refetch after stale reconnection
        invalidateChatComments: (state) => {
            state.chatComments = {} as ExtendedComments
        },

    }
});

export const {
    createOrUpdateChatCommentBody,
    addChatCommentPreviewFiles,
    addChatCommentUploadedFiles,
    updateChatCommentPreviewFiles,
    updateChatCommentPreviewFilesUUID,
    deleteChatCommentPreviewFiles,
    removeChatCommentUploadedFiles,
    clearChatCommentInputState,
    addChatComments,
    removeChatComment,
    updateChatComment,
    createChatComment,
    updateChatCommentReaction,
    updateChatCommentReactionByCommentId,
    createChatCommentReaction,
    createChatCommentReactionByCommentId,
    removeChatCommentReaction,
    removeChatCommentReactionByCommentId,
    removeChatCommentByCommentId,
    updateChatCommentByCommentId,
    updateChatCommentReactionId,
    invalidateChatComments
} =chatCommentSlice.actions