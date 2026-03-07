import {CancelTokenSource} from "axios";
import {createSlice} from "@reduxjs/toolkit";
import {FilePreview} from "@/store/slice/channelSlice";
import {AttachmentMediaReq} from "@/types/attachment";
import {CommentInfoInterface} from "@/types/comment";
import {ExtendedComments} from "@/store/slice/channelCommentSlice";
import {GroupedReaction} from "@/types/reaction";
import {UserProfileDataInterface} from "@/types/user";




export interface TaskCommentInputState {
    commentBody: string,
    filesUploaded: AttachmentMediaReq[],
    filesPreview: FilePreview[]
}

export interface ExtendedTaskCommentInputState {
    [key: string]:  TaskCommentInputState;
}

interface AddPreviewFiles {
    fileUploaded: FilePreview
    taskUUID: string
}

interface RemoveUploadedFile {
    key: string,
    taskUUID: string
}

interface AddUploadedFiles {
    filesUploaded: AttachmentMediaReq
    taskUUID: string
}

interface UpdatePreviewFiles {
    key: string,
    progress: number,
    taskUUID: string
}

interface UpdatePreviewFilesUID {
    key: string,
    taskUUID: string
    uuid?: string
}

interface UpdateTaskComment {
    taskId: string,
    comments: CommentInfoInterface[]
}

interface UpdateComment {
    taskId: string
    commentIndex: number
    htmlText: string
}

interface UpdateCommentByCommentUUID {
    taskId: string
    commentUUID: string
    updated_at: string
    htmlText: string
}

interface RemoveComment {
    taskId: string
    commentIndex: number
}

interface RemoveCommentByCommentUUID {
    taskId: string
    commentUUID: string
}

interface CreateComment {
    commentId: string
    commentText: string
    commentCreatedAt: string
    commentBy: UserProfileDataInterface
    taskId: string
    attachments: AttachmentMediaReq[]
}

interface UpdateCommentReaction {
    taskId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
}

interface UpdateCommentReactionByCommentId {
    taskId: string
    reactionId: string,
    commentId: string,
    emojiId: string
}

