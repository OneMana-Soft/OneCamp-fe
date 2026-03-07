import { createSlice } from "@reduxjs/toolkit";
import {CancelTokenSource} from "axios";
import {PostsRes} from "@/types/post";
import {UserProfileDataInterface} from "@/types/user";
import {AttachmentMediaReq, AttachmentType} from "@/types/attachment";
import {GroupedReaction} from "@/types/reaction";
import {undefined} from "zod";
import {CommentInfoInterface} from "@/types/comment";
import {ChatInfo} from "@/types/chat";


export interface FilePreview {
    key: string,
    fileName: string,
    progress: number,
    cancelSource: CancelTokenSource
    attachmentType: AttachmentType
    uuid?: string,
}

export interface MessageInputState {
    inputTextHTML: string,
    filesUploaded: AttachmentMediaReq[]
    filePreview: FilePreview[]
}

export interface ChannelScrollPosition {
    [key: string]:  number;
}
export interface  ExtendedPosts {
    [key: string]:  PostsRes[];
}
export interface ExtendedInputState {
    [key: string]:  MessageInputState;
}

export interface ExtendedCallStatus {
    [key: string]: callActiveStatus
}

export interface ExtendedScrollToBottom {
    [key: string]: ScrollToBottom
}

export interface ScrollToBottom {
    shouldScrollToBottom: boolean;
}

interface UpdateScrollToBottom {
    channelId: string
    scrollToBottom: boolean
}

interface UpdateChannelCallStatus {
    channelId: string
    callStatus: boolean
}

interface UpdateReplyCountInterface {
    channelId: string
    messageId: string
    comment: CommentInfoInterface
}

interface callActiveStatus {
    active: boolean
}

interface AddInputText {
    channelId: string,
    inputTextHTML: string
}

interface AddUploadedFiles {
    channelId: string,
    filesUploaded: AttachmentMediaReq
}

interface AddPreviewFiles {
    channelId: string,
    filesUploaded: FilePreview
}

interface RemoveUploadedFiles {
    channelId: string,
    key: string
}

interface ClearInputState {
    channelId: string,
}

interface UpdatePreviewFiles {
    channelId: string,
    key: string,
    progress: number
}

interface UpdatePreviewFilesUUID {
    channelId: string,
    key: string,
    uuid: string
}

interface UpdateChannelPosts {
    channelId: string,
    posts: PostsRes[]
}

interface UpdatePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
    emojiId: string
}

interface UpdatePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
    emojiId: string
}

interface UpdatePostReactionId {
    channelId: string
    postId: string
    oldReactionId: string
    newReactionId: string
}

interface RemovePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
}

interface RemovePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
}

interface UpdatePost {
    channelId: string
    postIndex: number
    htmlText: string
}

interface UpdatePostCommentCount {
    postId: string
    channelId: string
}

interface UpdatePostByPostId {
    channelId: string
    postId: string
    htmlText: string
}

interface RemovePost {
    channelId: string
    postIndex: number
}

interface RemovePostPostId {
    channelId: string
    postId: string
}
interface CreatePost {
    postId: string
    postText: string
    postCreatedAt: string
    postBy: UserProfileDataInterface
    channelId: string
    fwdPost?: PostsRes
    fwdChat?: ChatInfo
    attachments: AttachmentMediaReq[]
}


interface CreatePostLocally {
    postUUID: string
    postText: string
    postCreatedAt: string
    postBy: UserProfileDataInterface
    channelId: string
    attachments: AttachmentMediaReq[]
}
interface UpdateCreatedPostLocally {
    postId: string
    createdAt: string
    postTempId: string
    channelId: string
}

interface UpdatePostAsSeen {
    channelId: string
}

interface UpdateChannelScrollPosition {
    channelId: string
    scrollTop: number
}

interface CreatePostReaction {
    channelId: string
    reactionId: string,
    postIndex: number,
    emojiId: string
    addedBy: UserProfileDataInterface
}

interface CreatePostReactionByPostId {
    channelId: string
    reactionId: string,
    postId: string,
    emojiId: string
    addedBy: UserProfileDataInterface
}

