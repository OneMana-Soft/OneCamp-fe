/**
 * Centralised endpoint URL enums.
 *
 * IMPORTANT: many entries intentionally share the same string value
 * because they are URL *prefixes* that callers extend with a path
 * suffix (`/{webhookId}/logs`, `/{jobId}/plan`, etc.). The lint rule
 * `@typescript-eslint/no-duplicate-enum-values` flags these as
 * "duplicates", but in this codebase the duplication is the contract:
 * each name documents the intent at the call site, the value
 * documents the base URL. We disable the rule for this file only.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum GetEndpointUrl {
    Logout = "/logout",
    SelfProfile = "/user/profile",
    SelfProfileSideNav = "/user/sidebarNav",
    UserListNotBelongToChannel = "user/usersListNotBelongToChannelId",
    UserListNotBelongToDm = "user/usersListWhoDontBelongToTheDM",
    UserListNotBelongToProjectButBelongsToTeam="user/usersListWhoDontBelongToTheProjectButBelongToTheTeam",
    UsersListWhoDontBelongToTheTeam="user/usersListWhoDontBelongToTheTeam",
    CheckTeamNameAvailability = "/team/checkTeamNameExist",
    TeamListUserIsAdmin = "/team/teamListByAdminUID",
    CheckChannelNameAvailability = "/ch/chNameIsAvailable",
    ChannelBasicInfo = "/ch/channelBasicInfo",
    ChannelRecordingList = "/ch/getRecordingList",
    ChatRecordingList = "/dm/getRecordingList",
    GroupChatRecordingList = "/groupChat/getRecordingList",
    ChannelMemberInfoWithAdminFlagInfo = "/ch/channelInfoWithMemberAdminFlag",
    PublicAttachmentURL = "/getFile",
    GetChannelMedia = "/ch/getFile",
    GetProjectMedia = "/project/getFile",
    GetDocMedia = "/doc/getFile",
    GetDocAttachment = "/doc/getDocAttachment",
    GetChannelLatestPost = "/po/latestPosts",
    GetChatLatestMessage = "/dm/latestChat",
    GetGroupChatLatestMessage = "/groupChat/latestChat",
    GetNewPostIncludingCurrentPost = "/po/newPostsIncludingCurrent",
    GetNewChatIncludingCurrentChat = "/dm/newChatsIncludingCurrentChat",
    GetNewGroupChatIncludingCurrentChat = "/groupChat/newChatsIncludingCurrentChat",
    GetNewPostAfter = "/po/newPosts",
    GetNewChatAfter = "/dm/newChats",
    GetNewGroupChatAfter = "/groupChat/newChats",
    GetOldPostBefore = "/po/oldPosts",
    GetOldChatBefore = "/dm/oldChats",
    GetOldGroupChatBefore = "/groupChat/oldChats",
    GetChatMedia = "/dm/getFile",
    GetGroupChatMedia = "/groupChat/getFile",
    GetChannelRecordingMedia = "/ch/getRecordingURL",
    GetChatRecordingMedia = "/dm/getRecordingURL",
    GetGrpChatRecordingMedia = "/groupChat/getRecordingURL",
    GetChannelRecordingTranscript = "/ch/getRecordingTranscript",
    GetChatRecordingTranscript = "/dm/getRecordingTranscript",
    GetGrpChatRecordingTranscript = "/groupChat/getRecordingTranscript",
    GetOnlyPostText = "/po/getOnlyPostText",
    GetOnlyChatText = "/dm/getChatOnlyText",
    GetOnlyGroupChatText = "/groupChat/getChatOnlyText",
    GetUserStatuses = "/user/getAllUserEmojiStatusList",
    GetUserEmojiStatus = "/user/getActiveUserEmojiStatus",
    GetPostWithAllComments = "/po/allComments",
    GetChatWithAllComments = "/dm/chatWithAllComments",
    GetAllCommentOfDoc = "/doc/getCommentList",
    GetMqttConfig = "/config/mqttConfig",
    GetClientConfig = "/config/client",
    GetUserLatestChatList = "/dm/getLatestChatList",
    GetUserTeamList = "/team/teamListByUserUID",
    GetAllUser = "/user/allUsers",
    GetUserPrivateDocList = "/doc/getPrivateDoc",
    GetUserPublicDocList = "/doc/getPublicDoc",
    GetUserActiveChannelList = "/ch/userActiveChannelsWithLatestPost",
    GetAllActiveChannelList = "/ch/allActiveChannels",
    GetUserArchiveChannelList = "/ch/userArchiveChannelsWithLatestPost",
    GetTeamInfo = "/team/info",
    GetTeamProjectList = "/team/projectList",
    GetProjectMembers = "/project/memberWithAdminFlag",
    GetTeamMemberInfo = "/team/membersInfo",
    GetProjectMemberInfo = "/project/membersInfo",
    GetProjectInfo = "/project/info",
    GetProjectTaskList = "/project/taskList",
    GetProjectTaskListForKanban = "/project/taskListForKanban",
    GetUserTaskList = "/user/assignedTaskList",
    GetUserTaskListForKanban = "/user/assignedTaskListForKanban",
    GetProjectAttachments = "/project/attachments",
    projectListByAdminUID = "/project/projectListByAdminUID",
    GetTaskInfo = "/task/info",
    GetUserProjectList = "/user/userProjectList",
    GetDmGroupParticipants = "/groupChat/getDmParticipants",
    GetDocInfo = "/doc/getDocInfo",
    GetDocPermissions = "/doc/getDocPermissions",
    GlobalSearch = "/search/unifiedSearch/",
    GetMentionActivity= "/activity/mentions",
    GetCommentActivity= "/activity/comments",
    GetReactionsActivity= "/activity/reactions",
    GetUnifiedActivity= "/activity/unified",
    GetUserPosts = "/user/posts",
    UserRecordingList = "/user/recordingList",
    GetAdminTeamList = "/admin/getAllTeamList",
    GetAdminUserList = "/admin/getAllUsersList",
    GetAdminAdminList = "/admin/getAllAdminUsers",
    GetAdminInvitationList = "/admin/getAllInvitations",
    GetEmailConfig = "/admin/config/email",
    GoogleCalendarAuthUrl = "/integration/google-calendar/auth-url",
    GoogleCalendarStatus = "/integration/google-calendar/status",
    GoogleCalendarEvents = "/event/getEvents",

    // Per-user connectors (Gmail, Calendar, GitHub) the AI can read/act through.
    Connectors = "/connectors",

    // Email notification preferences (per-user).
    GetNotificationPreferences = "/user/notificationPreferences",

    // AI Second Brain
    AIStatus = "/ai/status",

    // Slash command framework (user-facing)
    GetCommandCatalog = "/command/catalog",

    // App platform (admin)
    GetApps = "/admin/apps",
    GetApp = "/admin/apps", // append /{appId}
    GetAppOAuthURL = "/admin/apps", // append /{appId}/oauth-url
    GetMarketplace = "/admin/marketplace",

    // Login OAuth credentials (admin)
    GetOAuthConfig = "/admin/auth/oauth-config",

    // Workspace settings (admin)
    GetWorkspaceSettings = "/admin/settings",
    GetAdminAuditLog = "/admin/audit-log",
    GetTranscriptionConfig = "/admin/transcription/config",

    // AI model management (Admin)
    GetAIConfig = "/admin/ai/config",
    GetAISystemStats = "/admin/ai/system",
    GetAIReindexStatus = "/admin/ai/reindex/status",
    GetAIMemoryRebuildStatus = "/admin/ai/memory/rebuild/status",
    GetAIBriefing = "/ai/briefing",
    GetChannelMemoryExclusion = "/ai/memory/channel-exclusion",
    GetAIProviderModels = "/admin/ai/providers", // append /{providerId}/models
    GetAIOllamaCatalog = "/admin/ai/providers", // append /{providerId}/catalog

    // Workspace Memory (user-facing)
    GetWorkspaceMemory = "/ai/memory",

    // Webhooks (Admin)
    GetAllWebhooks = "/admin/webhooks",
    GetWebhookLogs = "/admin/webhooks", // append /{webhookId}/logs
    GetWebhookEventTypes = "/admin/webhooks/event-types",

    // Workflows (capability-gated: admins always, members when allowed)
    GetAllWorkflows = "/workflows",
    GetWorkflow = "/workflows", // append /{id}
    // Capability permission policies (Admin)
    GetCapabilityPolicies = "/admin/capabilities",
    // Current user's resolved capabilities (member-accessible)
    MyCapabilities = "/me/capabilities",

    // GitHub (Admin)
    GetGitHubAuthUrl = "/admin/github/auth-url",
    GetGitHubConfig = "/admin/github/config",
    GetGitHubStatus = "/admin/github/status",
    GetGitHubRateLimit = "/admin/github/rate-limit",
    GetGitHubWebhookHealth = "/admin/github/webhook-health",
    GetGitHubRepos = "/admin/github/repos",
    GetGitHubLinkedRepos = "/admin/github/linked-repos", // append /{projectId}
    GetGitHubImportJobs = "/admin/github/import-jobs", // append /{linkId}
    GetGitHubImportJob = "/admin/github/import-job", // append /{jobId}

    // GitHub (Task)
    GetGitHubTaskActivity = "/task/github-activity",
    GetGitHubSyncStatus = "/task/github-sync-status",
    GetGitHubSearchIssues = "/task/github-search-issues",
    GetGitHubSearchPRs = "/task/github-search-prs",

    // External Users (Admin)
    GetExternalUsers = "/admin/external-users",

    // Archive (Admin)
    GetArchivePolicies = "/admin/archive/policies",
    GetArchiveJobs = "/admin/archive/jobs",
    GetArchiveStats = "/admin/archive/stats",

    // Slack Import (Admin)
    GetSlackImportJobs = "/admin/import/slack/jobs",
    GetSlackImportJob = "/admin/import/slack/jobs", // append /{jobId}
    GetSlackImportErrors = "/admin/import/slack/jobs", // append /{jobId}/errors

    // Generic Import (Admin) — Asana / Jira / Trello / Notion / Todoist
    GetImportProviders = "/admin/import/providers",
    GetImportConnections = "/admin/import/connections",
    GetImportJobs = "/admin/import/jobs",
    GetImportJob = "/admin/import/jobs", // append /{jobId}
    GetImportJobErrors = "/admin/import/jobs", // append /{jobId}/errors
}


export enum PostFileUploadURL {
    UploadFile = "/uploadFile",
}

export enum PostEndpointUrl {
    CreateTeam = "/team/createTeam",
    CreateProject = "/project/createProject",
    CreateChannel = "/ch/create",
    CreateDoc = "/doc/createDoc",
    UpdateDoc = "/doc/updateDoc",
    JoinChannel = "/ch/joinChannel",
    UpdateChannel = "/ch/updateInfo",
    SetChannelPostPolicy = "/ch/postPolicy",
    RemoveProjectModerator = "/project/removeAdminRole",
    RemoveTeamModerator = "/team/removeAdminRole",
    RemoveChannelModerator = "/ch/removeModerator",
    RemoveChannelMember = "/ch/removeMember",
    RemoveProjectMember = "/project/removeMember",
    RemoveTeamMember = "/team/removeMember",
    AddChannelModerator = "/ch/addModerator",
    AddProjectModerator = "/project/addAdminRole",
    AddTeamAdminRole = "/team/addAdminRole",
    AddChannelMember = "/ch/addMember",
    AddProjectMember = "/project/addMember",
    AddTeamMember = "/team/addMember",
    RemoveTeam = "/admin/deleteTeam",
    UnDeletedTeam = "/admin/unDeleteTeam",
    AddDmMember = "/groupChat/addParticipant",
    AddFavChannel = "/user/addFavChannel",
    RemoveFavChannel = "/user/removeFavChannel",
    UpdateProjectNotification = "/user/updateUserProjectNotification",
    UpdateChannelNotification = "/user/updateUserChannelNotification",
    UpdateChatNotification = "/user/updateChatNotification",
    UpdateGroupChatNotification = "/user/updateGroupChatNotification",
    CreateChannelPost = "/po/createPost",
    CreateChatMessage = "/dm/createChat",
    CreateGroupChatMessage = "/groupChat/createChat",
    DeleteChannelPost = "/po/deletePost",
    DeleteChatMessage = "/dm/deleteChat",
    UpdateChannelPost = "/po/updatePost",
    UpdateChatMessage = "/dm/updateChat",
    UpdateGroupChatMessage = "/groupChat/updateChat",
    SearchUserAndChannel = "/user/searchUserAndChannelList",
    FwdMsgToChatOrChannel = "/user/fwdMessage",
    UpdateUserEmojiStatus = "/user/updateStatusEmojiStatus",
    UpdateUserPresence = "/user/updateStatus",
    ClearEmojiStatus = "/user/clearUserEmojiStatus",
    CreatePostComment = "/po/createComment",
    CreateChannelVideoCallToken = "/ch/getCallToken",
    CreateChatVideoCallToken = "/dm/getCallToken",
    CreateGroupChatVideoCallToken = "/groupChat/getCallToken",
    StartChannelCallRecording = "/ch/startCallRecording",
    StopChannelCallRecording = "/ch/stopCallRecording",
    StartDmCallRecording = "/dm/startCallRecording",
    StopDmCallRecording = "/dm/stopCallRecording",
    StartGrpCallRecording = "/groupChat/startCallRecording",
    StopGrpCallRecording = "/groupChat/stopCallRecording",
    DeleteChannelRecording = "/ch/deleteRecording", // append /{egressId}
    DeleteChatRecording = "/dm/deleteRecording", // append /{egressId}
    DeleteGroupChatRecording = "/groupChat/deleteRecording", // append /{egressId}
    CreateChatComment = "/dm/createComment",
    UpdatePostComment = "/po/updateComment",
    UpdateDocComment = "/doc/updateComment",
    UpdateDocPermissions = "/doc/updateDocPermissions",
    SearchUserForDoc = "/doc/searchUsers",
    RemoveDocComment = "/doc/removeComment",
    UpdateTaskComment = "/task/updateComment",
    UpdateChatComment = "/dm/updateComment",
    RemovePostComment = "/po/removeComment",
    RemoveChatComment = "/dm/removeComment",
    RemoveTaskComment = "/task/deleteTaskComment",
    CreateOrUpdatePostReaction = "/po/addReaction",
    CreateOrUpdateChatReaction = "/dm/addOrCreateReaction",
    RemovePostReaction = "/po/removeReaction",
    RemoveChatReaction = "/dm/removeReaction",
    CreateOrUpdatePostCommentReaction = "/po/addReactionToComment",
    CreateOrUpdateChatCommentReaction = "/dm/addOrUpdateReactionOnComment",
    CreateOrUpdateTaskCommentReaction = "/task/addReactionToComment",
    CreateOrUpdateDocCommentReaction = "/doc/addOrUpdateReactionOnComment",
    RemovePostCommentReaction = "/po/removeReactionFromComment",
    RemoveChatCommentReaction = "/dm/removeReactionOnComment",
    RemoveTaskCommentReaction = "/task/removeReactionFromComment",
    RemoveDocCommentReaction = "/doc/removeReactionOnComment",
    SearchChatWithUser = "/dm/searchChatWithUser",
    SearchActiveUserChannelList = "/ch/channelActiveListWithLatestPostWithSearchText",
    SearchArchiveUserChannelList = "/ch/channelArchivedListWithLatestPostWithSearchText",
    SearchPrivateDocList = "/doc/searchPrivate",
    SearchPublicDocList = "/doc/searchPublic",
    DeleteProject = "/project/deleteProject",
    UndeleteProject = "/project/unDeleteProject",
    UpdateTeamName = "/team/updateName",
    UpdateProjectName = "/project/updateName",
    AddAttachmentToProject = "/project/addAttachment",
    RemoveAttachmentToProject = "/project/removeAttachment",
    CreateTask = "/task/createTask",
    UpdateTaskName = "/task/updateTaskName",
    UpdateTaskStatus = "/task/updateTaskStatus",
    UpdateTaskPriority = "/task/updateTaskPriority",
    UpdateTaskLabel = "/task/updateTaskLabel",
    UpdateTaskDesc = "/task/updateTaskDesc",
    UpdateTaskStartDate = "/task/updateTaskStartDate",
    UpdateTaskDueDate = "/task/updateTaskDueDate",
    UpdateTaskAssignee = "/task/updateTaskAssignee",
    UnArchiveTask = "/task/undeleteTask",
    ArchiveTask = "/task/deleteTask",
    CreateSubTask = "/task/createSubTask",
    AddAttachmentToTask = "/task/addAttachmentToTask",
    CreateTaskComment = "/task/createCommentTask",
    CreateDocComment = "/doc/createComment",
    RemoveTaskAttachment = "/task/deleteTaskAttachment",
    UpdateUserProfile = "/updateUserProfile",
    UpdateUserTheme = "/updateUserTheme",
    DeleteDoc = "/doc/deleteDoc",
    UpdateFCMToken = "/user/updateFCMToken",
    GlobalSearch = "/search/unifiedSearch",
    CreateAdmin = "/admin/createAdmin",
    RemoveAdmin = "/admin/removeAdmin",
    DeactivateUser = "/admin/deactivateUser",
    ActivateUser = "/admin/activateUser",
    Logout = "/logout",
    PublishChannelTyping = "/ch/publishChannelTyping",
    PublishChatTyping = "/dm/publishChatTyping",
    AddInvitation = "/admin/addInvitation",
    DeleteInvitation = "/admin/deleteInvitation/",
    ResendInvitation = "/admin/resendInvitation",
    GetEmailConfig = "/admin/config/email",
    UpdateEmailConfig = "/admin/config/email",
    UploadEmailLogo = "/admin/config/email/logo",
    DeleteEmailLogo = "/admin/config/email/logo",

    // AI model management (Admin)
    SetAIEnabled = "/admin/ai/enabled",
    SetAIRateLimit = "/admin/ai/rate-limit",
    SetAIContextWindow = "/admin/ai/context-window",
    SetAIReasoning = "/admin/ai/reasoning",
    SetAIMeetingRecap = "/admin/ai/meeting-recap",
    CreateAIProvider = "/admin/ai/providers",
    TestAIProvider = "/admin/ai/providers/test",
    UpdateAIProvider = "/admin/ai/providers", // append /{providerId} (PATCH)
    DeleteAIProvider = "/admin/ai/providers", // append /{providerId} (DELETE)
    SetAIChatModel = "/admin/ai/chat-model",
    SetAIEmbeddingModel = "/admin/ai/embedding-model",
    PullAIModel = "/admin/ai/models/pull",
    DeleteAIModel = "/admin/ai/models/delete",
    SetAIMemoryLayer = "/admin/ai/memory-layer",
    SetAITeamReport = "/admin/ai/team-report",
    SetAINudges = "/admin/ai/nudges",
    RebuildAIMemory = "/admin/ai/memory/rebuild",
    UpdateMemoryStatus = "/ai/memory", // append /{id}/status
    DeleteMemoryItem = "/ai/memory", // append /{id}
    CaptureMemory = "/ai/memory/capture",
    MemoryCreateTask = "/ai/memory/{id}/create-task",
    MemoryRemind = "/ai/memory/{id}/remind",
    SetChannelMemoryExclusion = "/ai/memory/channel-exclusion",
    GoogleCalendarUnlink = "/integration/google-calendar/unlink",
    CreateCalendarEvent = "/event/createEvent",
    UpdateCalendarEvent = "/event/updateEvent",
    DeleteCalendarEvent = "/event/deleteEvent",
    LeaveEvent = "/event/leaveEvent",
    UpdateGoogleCalendarSyncTask = "/integration/google-calendar/sync-task",

    // Email notification preferences (per-user).
    UpdateNotificationPreferences = "/user/notificationPreferences",

    // AI Second Brain
    AISummarizeChannel = "/ai/summarize/channel",
    AISummarizeDM = "/ai/summarize/dm",
    AISummarizeGroup = "/ai/summarize/group",
    AIAsk = "/ai/ask",
    AIAskStream = "/ai/ask/stream",
    AICatchUp = "/ai/catch-up",
    AIDocComplete = "/ai/doc/complete",
    AIDocCompleteStream = "/ai/doc/complete/stream",
    AIExecuteAction = "/ai/action/execute",
    AIInCallAskStream = "/ai/in-call/ask/stream",

    // Slash command framework (user-facing)
    ExecuteCommand = "/command/execute",
    InteractCommand = "/command/interact",

    // App platform (admin)
    CreateApp = "/admin/apps",
    UpdateApp = "/admin/apps", // append /{appId} (PATCH)
    DeleteApp = "/admin/apps", // append /{appId} (DELETE)
    SetAppEnabled = "/admin/apps", // append /{appId}/enabled
    DisconnectApp = "/admin/apps", // append /{appId}/oauth-disconnect
    TestApp = "/admin/apps", // append /{appId}/test
    InstallTemplate = "/admin/marketplace/install",
    UninstallTemplate = "/admin/marketplace/uninstall",

    // Login OAuth credentials (admin)
    UpdateOAuthConfig = "/admin/auth/oauth-config",

    // Workspace settings (admin)
    UpdateWorkspaceSettings = "/admin/settings",
    UpdateTranscriptionConfig = "/admin/transcription/config",
    TestTranscriptionConfig = "/admin/transcription/test",

    // Webhooks (Admin)
    CreateWebhook = "/admin/webhooks",
    UpdateWebhook = "/admin/webhooks", // append /{webhookId} — use PUT
    DeleteWebhook = "/admin/webhooks", // append /{webhookId} — use DELETE
    RegenerateWebhookToken = "/admin/webhooks", // append /{webhookId}/regenerate-token
    RegenerateWebhookSecret = "/admin/webhooks", // append /{webhookId}/regenerate-secret
    TestWebhook = "/admin/webhooks", // append /{webhookId}/test

    // Workflows (capability-gated: admins always, members when allowed)
    CreateWorkflow = "/workflows",
    UpdateWorkflow = "/workflows", // append /{id} — use PUT
    DeleteWorkflow = "/workflows", // append /{id} — use DELETE
    SetWorkflowActive = "/workflows", // append /{id}/active
    // Capability permission policies (Admin)
    SetCapabilityPolicy = "/admin/capabilities",
    // Member-managed invitation create (capability-gated)
    CreateInvitation = "/invitations",

    // GitHub (Admin)
    GitHubCallback = "/admin/github/callback",
    UpdateGitHubConfig = "/admin/github/config",
    GitHubDisconnect = "/admin/github/disconnect",
    GitHubLinkRepo = "/admin/github/link-repo",
    GitHubUnlinkRepo = "/admin/github/unlink-repo", // append /{linkId} — use DELETE
    GitHubImportIssues = "/admin/github/import-issues", // append /{linkId}
    GitHubImportPRs = "/admin/github/import-prs", // append /{linkId}
    GitHubUpdateAutomationRules = "/admin/github/links/automation-rules", // append /{linkId}
    GitHubUpdateBranchFormat = "/admin/github/links/branch-format", // append /{linkId}

    // GitHub (Task)
    GitHubLinkTask = "/task/github-link",
    GitHubUnlinkTask = "/task/github-unlink",
    GitHubCreateBranch = "/task/create-branch",
    GitHubRetrySync = "/task/github-retry-sync",
    GitHubRefresh = "/task/github-refresh",
    GitHubCreatePR = "/task/github-create-pr",
    GitHubBulkLink = "/task/github-bulk-link",
    GitHubBulkUnlink = "/task/github-bulk-unlink",

    // External Users (Admin)
    UnlinkExternalUser = "/admin/external-users/unlink",

    // Archive (Admin)
    UpdateArchivePolicy = "/admin/archive/policies", // append /{entityType} — use PUT
    RunArchiveJob = "/admin/archive/run", // append /{entityType}
    RestoreArchiveItems = "/admin/archive/restore",
    UndoArchiveJob = "/admin/archive/undo", // append /{jobId}

    // Slack Import (Admin)
    SlackImportUpload = "/admin/import/slack/upload",
    SlackImportPlan = "/admin/import/slack/plan", // append /{jobId}
    SlackImportRun = "/admin/import/slack/run", // append /{jobId}
    SlackImportCancel = "/admin/import/slack/cancel", // append /{jobId}
    SlackImportRollback = "/admin/import/slack/rollback", // append /{jobId}

    // Generic Import (Admin)
    ImportConnect = "/admin/import",         // /{provider}/connect
    ImportDisconnect = "/admin/import",      // /{provider}/disconnect
    ImportCreateJob = "/admin/import",       // /{provider}/jobs
    ImportPresign = "/admin/import",         // /{provider}/presign
    ImportFinalize = "/admin/import",        // /{provider}/finalize/{jobId}
    ImportPlan = "/admin/import/jobs",       // /{jobId}/plan
    ImportRun = "/admin/import/jobs",        // /{jobId}/run
    ImportCancel = "/admin/import/jobs",     // /{jobId}/cancel
    ImportRollback = "/admin/import/jobs",   // /{jobId}/rollback
}