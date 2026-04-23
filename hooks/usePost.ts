"use client"

import React, { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints"
import type { GenericResponse } from "@/types/genericRes"

import type { AxiosError } from "axios"
import { offlineQueue } from "@/lib/offlineQueue"

interface UsePostOptions<T> {
    apiEndpoint: PostEndpointUrl
    payload?: T
    appendToUrl?: string
    onSuccess?: () => void
    showToast?: boolean
    showErrorToast?: boolean // Specific control for error toasts
    useQueueIfOffline?: boolean
    description?: string // Description for the offline queue toast
    method?: HttpMethod
}


interface ErrorResponse {
    msg?: string
    mag?: string
    message?: string
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"


const endpointMessages: Partial<Record<PostEndpointUrl, { success: string; error: string }>> = {
    // Teams
    [PostEndpointUrl.CreateTeam]: {
        success: "Team created successfully.",
        error: "Failed to create team.",
    },
    [PostEndpointUrl.UpdateTeamName]: {
        success: "Team name updated successfully.",
        error: "Failed to update team name.",
    },
    [PostEndpointUrl.AddTeamMember]: {
        success: "Member added to team successfully.",
        error: "Failed to add member to team.",
    },
    [PostEndpointUrl.RemoveTeamMember]: {
        success: "Member removed from team successfully.",
        error: "Failed to remove member from team.",
    },
    [PostEndpointUrl.AddTeamAdminRole]: {
        success: "Admin role assigned successfully.",
        error: "Failed to assign admin role.",
    },
    [PostEndpointUrl.RemoveTeamModerator]: {
        success: "Admin role removed successfully.",
        error: "Failed to remove admin role.",
    },
    [PostEndpointUrl.UnDeletedTeam]: {
        success: "Team restored successfully.",
        error: "Failed to restore team.",
    },
    [PostEndpointUrl.RemoveTeam]: {
        success: "Team deleted successfully.",
        error: "Failed to delete team.",
    },

    // Projects
    [PostEndpointUrl.CreateProject]: {
        success: "Project created successfully.",
        error: "Failed to create project.",
    },
    [PostEndpointUrl.UpdateProjectName]: {
        success: "Project name updated successfully.",
        error: "Failed to update project name.",
    },
    [PostEndpointUrl.DeleteProject]: {
        success: "Project deleted successfully.",
        error: "Failed to delete project.",
    },
    [PostEndpointUrl.UndeleteProject]: {
        success: "Project restored successfully.",
        error: "Failed to restore project.",
    },
    [PostEndpointUrl.AddProjectMember]: {
        success: "Member added to project successfully.",
        error: "Failed to add member to project.",
    },
    [PostEndpointUrl.RemoveProjectMember]: {
        success: "Member removed from project successfully.",
        error: "Failed to remove member from project.",
    },
    [PostEndpointUrl.AddProjectModerator]: {
        success: "Project admin role assigned.",
        error: "Failed to assign project admin role.",
    },
    [PostEndpointUrl.RemoveProjectModerator]: {
        success: "Project admin role removed.",
        error: "Failed to remove project admin role.",
    },
    [PostEndpointUrl.UpdateProjectNotification]: {
        success: "Project notification settings updated.",
        error: "Failed to update project notification settings.",
    },
    [PostEndpointUrl.AddAttachmentToProject]: {
        success: "Attachment added to project.",
        error: "Failed to add attachment to project.",
    },
    [PostEndpointUrl.RemoveAttachmentToProject]: {
        success: "Attachment removed from project.",
        error: "Failed to remove attachment from project.",
    },

    // Channels
    [PostEndpointUrl.CreateChannel]: {
        success: "Channel created successfully.",
        error: "Failed to create channel.",
    },
    [PostEndpointUrl.UpdateChannel]: {
        success: "Channel updated successfully.",
        error: "Failed to update channel.",
    },
    [PostEndpointUrl.JoinChannel]: {
        success: "Joined channel successfully.",
        error: "Failed to join channel.",
    },
    [PostEndpointUrl.AddFavChannel]: {
        success: "Added to favorites.",
        error: "Failed to add to favorites.",
    },
    [PostEndpointUrl.RemoveFavChannel]: {
        success: "Removed from favorites.",
        error: "Failed to remove from favorites.",
    },
    [PostEndpointUrl.UpdateChannelNotification]: {
        success: "Channel notifications updated.",
        error: "Failed to update channel notifications.",
    },
    [PostEndpointUrl.AddChannelMember]: {
        success: "Member added to channel.",
        error: "Failed to add member to channel.",
    },
    [PostEndpointUrl.RemoveChannelMember]: {
        success: "Member removed from channel.",
        error: "Failed to remove member from channel.",
    },
    [PostEndpointUrl.AddChannelModerator]: {
        success: "Moderator added successfully.",
        error: "Failed to add moderator.",
    },
    [PostEndpointUrl.RemoveChannelModerator]: {
        success: "Moderator removed successfully.",
        error: "Failed to remove moderator.",
    },
    [PostEndpointUrl.CreateChannelPost]: {
        success: "Post created successfully.",
        error: "Failed to create post.",
    },
    [PostEndpointUrl.UpdateChannelPost]: {
        success: "Post updated successfully.",
        error: "Failed to update post.",
    },
    [PostEndpointUrl.DeleteChannelPost]: {
        success: "Post deleted successfully.",
        error: "Failed to delete post.",
    },

    // Chat / Messages
    [PostEndpointUrl.CreateChatMessage]: {
        success: "Message sent.",
        error: "Failed to send message.",
    },
    [PostEndpointUrl.UpdateChatMessage]: {
        success: "Message updated.",
        error: "Failed to update message.",
    },
    [PostEndpointUrl.DeleteChatMessage]: {
        success: "Message deleted.",
        error: "Failed to delete message.",
    },
    [PostEndpointUrl.CreateGroupChatMessage]: {
        success: "Message sent.",
        error: "Failed to send message.",
    },
    [PostEndpointUrl.UpdateGroupChatMessage]: {
        success: "Message updated.",
        error: "Failed to update message.",
    },
    [PostEndpointUrl.AddDmMember]: {
        success: "Member added to group chat.",
        error: "Failed to add member to group chat.",
    },
    [PostEndpointUrl.UpdateChatNotification]: {
        success: "Notification settings updated.",
        error: "Failed to update notification settings.",
    },
    [PostEndpointUrl.UpdateGroupChatNotification]: {
        success: "Notification settings updated.",
        error: "Failed to update notification settings.",
    },
    [PostEndpointUrl.FwdMsgToChatOrChannel]: {
        success: "Message forwarded.",
        error: "Failed to forward message.",
    },

    // Tasks
    [PostEndpointUrl.CreateTask]: {
        success: "Task created successfully.",
        error: "Failed to create task.",
    },
    [PostEndpointUrl.UpdateTaskName]: {
        success: "Task name updated.",
        error: "Failed to update task name.",
    },
    [PostEndpointUrl.UpdateTaskStatus]: {
        success: "Task status updated.",
        error: "Failed to update task status.",
    },
    [PostEndpointUrl.UpdateTaskPriority]: {
        success: "Task priority updated.",
        error: "Failed to update task priority.",
    },
    [PostEndpointUrl.UpdateTaskLabel]: {
        success: "Task label updated.",
        error: "Failed to update task label.",
    },
    [PostEndpointUrl.UpdateTaskDesc]: {
        success: "Task description updated.",
        error: "Failed to update task description.",
    },
    [PostEndpointUrl.UpdateTaskStartDate]: {
        success: "Start date updated.",
        error: "Failed to update start date.",
    },
    [PostEndpointUrl.UpdateTaskDueDate]: {
        success: "Due date updated.",
        error: "Failed to update due date.",
    },
    [PostEndpointUrl.UpdateTaskAssignee]: {
        success: "Assignee updated.",
        error: "Failed to update assignee.",
    },
    [PostEndpointUrl.ArchiveTask]: {
        success: "Task archived.",
        error: "Failed to archive task.",
    },
    [PostEndpointUrl.UnArchiveTask]: {
        success: "Task restored.",
        error: "Failed to restore task.",
    },
    [PostEndpointUrl.CreateSubTask]: {
        success: "Sub-task created.",
        error: "Failed to create sub-task.",
    },
    [PostEndpointUrl.AddAttachmentToTask]: {
        success: "Attachment added.",
        error: "Failed to add attachment.",
    },
    [PostEndpointUrl.RemoveTaskAttachment]: {
        success: "Attachment removed.",
        error: "Failed to remove attachment.",
    },

    // Comments
    [PostEndpointUrl.CreatePostComment]: {
        success: "Comment added.",
        error: "Failed to add comment.",
    },
    [PostEndpointUrl.UpdatePostComment]: {
        success: "Comment updated.",
        error: "Failed to update comment.",
    },
    [PostEndpointUrl.RemovePostComment]: {
        success: "Comment removed.",
        error: "Failed to remove comment.",
    },
    [PostEndpointUrl.CreateChatComment]: {
        success: "Comment added.",
        error: "Failed to add comment.",
    },
    [PostEndpointUrl.UpdateChatComment]: {
        success: "Comment updated.",
        error: "Failed to update comment.",
    },
    [PostEndpointUrl.RemoveChatComment]: {
        success: "Comment removed.",
        error: "Failed to remove comment.",
    },
    [PostEndpointUrl.CreateTaskComment]: {
        success: "Comment added.",
        error: "Failed to add comment.",
    },
    [PostEndpointUrl.UpdateTaskComment]: {
        success: "Comment updated.",
        error: "Failed to update comment.",
    },
    [PostEndpointUrl.RemoveTaskComment]: {
        success: "Comment removed.",
        error: "Failed to remove comment.",
    },
    [PostEndpointUrl.CreateDocComment]: {
        success: "Comment added.",
        error: "Failed to add comment.",
    },
    [PostEndpointUrl.UpdateDocComment]: {
        success: "Comment updated.",
        error: "Failed to update comment.",
    },
    [PostEndpointUrl.RemoveDocComment]: {
        success: "Comment removed.",
        error: "Failed to remove comment.",
    },

    // Reactions
    [PostEndpointUrl.CreateOrUpdatePostReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemovePostReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },
    [PostEndpointUrl.CreateOrUpdateChatReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemoveChatReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },
    [PostEndpointUrl.CreateOrUpdatePostCommentReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemovePostCommentReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },
    [PostEndpointUrl.CreateOrUpdateChatCommentReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemoveChatCommentReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },
    [PostEndpointUrl.CreateOrUpdateTaskCommentReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemoveTaskCommentReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },
    [PostEndpointUrl.CreateOrUpdateDocCommentReaction]: {
        success: "Reaction updated.",
        error: "Failed to update reaction.",
    },
    [PostEndpointUrl.RemoveDocCommentReaction]: {
        success: "Reaction removed.",
        error: "Failed to remove reaction.",
    },

    // Documents
    [PostEndpointUrl.CreateDoc]: {
        success: "Document created successfully.",
        error: "Failed to create document.",
    },
    [PostEndpointUrl.UpdateDoc]: {
        success: "Document updated successfully.",
        error: "Failed to update document.",
    },
    [PostEndpointUrl.DeleteDoc]: {
        success: "Document deleted.",
        error: "Failed to delete document.",
    },
    [PostEndpointUrl.UpdateDocPermissions]: {
        success: "Permissions updated.",
        error: "Failed to update permissions.",
    },
    [PostEndpointUrl.SearchUserForDoc]: {
        success: "Search completed.",
        error: "Failed to search users.",
    },
    [PostEndpointUrl.SearchPrivateDocList]: {
        success: "Search completed.",
        error: "Failed to search private documents.",
    },
    [PostEndpointUrl.SearchPublicDocList]: {
        success: "Search completed.",
        error: "Failed to search public documents.",
    },

    // User Profile / Status
    [PostEndpointUrl.UpdateUserEmojiStatus]: {
        success: "Status updated.",
        error: "Failed to update status.",
    },
    [PostEndpointUrl.ClearEmojiStatus]: {
        success: "Status cleared.",
        error: "Failed to clear status.",
    },
    [PostEndpointUrl.UpdateUserProfile]: {
        success: "Profile updated successfully.",
        error: "Failed to update profile.",
    },
    [PostEndpointUrl.UpdateFCMToken]: {
        success: "Notifications registered.",
        error: "Failed to register notifications.",
    },

    // Search
    [PostEndpointUrl.SearchUserAndChannel]: {
        success: "Search completed.",
        error: "Search failed.",
    },
    [PostEndpointUrl.GlobalSearch]: {
        success: "Global search completed.",
        error: "Global search failed.",
    },
    [PostEndpointUrl.SearchChatWithUser]: {
        success: "Search completed.",
        error: "Search failed.",
    },
    [PostEndpointUrl.SearchActiveUserChannelList]: {
        success: "Search completed.",
        error: "Search failed.",
    },
    [PostEndpointUrl.SearchArchiveUserChannelList]: {
        success: "Search completed.",
        error: "Search failed.",
    },

    // Video / Calls & Recording
    [PostEndpointUrl.CreateChannelVideoCallToken]: {
        success: "Call joined.",
        error: "Failed to join call.",
    },
    [PostEndpointUrl.CreateChatVideoCallToken]: {
        success: "Call joined.",
        error: "Failed to join call.",
    },
    [PostEndpointUrl.CreateGroupChatVideoCallToken]: {
        success: "Call joined.",
        error: "Failed to join call.",
    },
    [PostEndpointUrl.StartChannelCallRecording]: {
        success: "Recording started.",
        error: "Failed to start recording.",
    },
    [PostEndpointUrl.StopChannelCallRecording]: {
        success: "Recording stopped.",
        error: "Failed to stop recording.",
    },
    [PostEndpointUrl.StartDmCallRecording]: {
        success: "Recording started.",
        error: "Failed to start recording.",
    },
    [PostEndpointUrl.StopDmCallRecording]: {
        success: "Recording stopped.",
        error: "Failed to stop recording.",
    },
    [PostEndpointUrl.StartGrpCallRecording]: {
        success: "Recording started.",
        error: "Failed to start recording.",
    },
    [PostEndpointUrl.StopGrpCallRecording]: {
        success: "Recording stopped.",
        error: "Failed to stop recording.",
    },

    // Admin
    [PostEndpointUrl.CreateAdmin]: {
        success: "Admin added successfully.",
        error: "Failed to add admin.",
    },
    [PostEndpointUrl.RemoveAdmin]: {
        success: "Admin role removed.",
        error: "Failed to remove admin role.",
    },
    [PostEndpointUrl.DeactivateUser]: {
        success: "User deactivated.",
        error: "Failed to deactivate user.",
    },
    [PostEndpointUrl.ActivateUser]: {
        success: "User activated.",
        error: "Failed to activate user.",
    },

    // Auth
    [PostEndpointUrl.Logout]: {
        success: "Logged out successfully.",
        error: "Logout failed.",
    },
    [PostEndpointUrl.AddInvitation]: {
        success: "Invitation sent successfully.",
        error: "Failed to send invitation.",
    },
    [PostEndpointUrl.DeleteInvitation as any]: {
        success: "Invitation removed successfully.",
        error: "Failed to remove invitation.",
    },
    [PostEndpointUrl.UpdateEmailConfig]: {
        success: "Email configuration saved successfully.",
        error: "Failed to save email configuration.",
    },
    [PostEndpointUrl.UploadEmailLogo]: {
        success: "Email logo operation completed successfully.",
        error: "Failed to perform email logo operation.",
    },
}


export const usePost = () => {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
    const { toast } = useToast()

    const makeRequest = React.useCallback(async <T, R = GenericResponse>(options: UsePostOptions<T>): Promise<R | undefined> => {
        const { apiEndpoint, payload, appendToUrl, onSuccess, showToast } = options

        // Get success and error messages based on the API endpoint
        const { success: successMessage, error: errorMessage } = endpointMessages[apiEndpoint] || {
            success: "Operation completed successfully.",
            error: "An error occurred.",
        }

        setIsSubmitting(true)
        try {
            const method = options.method || "POST"
            const url = `${apiEndpoint}${appendToUrl ? appendToUrl : ""}`
            
            let response;
            if (method === "GET") {
                response = await axiosInstance.get(url)
            } else if (method === "DELETE") {
                response = await axiosInstance.delete(url)
            } else if (method === "PUT") {
                response = await axiosInstance.put(url, payload)
            } else if (method === "PATCH") {
                response = await axiosInstance.patch(url, payload)
            } else {
                response = await axiosInstance.post(url, payload)
            }

            if (showToast) {
                toast({
                    title: "Success",
                    description: successMessage,
                })
            }
            if (onSuccess) {
                onSuccess()
            }
            return response.data.data ?? response.data
        } catch (e) {
            const error = e as AxiosError<ErrorResponse>
            
            // Show toast if general showToast is true OR specific showErrorToast is true
            if (showToast || options.showErrorToast) {
                // Safely extract error message from response, handling undefined cases
                const serverMessage = error.response?.data?.msg || error.response?.data?.mag || error.response?.data?.message || ""
                const fullMessage = serverMessage ? `${errorMessage}: ${serverMessage}` : errorMessage

                toast({
                    title: "Error",
                    description: fullMessage || error.message,
                    variant: "destructive",
                })
            }
            
            // Handle Offline Queueing if enabled
            if (options.useQueueIfOffline && (!error.response || error.code === 'ERR_NETWORK')) {
                 // Capture the request to retry later
                 const retryAction = () => makeRequest({ ...options, useQueueIfOffline: false });
                 offlineQueue.add({
                    action: retryAction,
                    description: options.description || "Retrying action"
                 });
            }

            throw e; // Re-throw to allow component-level catch (e.g. for optimistic rollbacks)
        } finally {
            setIsSubmitting(false)
        }
    }, [toast]);

    return {
        makeRequest,
        isSubmitting,
    }
}
