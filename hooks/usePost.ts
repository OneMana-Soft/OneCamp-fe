"use client"

import React, { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import type { GenericResponse } from "@/types/genericRes"

import type { AxiosError } from "axios"
import { errorToastCopy, isDemoRefusal } from "@/lib/utils/errorToast"
import { apiErrorMessage } from "@/lib/utils/apiError"

interface UsePostOptions<T> {
    apiEndpoint: string
    payload?: T
    appendToUrl?: string
    url?: string // Full URL override (takes precedence over apiEndpoint + appendToUrl)
    onSuccess?: () => void
    showToast?: boolean
    showErrorToast?: boolean // Specific control for error toasts
    /**
     * No toast at all, neither this hook's nor the global error toast: for a
     * request whose outcome the screen says itself, or nobody needs (signing
     * out, which leaves for the sign-in page at once).
     */
    quiet?: boolean
    /**
     * What didn't happen, for this call: "Couldn't deactivate Priya Raman"
     * where the endpoint's own words can only say "Couldn't deactivate user".
     * The server's reason still goes under it.
     */
    failureTitle?: string
    method?: HttpMethod
}


interface ErrorResponse {
    msg?: string
    message?: string
    code?: string
}

/**
 * The words a toast leads with, from this file's messages: what didn't
 * happen ("Couldn't create team"), or what did ("Team created"). The messages
 * were written as sentences for a toast titled "Error" or "Success", which
 * said nothing the colour hadn't; now they are the title, and the server's
 * reason is the line under it. Pure.
 */
export function failureTitle(message: string): string {
    return message.replace(/^Failed to /, "Couldn't ").replace(/\.$/, "")
}

export function successTitle(message: string): string {
    return message.replace(/ successfully\.?$/, "").replace(/\.$/, "")
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH"


const endpointMessages: Partial<Record<string, { success: string; error: string }>> = {
    [PostEndpointUrl.NotifyAnyway]: { success: "Notified.", error: "Couldn't notify them" },
    [PostEndpointUrl.PauseNotifications]: { success: "Notifications updated.", error: "Couldn't change your notifications" },
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
    // The server archives a project; nothing in it is deleted.
    [PostEndpointUrl.DeleteProject]: {
        success: "Project archived successfully.",
        error: "Failed to archive project.",
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
        success: "Added to favourites.",
        error: "Failed to add to favourites.",
    },
    [PostEndpointUrl.RemoveFavChannel]: {
        success: "Removed from favourites.",
        error: "Failed to remove from favourites.",
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
    // A channel's posts are messages to the people reading them (QA F-34).
    [PostEndpointUrl.CreateChannelPost]: {
        success: "Message sent.",
        error: "Failed to send message.",
    },
    [PostEndpointUrl.UpdateChannelPost]: {
        success: "Message updated.",
        error: "Failed to update message.",
    },
    [PostEndpointUrl.DeleteChannelPost]: {
        success: "Message deleted.",
        error: "Failed to delete message.",
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
    [PostEndpointUrl.MoveTask]: {
        success: "Task moved.",
        error: "Could not move the task",
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
        success: "Subtask added.",
        error: "Couldn't add the subtask.",
    },
    [PostEndpointUrl.AddAttachmentToTask]: {
        success: "Attachment added.",
        error: "Failed to add attachment.",
    },
    [PostEndpointUrl.RemoveTaskAttachment]: {
        success: "Attachment removed.",
        error: "Failed to remove attachment.",
    },

    // Comments. A channel's or a DM's are the replies in a thread.
    [PostEndpointUrl.CreatePostComment]: {
        success: "Reply sent.",
        error: "Failed to send reply.",
    },
    [PostEndpointUrl.UpdatePostComment]: {
        success: "Reply updated.",
        error: "Failed to update reply.",
    },
    [PostEndpointUrl.RemovePostComment]: {
        success: "Reply deleted.",
        error: "Failed to delete reply.",
    },
    [PostEndpointUrl.CreateChatComment]: {
        success: "Reply sent.",
        error: "Failed to send reply.",
    },
    [PostEndpointUrl.UpdateChatComment]: {
        success: "Reply updated.",
        error: "Failed to update reply.",
    },
    [PostEndpointUrl.RemoveChatComment]: {
        success: "Reply deleted.",
        error: "Failed to delete reply.",
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
    [PostEndpointUrl.DeleteBoard]: {
        success: "Board deleted.",
        error: "Failed to delete board.",
    },
    [PostEndpointUrl.UpdateDocPermissions]: {
        success: "Permissions updated.",
        error: "Failed to update permissions.",
    },
    [PostEndpointUrl.UpdateBoardPermissions]: {
        success: "Board sharing updated.",
        error: "Failed to update board sharing.",
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

    // Webhooks
    [PostEndpointUrl.CreateWebhook]: {
        success: "Webhook created successfully.",
        error: "Failed to create webhook.",
    },

    // GitHub
    [PostEndpointUrl.GitHubCallback]: {
        success: "GitHub connected successfully.",
        error: "Failed to connect GitHub.",
    },
    [PostEndpointUrl.GitHubDisconnect]: {
        success: "GitHub disconnected. All links and metadata cleared.",
        error: "Failed to disconnect GitHub.",
    },
    [PostEndpointUrl.GitHubLinkRepo]: {
        success: "Repository linked successfully.",
        error: "Failed to link repository.",
    },
    [PostEndpointUrl.GitHubUpdateAutomationRules]: {
        success: "Automation rules updated.",
        error: "Failed to update automation rules.",
    },
    [PostEndpointUrl.GitHubUpdateBranchFormat]: {
        success: "Branch format updated.",
        error: "Failed to update branch format.",
    },
    [PostEndpointUrl.GitHubLinkTask]: {
        success: "Task linked to GitHub successfully.",
        error: "Failed to link task to GitHub.",
    },
    [PostEndpointUrl.GitHubUnlinkTask]: {
        success: "Task unlinked from GitHub.",
        error: "Failed to unlink task from GitHub.",
    },
    [PostEndpointUrl.GitHubCreateBranch]: {
        success: "Branch created on GitHub.",
        error: "Failed to create branch.",
    },
    [PostEndpointUrl.GitHubRetrySync]: {
        success: "Sync re-queued.",
        error: "Failed to retry sync.",
    },
    [PostEndpointUrl.GitHubRefresh]: {
        success: "Refresh started.",
        error: "Failed to start refresh.",
    },
    [PostEndpointUrl.GitHubCreatePR]: {
        success: "Pull request created.",
        error: "Failed to create pull request.",
    },
    [PostEndpointUrl.GitHubBulkLink]: {
        success: "Tasks linked to GitHub successfully.",
        error: "Failed to link tasks.",
    },
    [PostEndpointUrl.GitHubBulkUnlink]: {
        success: "Tasks unlinked from GitHub.",
        error: "Failed to unlink tasks.",
    },
    [PostEndpointUrl.GitHubImportIssues]: {
        success: "Issues imported successfully.",
        error: "Failed to import issues.",
    },
    [PostEndpointUrl.GitHubImportPRs]: {
        success: "PRs imported successfully.",
        error: "Failed to import PRs.",
    },

    // Archive
    [PostEndpointUrl.RestoreArchiveItems]: {
        success: "Items restored successfully.",
        error: "Failed to restore items.",
    },
    [PostEndpointUrl.RunArchiveJob]: {
        success: "Archive job started.",
        error: "Failed to start archive job.",
    },
    [PostEndpointUrl.UpdateArchivePolicy]: {
        success: "Policy updated successfully.",
        error: "Failed to update policy.",
    },
    [PostEndpointUrl.UndoArchiveJob]: {
        success: "Archive job undone successfully.",
        error: "Failed to undo archive job.",
    },
}


export const usePost = () => {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
    const { toast } = useToast()

    const makeRequest = React.useCallback(async <T, R = GenericResponse>(options: UsePostOptions<T>): Promise<R | undefined> => {
        const { apiEndpoint, payload, appendToUrl, url: urlOverride, onSuccess, showToast } = options

        // Get success and error messages based on the API endpoint
        const { success: successMessage, error: errorMessage } = endpointMessages[apiEndpoint] || {
            success: "Done.",
            error: "Couldn't finish that.",
        }
        // When this hook says what went wrong, the global error toast stands
        // down for the request: there is one toast on screen at a time, and
        // the two used to replace each other, the vaguer one last.
        const ownsErrorToast = !options.quiet && !!(showToast || options.showErrorToast)
        const config = ownsErrorToast || options.quiet || options.showErrorToast === false ? { suppressErrorToast: true } : undefined

        setIsSubmitting(true)
        try {
            const method = options.method || "POST"
            const url = urlOverride || `${apiEndpoint}${appendToUrl ? appendToUrl : ""}`
            
            let response;
            if (method === "GET") {
                response = await axiosInstance.get(url, config)
            } else if (method === "DELETE") {
                response = await axiosInstance.delete(url, config)
            } else if (method === "PUT") {
                response = await axiosInstance.put(url, payload, config)
            } else if (method === "PATCH") {
                response = await axiosInstance.patch(url, payload, config)
            } else {
                response = await axiosInstance.post(url, payload, config)
            }

            // Held by the project's rules: their words (lib/rules/held) stand for the success toast.
            const said = response.data as ErrorResponse | undefined
            if (said?.code === "approval" || said?.code === "status_rule") {
                if (!options.quiet) void import("@/lib/rules/held").then((m) => m.sayHeld(toast, said))
            } else if (showToast && !options.quiet) {
                toast({ title: successTitle(successMessage) })
            }
            if (onSuccess) {
                onSuccess()
            }
            return response.data.data ?? response.data
        } catch (e) {
            const error = e as AxiosError<ErrorResponse>
            
            // One toast: what didn't happen, in the person's words, and why, in
            // the server's (or what its status means when its message is a bare
            // "no"), or that nothing answered at all. The demo explaining itself
            // (code "demo") keeps its own title and words.
            if (ownsErrorToast) {
                const data = error.response?.data
                if (data?.code === "approval") {
                    void import("@/lib/rules/held").then((m) => m.sayHeld(toast, data))
                } else if (isDemoRefusal(data)) {
                    toast({ variant: "destructive", ...errorToastCopy(error.response?.status, data?.msg, data?.code) })
                } else {
                    const description = error.response
                        ? errorToastCopy(error.response.status, data?.msg || data?.message, data?.code).description
                        : apiErrorMessage(e, "Try again in a moment.")
                    toast({ title: options.failureTitle || failureTitle(errorMessage), description, variant: "destructive" })
                }
            }
            
            throw e; // Re-throw to allow component-level catch (e.g. for optimistic rollbacks)
        } finally {
            setIsSubmitting(false)
        }
    }, [toast]);

    // MEMOISED: callers list `post` in their hooks' dependencies, so a new
    // object each render re-ran them, and an effect that sets state looped
    // (GitHubIssueSearchDialog: "Maximum update depth exceeded", the whole
    // app's error screen). makeRequest is stable; only isSubmitting moves.
    return React.useMemo(
        () => ({ makeRequest, isSubmitting }),
        [makeRequest, isSubmitting],
    )
}
