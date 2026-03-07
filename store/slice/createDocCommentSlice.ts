import {createSlice} from "@reduxjs/toolkit";
import {FilePreview} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {CommentInfoInterface} from "@/types/comment";
import {ExtendedComments} from "@/store/slice/channelCommentSlice";
import {UserProfileDataInterface} from "@/types/user";
import {GroupedReaction} from "@/types/reaction";


export interface DocCommentInputState {
    commentBody: string,
    filesUploaded:  AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

export interface ExtendedDocCommentInputState {
    [key: string]:  DocCommentInputState;
}

interface UpdatePreviewFilesUUID {
    key: string,
    uuid: string,
    docId: string
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    docUUID: string
}

interface RemoveUploadedFile {
    key: string,
    docUUID: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    docUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    docUUID: string
}

interface ClearDocComment {
    docUUID: string
}

interface createOrUpdateCommentBody {
   docUUID: string
    body: string
}

interface UpdateDocCommentCount {
    docId: string,
}

interface UpdateDocCommentCountNumber {
    docId: string,
    newCount: number,
}


interface UpdateDocComment {
    docId: string,
    comments: CommentInfoInterface[]
}

interface UpdateComment {
    docId: string
    commentIndex: number
    htmlText: string
}

interface RemoveComment {
    docId: string
    commentIndex: number
}

interface UpdateCommentReaction {
    docId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}

interface RemoveCommentReaction {
    docId: string
    reactionId: string,
    commentIndex: number,
}

interface UpdateCommentByCommentUUID {
    docId: string
    commentUUID: string
    htmlText: string
    updated_at: string
}

interface RemoveCommentByCommentUUID {
    docId: string
    commentUUID: string
}

interface RemoveCommentReactionByCommentId {
    docId: string
    reactionId: string,
    commentId: string,
}

interface CreateCommentReactionByCommentId {
    docId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface UpdateCommentReactionByCommentId {
    docId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}


interface CreateCommentReaction {
    docId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

export interface  ExtendedCommentCount {
    [key: string]:  number;
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    docId: string
    attachments: AttachmentMediaReq[]
}

const initialState = {
    docCommentInputState: {} as ExtendedDocCommentInputState,
    docComments: {} as ExtendedComments,
    docCommentCount: {} as ExtendedCommentCount

}

export const createDocCommentSlice = createSlice({
    name: 'createDocComment',
    initialState,
    reducers: {

        createOrUpdateDocCommentBody: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { docUUID, body } = action.payload;

            if (!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.docCommentInputState[docUUID].commentBody = body;
        },


        addDocCommentPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, docUUID} = action.payload;

            if(!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.docCommentInputState[docUUID].filesPreview.push(fileUploaded);
        },

        deleteDocCommentPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, docUUID } = action.payload;

            if(!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.docCommentInputState[docUUID].filesPreview = state.docCommentInputState[docUUID].filesPreview.filter((media) => {
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

        updateDocCommentPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, docUUID } = action.payload;
            if(!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.docCommentInputState[docUUID].filesPreview = state.docCommentInputState[docUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },

        updateDocCommentPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const {  key, uuid, docId } = action.payload;

            state.docCommentInputState[docId].filesPreview = state.docCommentInputState[docId].filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },


        addDocCommentUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, docUUID } = action.payload;
            if(!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.docCommentInputState[docUUID].filesUploaded.push(filesUploaded);
        },

        removeDocCommentUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, docUUID } = action.payload;
            if(!state.docCommentInputState[docUUID]) {
                state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.docCommentInputState[docUUID].filesUploaded = state.docCommentInputState[docUUID].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearDocCommentInputState: (state, action :{payload: ClearDocComment}) => {
            const {docUUID } = action.payload;

            state.docCommentInputState[docUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };


        },

        addDocComments: (state, action: {payload: UpdateDocComment}) => {
            const { docId, comments } = action.payload;

            state.docComments[docId] = [...comments];

        },

        updateDocComment: (state, action: {payload: UpdateComment}) => {
            const { docId, commentIndex, htmlText } = action.payload;
            if (state.docComments[docId] && commentIndex > -1 && commentIndex < state.docComments[docId].length) {
                state.docComments[docId][commentIndex].comment_text = htmlText
            }

        },

        removeDocComment: (state, action: {payload: RemoveComment}) => {
            const { docId, commentIndex } = action.payload;
            if (state.docComments[docId] && commentIndex > -1 && commentIndex < state.docComments[docId].length) {
                state.docComments[docId].splice(commentIndex, 1);
            }
        },

        createNewDocComment: (state, action: {payload: CreateComment}) => {
            const {docId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.docComments[docId]) {
                state.docComments[docId] = [] as CommentInfoInterface[]
            }
            state.docComments[docId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },

        updateDocCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { docId, commentIndex, emojiId, reactionId } = action.payload;

            if (state.docComments[docId] && commentIndex > -1 && commentIndex < state.docComments[docId].length) {
                state.docComments[docId][commentIndex].comment_reactions = state.docComments[docId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }

        },

        createDocCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { docId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.docComments[docId].length) {

                if(!state.docComments[docId][commentIndex].comment_reactions) {
                    state.docComments[docId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.docComments[docId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        removeDocCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { docId, commentIndex, reactionId } = action.payload;

            if (state.docComments[docId] && commentIndex > -1 && commentIndex < state.docComments[docId].length) {
                state.docComments[docId][commentIndex].comment_reactions =  state.docComments[docId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        updateDocCommentByCommentUUID: (state, action: {payload: UpdateCommentByCommentUUID}) => {
            const { docId, commentUUID, htmlText } = action.payload;
            state.docComments[docId] = state.docComments[docId].map((comment)=> {
                if(comment.comment_uuid == commentUUID) {
                    comment.comment_text = htmlText
                }
                return comment
            })

        },

        removeDocCommentByCommentUUID: (state, action: {payload: RemoveCommentByCommentUUID}) => {
            const { docId, commentUUID } = action.payload;
            state.docComments[docId] = state.docComments[docId]?.filter((comment) => {
                return comment.comment_uuid !== commentUUID
            })
        },

        updateDocCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { docId, commentId, emojiId, reactionId } = action.payload;

            state.docComments[docId] = state.docComments[docId].map((c) => {
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

        createDocCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { docId, commentId, emojiId, reactionId , addedBy} = action.payload;

            if (!state.docComments[docId]) {
                return;
            }

            state.docComments[docId] = state.docComments[docId].map((c) => {

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


        removeDocCommentReactionByReactionId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { docId, commentId, reactionId } = action.payload;

            state.docComments[docId] = state.docComments[docId]?.map((c) => {

                if(c.comment_uuid == commentId) {

                    c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return c
            })

        },

        incrementDocCommentCount: (state, action: {payload: UpdateDocCommentCount}) => {

            const { docId } = action.payload;

            if(!state.docCommentCount[docId]) {
                return
            }

            state.docCommentCount[docId]++;
        },

        decrementDocCommentCount: (state, action: {payload: UpdateDocCommentCount}) => {

            const { docId } = action.payload;

            if(!state.docCommentCount[docId]) {
                return
            }

            state.docCommentCount[docId]--;
        },

        updateDocCommentCount: (state, action: {payload: UpdateDocCommentCountNumber}) => {

            const { docId, newCount } = action.payload;


            state.docCommentCount[docId] = newCount
        },

        // SYNC: Clear all loaded doc comments to force API refetch after stale reconnection
        invalidateDocComments: (state) => {
            state.docComments = {} as ExtendedComments
            state.docCommentCount = {} as ExtendedCommentCount
        },

    }
});

export const {
    createOrUpdateDocCommentBody,
    addDocCommentPreviewFiles,
    addDocCommentUploadedFiles,
    updateDocCommentPreviewFilesUUID,
    updateDocCommentPreviewFiles,
    deleteDocCommentPreviewFiles,
    removeDocCommentUploadedFiles,
    addDocComments,
    updateDocComment,
    createNewDocComment,
    updateDocCommentReaction,
    createDocCommentReaction,
    removeDocCommentReaction,
    clearDocCommentInputState,
    removeDocComment,
    incrementDocCommentCount,
    decrementDocCommentCount,
    updateDocCommentCount,
    updateDocCommentByCommentUUID,
    removeDocCommentByCommentUUID,
    updateDocCommentReactionByCommentId,
    createDocCommentReactionByCommentId,
    removeDocCommentReactionByReactionId,
    invalidateDocComments

} =createDocCommentSlice.actions