interface CreateCommentReaction {
    taskId: string
    reactionId: string,
    commentIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreateCommentReactionByCommentId {
    taskId: string
    reactionId: string,
    commentId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface RemoveCommentReaction {
    taskId: string
    reactionId: string,
    commentIndex: number,
}

interface RemoveCommentReactionByCommentId {
    taskId: string
    reactionId: string,
    commentId: string,
}

interface ClearTaskComment {
    taskUUID: string
}

interface createOrUpdateCommentBody {
   taskUUID: string
    body: string
}

const initialState = {
    taskCommentInputState: {} as ExtendedTaskCommentInputState,
    taskComments: {} as ExtendedComments
}

export const createTaskCommentSlice = createSlice({
    name: 'createTaskComment',
    initialState,
    reducers: {

        createOrUpdateTaskCommentBody: (state, action: {payload: createOrUpdateCommentBody}) => {
            const { taskUUID, body } = action.payload;

            if (!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.taskCommentInputState[taskUUID].commentBody = body;
        },

        addTaskCommentPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { fileUploaded, taskUUID} = action.payload;

            if(!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.taskCommentInputState[taskUUID].filesPreview.push(fileUploaded);
        },

        deleteTaskCommentPreviewFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, taskUUID } = action.payload;

            if(!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }

            state.taskCommentInputState[taskUUID].filesPreview = state.taskCommentInputState[taskUUID].filesPreview.filter((media) => {
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

        updateTaskCommentPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { key, progress, taskUUID } = action.payload;
            if(!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.taskCommentInputState[taskUUID].filesPreview = state.taskCommentInputState[taskUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, progress } : item;
            });

        },


        addTaskCommentUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { filesUploaded, taskUUID } = action.payload;
            if(!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.taskCommentInputState[taskUUID].filesUploaded.push(filesUploaded);
        },

        removeTaskCommentUploadedFiles: (state, action: {payload: RemoveUploadedFile}) => {
            const { key, taskUUID } = action.payload;
            if(!state.taskCommentInputState[taskUUID]) {
                state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };
            }
            state.taskCommentInputState[taskUUID].filesUploaded = state.taskCommentInputState[taskUUID].filesUploaded.filter((media) => media.attachment_obj_key !== key);
        },

        clearTaskCommentInputState: (state, action :{payload: ClearTaskComment}) => {
            const {taskUUID } = action.payload;

            state.taskCommentInputState[taskUUID] = { commentBody: '', filesUploaded: [] , filesPreview: [] };


        },

        updateTaskCommentPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUID}) => {
            const {  key, uuid, taskUUID } = action.payload;

            state.taskCommentInputState[taskUUID].filesPreview = state.taskCommentInputState[taskUUID].filesPreview.map((item) => {
                return item.key === key ? { ...item, uuid } : item;
            });

        },


        addTaskComments: (state, action: {payload: UpdateTaskComment}) => {
            const { taskId, comments } = action.payload;

            state.taskComments[taskId] = [...comments];

        },

        updateTaskComment: (state, action: {payload: UpdateComment}) => {
            const { taskId, commentIndex, htmlText } = action.payload;
            if (state.taskComments[taskId] && commentIndex > -1 && commentIndex < state.taskComments[taskId].length) {
                state.taskComments[taskId][commentIndex].comment_text = htmlText
            }

        },

        updateTaskCommentByCommentUUID: (state, action: {payload: UpdateCommentByCommentUUID}) => {
            const { taskId, commentUUID, htmlText, updated_at } = action.payload;
            state.taskComments[taskId] = state.taskComments[taskId].map((comment)=> {
                if(comment.comment_uuid == commentUUID) {
                    comment.comment_text = htmlText
                    comment.comment_updated_at = updated_at
                }
                return comment
            })

        },

        removeTaskComment: (state, action: {payload: RemoveComment}) => {
            const { taskId, commentIndex } = action.payload;
            if (state.taskComments[taskId] && commentIndex > -1 && commentIndex < state.taskComments[taskId].length) {
                state.taskComments[taskId].splice(commentIndex, 1);
            }
        },

        removeTaskCommentByCommentUUID: (state, action: {payload: RemoveCommentByCommentUUID}) => {
            const { taskId, commentUUID } = action.payload;
            state.taskComments[taskId] = state.taskComments[taskId]?.filter((comment) => {
                return comment.comment_uuid !== commentUUID
            })
        },

        createNewTaskComment: (state, action: {payload: CreateComment}) => {
            const {taskId, commentText, commentCreatedAt, commentId, commentBy, attachments} = action.payload;
            if(!state.taskComments[taskId]) {
                state.taskComments[taskId] = [] as CommentInfoInterface[]
            }
            state.taskComments[taskId].push({
                comment_updated_at: "",
                comment_by: commentBy,
                comment_created_at: commentCreatedAt,
                comment_text: commentText,
                comment_uuid: commentId,
                comment_added_locally: true, // not seen by user yet
                comment_attachments: attachments
            })
        },



        updateTaskCommentReaction: (state, action: {payload: UpdateCommentReaction}) => {
            const { taskId, commentIndex, emojiId, reactionId } = action.payload;

            if (state.taskComments[taskId] && commentIndex > -1 && commentIndex < state.taskComments[taskId].length) {
                state.taskComments[taskId][commentIndex].comment_reactions = state.taskComments[taskId][commentIndex].comment_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }

        },

        updateTaskCommentReactionByCommentId: (state, action: {payload: UpdateCommentReactionByCommentId}) => {
            const { taskId, commentId, emojiId, reactionId } = action.payload;

            state.taskComments[taskId] = state.taskComments[taskId].map((c) => {
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

        createTaskCommentReaction: (state, action: {payload: CreateCommentReaction}) => {
            const { taskId, commentIndex, emojiId, reactionId , addedBy} = action.payload;

            if (commentIndex > -1 && commentIndex < state.taskComments[taskId].length) {

                if(!state.taskComments[taskId][commentIndex].comment_reactions) {
                    state.taskComments[taskId][commentIndex].comment_reactions = [] as GroupedReaction[]
                }
                state.taskComments[taskId][commentIndex].comment_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        createTaskCommentReactionByCommentId: (state, action: {payload: CreateCommentReactionByCommentId}) => {
            const { taskId, commentId, emojiId, reactionId , addedBy} = action.payload;

            state.taskComments[taskId] = state.taskComments[taskId]?.map((c) => {

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

        removeTaskCommentReaction: (state, action: {payload: RemoveCommentReaction}) => {
            const { taskId, commentIndex, reactionId } = action.payload;

            if (state.taskComments[taskId] && commentIndex > -1 && commentIndex < state.taskComments[taskId].length) {
                state.taskComments[taskId][commentIndex].comment_reactions =  state.taskComments[taskId][commentIndex].comment_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removeTaskCommentReactionByReactionId: (state, action: {payload: RemoveCommentReactionByCommentId}) => {
            const { taskId, commentId, reactionId } = action.payload;

            state.taskComments[taskId] = state.taskComments[taskId]?.map((c) => {

                if(c.comment_uuid == commentId) {

                    c.comment_reactions = c.comment_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return c
            })

        },

        // SYNC: Clear all loaded task comments to force API refetch after stale reconnection
        invalidateTaskComments: (state) => {
            state.taskComments = {} as ExtendedComments
        },


    }
});

export const {
    createOrUpdateTaskCommentBody,
    addTaskCommentPreviewFiles,
    addTaskCommentUploadedFiles,
    updateTaskCommentPreviewFiles,
    deleteTaskCommentPreviewFiles,
    removeTaskCommentUploadedFiles,
    clearTaskCommentInputState,
    updateTaskCommentPreviewFilesUUID,
    addTaskComments,
    updateTaskComment,
    updateTaskCommentByCommentUUID,
    removeTaskComment,
    removeTaskCommentByCommentUUID,
    createNewTaskComment,
    updateTaskCommentReaction,
    updateTaskCommentReactionByCommentId,
    createTaskCommentReaction,
    createTaskCommentReactionByCommentId,
    removeTaskCommentReaction,
    removeTaskCommentReactionByReactionId,
    invalidateTaskComments

} =createTaskCommentSlice.actions