const initialState = {
    channelInputState: {} as ExtendedInputState,
    channelPosts: {} as ExtendedPosts,
    channelScrollPosition: {} as ChannelScrollPosition,
    channelScrollToBottom: {} as ExtendedScrollToBottom,
    channelCallStatus: {} as ExtendedCallStatus
}

export const channelSlice = createSlice({
    name: 'channel',
    initialState,
    reducers: {
        updateChannelInputText: (state, action: {payload: AddInputText}) => {
            const { channelId, inputTextHTML } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].inputTextHTML = inputTextHTML;
        },

        addChannelPreviewFiles: (state, action: {payload: AddPreviewFiles}) => {
            const { channelId, filesUploaded } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].filePreview.push(filesUploaded);
        },

        deleteChannelPreviewFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { channelId, key } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.filter((media) => {
                    if (media.key === key) {
                        if(media.progress != 100 && typeof media.cancelSource.cancel === 'function') {
                            media.cancelSource.cancel(`Stopping file upload: ${media.fileName}`);
                        }
                        return false;
                    } else {
                        return true;
                    }
                });
            }
        },

        updateChannelPreviewFiles: (state, action: {payload: UpdatePreviewFiles}) => {
            const { channelId, key, progress } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.map((item) => {
                    return item.key === key ? { ...item, progress } : item;
                });
            }
        },

        updateChannelPreviewFilesUUID: (state, action: {payload: UpdatePreviewFilesUUID}) => {
            const { channelId, key, uuid } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filePreview = state.channelInputState[channelId].filePreview.map((item) => {
                    return item.key === key ? { ...item, uuid } : item;
                });
            }
        },


        addChannelUploadedFiles: (state, action: {payload: AddUploadedFiles}) => {
            const { channelId, filesUploaded } = action.payload;
            if (!state.channelInputState[channelId]) {
                state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
            }
            state.channelInputState[channelId].filesUploaded.push(filesUploaded);
        },

        removeChannelUploadedFiles: (state, action: {payload: RemoveUploadedFiles}) => {
            const { channelId, key } = action.payload;
            if (state.channelInputState[channelId]) {
                state.channelInputState[channelId].filesUploaded = state.channelInputState[channelId].filesUploaded.filter((media) => media.attachment_obj_key!== key);
            }
        },
        clearChannelInputState: (state, action: {payload: ClearInputState}) => {
            const { channelId } = action.payload;
            state.channelInputState[channelId] = { inputTextHTML: '', filesUploaded: [], filePreview: [] };
        },

        updateChannelPosts: (state, action: {payload: UpdateChannelPosts}) => {
            const { channelId, posts } = action.payload;

            state.channelPosts[channelId] = [...posts];

        },

        updatePostReaction: (state, action: {payload: UpdatePostReaction}) => {
            const { channelId, postIndex, emojiId, reactionId } = action.payload;

            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_reactions = state.channelPosts[channelId][postIndex].post_reactions?.map((reaction) => {
                    if (reaction.uid == reactionId) {
                        reaction.reaction_emoji_id = emojiId
                    }
                    return reaction
                })
            }
        },

        updatePostReactionPostId: (state, action: {payload: UpdatePostReactionByPostId}) => {
            const { channelId, postId, emojiId, reactionId } = action.payload;

            if (!state.channelPosts[channelId]) {
                return
            }

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {

                    post.post_reactions = post.post_reactions?.map((reaction) => {
                        if (reaction.uid == reactionId) {
                            reaction.reaction_emoji_id = emojiId
                        }
                        return reaction
                    })
                }

                return post
            })

        },

        updatePostReactionId: (state, action: {payload: UpdatePostReactionId}) => {
            const { channelId, postId, oldReactionId, newReactionId } = action.payload;

            if (!state.channelPosts[channelId]) {
                return
            }

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {
                    post.post_reactions = post.post_reactions?.map((reaction) => {
                        if (reaction.uid == oldReactionId) {
                            reaction.uid = newReactionId
                        }
                        return reaction
                    })
                }
                return post
            })
        },

        createPostReaction: (state, action: {payload: CreatePostReaction}) => {
            const { channelId, postIndex, emojiId, reactionId , addedBy} = action.payload;

            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {

                if(!state.channelPosts[channelId][postIndex].post_reactions) {
                    state.channelPosts[channelId][postIndex].post_reactions = [] as GroupedReaction[]
                }
                state.channelPosts[channelId][postIndex].post_reactions?.push({
                    reaction_emoji_id: emojiId,
                    uid: reactionId,
                    reaction_added_by: addedBy,
                    reaction_added_at: new Date().toISOString(),
                    reaction_on_content_added_by: addedBy
                })
            }
        },

        createPostReactionPostId: (state, action: {payload: CreatePostReactionByPostId}) => {
            const { channelId, postId, emojiId, reactionId , addedBy} = action.payload;

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(post.post_uuid == postId) {
                    if(!post.post_reactions) {
                        post.post_reactions = [] as GroupedReaction[]
                    }
                    post.post_reactions.push({
                        reaction_emoji_id: emojiId,
                        uid: reactionId,
                        reaction_added_by: addedBy,
                        reaction_added_at: new Date().toISOString(),
                        reaction_on_content_added_by: addedBy
                    })
                }

                return post
            })

        },

        removePostReaction: (state, action: {payload: RemovePostReaction}) => {
            const { channelId, postIndex, reactionId } = action.payload;

            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_reactions =  state.channelPosts[channelId][postIndex].post_reactions?.filter((reaction) => {
                    return reaction.uid !== reactionId
                })
            }

        },

        removePostReactionByPostId: (state, action: {payload: RemovePostReactionByPostId}) => {
            const { channelId, postId, reactionId } = action.payload;

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid == postId) {
                    post.post_reactions = post.post_reactions?.filter((reaction) => {
                        return reaction.uid !== reactionId
                    })
                }
                return post
            })
        },

        // incrementPostCommentCountByPostID: (state, action: {payload: UpdatePostCommentCount}) => {
        //     const { postId , channelId} = action.payload;
        //
        //     state.channelPosts[channelId].map((post)=> {
        //         if(post.post_uuid == postId) {
        //             post.post_comment_count++
        //         }
        //         return post
        //     })
        //
        // },

        // decrementPostCommentCountByPostID: (state, action: {payload: UpdatePostCommentCount}) => {
        //     const { postId , channelId} = action.payload;
        //
        //     state.channelPosts[channelId].map((post)=> {
        //         if(post.post_uuid == postId) {
        //             post.post_comment_count--
        //         }
        //         return post
        //     })
        //
        // },

        updatePost: (state, action: {payload: UpdatePost}) => {
            const { channelId, postIndex, htmlText } = action.payload;
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId][postIndex].post_text = htmlText
            }

        },

        updatePostByPostId: (state, action: {payload: UpdatePostByPostId}) => {
            const { channelId, postId, htmlText } = action.payload;
            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(postId == post.post_uuid) {
                    post.post_text = htmlText
                }

                return post
            })
        },

        removePost: (state, action: {payload: RemovePost}) => {
            const { channelId, postIndex } = action.payload;
            if (postIndex > -1 && postIndex < state.channelPosts[channelId].length) {
                state.channelPosts[channelId].splice(postIndex, 1);
            }
        },

        removePostByPostId: (state, action: {payload: RemovePostPostId}) => {
            const { channelId, postId } = action.payload;
            state.channelPosts[channelId] = state.channelPosts[channelId].filter((post) => {
                return post.post_uuid !== postId
            })
        },

        createPostLocally: (state, action: {payload: CreatePostLocally}) => {
            const { postText, postCreatedAt, channelId, postBy, attachments, postUUID} = action.payload;
            if(!state.channelPosts[channelId]) {
                state.channelPosts[channelId] = [] as PostsRes[]
            }
            state.channelPosts[channelId].push({
                post_by: postBy,
                post_uuid: postUUID,
                post_created_at: postCreatedAt,
                post_text: postText,
                post_added_locally: true, // not seen by user yet
                post_attachments: attachments,
                post_comment_count: 0
            })
        },

        createPost: (state, action: {payload: CreatePost}) => {
            const {postId, postText, postCreatedAt, channelId, postBy, fwdPost, fwdChat, attachments} = action.payload;
            if(!state.channelPosts[channelId]) {
                state.channelPosts[channelId] = [] as PostsRes[]
            }
            state.channelPosts[channelId].push({
                post_uuid: postId,
                post_by: postBy,
                post_created_at: postCreatedAt,
                post_text: postText,
                post_added_locally: true, // not seen by user yet
                post_attachments: attachments,
                post_fwd_msg_post: fwdPost,
                post_fwd_msg_chat: fwdChat,
                post_comment_count: 0,
            })

            state.channelPosts[channelId].sort((a, b) =>
                new Date(a.post_created_at).getTime() - new Date(b.post_created_at).getTime()
            );
        },

        addUUIDToLocallyCreatedPost: (state, action: {payload: UpdateCreatedPostLocally}) => {
            const { channelId, postTempId, postId, createdAt } = action.payload;
            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {
                if(postTempId == post.post_temp_id) {
                    post.post_uuid = postId
                    post.post_created_at = createdAt
                }

                return post
            }).sort((a, b) => {
                // Assuming post_created_at is a string (e.g., ISO date) or number (timestamp)
                return new Date(a.post_created_at).getTime() - new Date(b.post_created_at).getTime()
            });
        },

        updatePostAddedLocallyToSeen: (state, action: {payload: UpdatePostAsSeen}) =>{
            const {channelId} = action.payload;
            if(state.channelPosts[channelId]) {
                state.channelPosts[channelId][state.channelPosts[channelId].length-1].post_added_locally = false
            }
        },

        updateChannelScrollPosition: (state, action: {payload: UpdateChannelScrollPosition}) =>{
            const {channelId, scrollTop} = action.payload;
            state.channelScrollPosition[channelId] = scrollTop
        },

        updateChannelScrollToBottom: (state, action: {payload: UpdateScrollToBottom}) => {

            const {channelId, scrollToBottom} = action.payload;

            if(!state.channelScrollToBottom[channelId]) {
                state.channelScrollToBottom[channelId] = {} as ScrollToBottom
            }

            state.channelScrollToBottom[channelId].shouldScrollToBottom = scrollToBottom

        },

        updateChannelMessageReplyIncrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {channelId, messageId, comment} = action.payload;

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid === messageId) {
                    post.post_comments = post.post_comments || [];
                    post.post_comments.push(comment);
                    post.post_comment_count++
                }

                return post
            })
        },

        updateChannelMessageReplyDecrement: (state, action: {payload: UpdateReplyCountInterface}) => {

            const {channelId, messageId, comment} = action.payload;

            state.channelPosts[channelId] = state.channelPosts[channelId].map((post) => {

                if(post.post_uuid === messageId) {
                    post.post_comments = post.post_comments || [];
                    post.post_comments = post.post_comments.filter((c) => c.comment_uuid != comment.comment_uuid)
                    post.post_comment_count--
                }

                return post
            })
        },

        updateChannelCallStatus: (state, action: {payload: UpdateChannelCallStatus}) => {

            const {channelId, callStatus} = action.payload;

            state.channelCallStatus[channelId] = {active:callStatus}

        },

        // SYNC: Clear all loaded channel posts to force API refetch after stale reconnection
        invalidateChannelPosts: (state) => {
            state.channelPosts = {} as ExtendedPosts
        }
    }
});

export const {
    updateChannelPreviewFiles,
    addChannelPreviewFiles,
    deleteChannelPreviewFiles,
    updateChannelPreviewFilesUUID,
    updateChannelInputText,
    addChannelUploadedFiles,
    removeChannelUploadedFiles,
    clearChannelInputState,
    updateChannelPosts,
    updatePostReaction,
    updatePostReactionPostId,
    createPostReaction,
    createPostReactionPostId,
    removePostReaction,
    removePostReactionByPostId,
    updatePost,
    updatePostByPostId,
    removePost,
    removePostByPostId,
    createPost,
    createPostLocally,
    addUUIDToLocallyCreatedPost,
    updatePostAddedLocallyToSeen,
    updateChannelScrollPosition,
    updateChannelScrollToBottom,
    updateChannelMessageReplyIncrement,
    updateChannelMessageReplyDecrement,
    updateChannelCallStatus,
    updatePostReactionId,
    invalidateChannelPosts

} = channelSlice.actions

export default channelSlice;
