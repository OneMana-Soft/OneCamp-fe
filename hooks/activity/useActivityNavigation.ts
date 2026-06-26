import { useRouter } from "next/navigation";
import { UnifiedActivityItem } from "@/types/activity";
import { getOtherUserId } from "@/lib/utils/getOtherUserId";

export const useActivityNavigation = () => {
    const router = useRouter();

    const handleNavigation = (activity: UnifiedActivityItem, currentUserId: string | undefined) => {
        if (!currentUserId) {
            console.error("Navigation failed: currentUserId is missing");
            return;
        }

        switch (activity.activity_type) {
            case "MENTION":
                if (activity.mention) {
                    if (activity.mention.mention_post) {
                        // Channel Post: /channel/{channelID}/{postID}
                        const channelId = activity.mention.mention_post.post_channel?.ch_uuid;
                        const postId = activity.mention.mention_post.post_uuid;
                        if (channelId && postId) {
                            router.push(`app/channel/${channelId}/${postId}`);
                        }
                    } else if (activity.mention.mention_chat) {
                        // Chat Message
                        const chat = activity.mention.mention_chat;
                        const grpId = chat.chat_dm?.dm_grouping_id;
                        const msgId = chat.chat_uuid;

                        if (grpId && !grpId.includes(" ")) {
                             // Group Chat: /chat/group/{grpId}/{messageUUID}
                             // Note: Route seems to be /chat/group based on requirements, but often it's /groupChat or similar.
                             // Requirement said: b1. chat/group/{grpId} /{messaageUUID}
                             // Checking existing routes is safer, but user specified this format.
                             // Actually, let's verify if there is a /chat/group route? 
                             // Usually it might be /groupChat/[id]
                             // Let's assume standard route /groupChat/{grpId} and maybe query param for highlighting?
                             // But user strictly asked for: chat/group/{grpId} /{messaageUUID}
                             // I will use that path.
                             router.push(`app/chat/group/${grpId}/${msgId}`);
                        } else if (grpId && grpId.includes(" ")) {
                            // Direct Chat: /chat/{otherUserUUID}/{chatID}
                            const otherUserId = getOtherUserId(grpId, currentUserId);
                            router.push(`app/chat/${otherUserId}/${chat.chat_uuid}/${msgId}`);
                        }
                    } else if (activity.mention.mention_task) {
                        // Task: /task/{taskuuid}
                        const taskId = activity.mention.mention_task.task_uuid;
                         if (taskId) {
                            router.push(`task/${taskId}`);
                        }
                    } else if (activity.mention.mention_doc) {
                        // Doc: /doc/{docID}/comments
                         const docId = activity.mention.mention_doc.doc_uuid;
                         if (docId) {
                            router.push(`app/doc/${docId}/comment`);
                        }
                    } else if (activity.mention.mention_comment?.comment_board) {
                        // Board: /app/board/{boardID}
                        const boardId = activity.mention.mention_comment.comment_board.board_uuid;
                        if (boardId) {
                            router.push(`/app/board/${boardId}`);
                        }
                    }
                }
                break;

            case "COMMENT":
                if (activity.comment) {
                    if (activity.comment.comment_post) {
                         const channelId = activity.comment.comment_post.post_channel?.ch_uuid;
                         const postId = activity.comment.comment_post.post_uuid;
                         if (channelId && postId) {
                             router.push(`/app/channel/${channelId}/${postId}`);
                         }
                    } else if (activity.comment.comment_chat) {
                        const chat = activity.comment.comment_chat;
                        const grpId = chat.chat_dm?.dm_grouping_id;
                        // For comments on chat, we likely navigate to the chat itself.
                        // Assuming same logic as mention on chat
                         if (grpId && !grpId.includes(" ")) {
                             router.push(`/app/chat/group/${grpId}/${chat.chat_uuid}`);
                        } else if (grpId && grpId.includes(" ")) {
                            const otherUserId = getOtherUserId(grpId, currentUserId);
                             router.push(`/app/chat/${otherUserId}/${chat.chat_uuid}`);
                        }
                    } else if (activity.comment.comment_task) {
                        const taskId = activity.comment.comment_task.task_uuid;
                        if (taskId) {
                           router.push(`/app/task/${taskId}`);
                       }
                    } else if (activity.comment.comment_doc) {
                        const docId = activity.comment.comment_doc.doc_uuid;
                        if (docId) {
                           router.push(`/app/doc/${docId}/comment`);
                       }
                    } else if (activity.comment.comment_board) {
                        const boardId = activity.comment.comment_board.board_uuid;
                        if (boardId) {
                           router.push(`/app/board/${boardId}`);
                       }
                    }
                }
                break;

            case "REACTION":
                 if (activity.reaction) {
                    if (activity.reaction.post) {
                        const channelId = activity.reaction.post.post_channel?.ch_uuid;
                        const postId = activity.reaction.post.post_uuid;
                         if (channelId && postId) {
                            router.push(`/app/channel/${channelId}/${postId}`);
                        }
                    } else if (activity.reaction.chat || activity.reaction.comment.comment_chat) {
                         const chat = activity.reaction.chat || activity.reaction.comment.comment_chat;
                         const grpId = chat.chat_dm?.dm_grouping_id || activity.reaction.comment.comment_chat?.chat_dm?.dm_grouping_id;
                          if (grpId && !grpId.includes(" ")) {
                             router.push(`/app/chat/group/${grpId}/${chat.chat_uuid}`);
                        } else if (grpId && grpId.includes(" ")) {
                            const otherUserId = getOtherUserId(grpId, currentUserId);
                             router.push(`/app/chat/${otherUserId}/${chat.chat_uuid}`);
                        }
                    } else if (activity.reaction.reaction_task || activity.reaction.comment.comment_task) {
                         const task = activity.reaction.reaction_task || activity.reaction.comment.comment_task;
                         if (task?.task_uuid) {
                             router.push(`/app/task/${task.task_uuid}`);
                         }
                    } else if (activity.reaction.reaction_doc || activity.reaction.comment.comment_doc) {
                        const doc = activity.reaction.reaction_doc || activity.reaction.comment.comment_doc;
                        if (doc?.doc_uuid) {
                            router.push(`/app/doc/${doc.doc_uuid}/comment`);
                        }
                    }
                }
                break;
        }
    };

    return { handleNavigation };
};
