/**
 * Shared endpoint URL enums.
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
    AdminSeats = "/admin/seats",
    // Save for later: the member's own list. ?state=open|done
    Later = "/later",
    // Retention as a setting rather than a deploy: the person who owns the
    // policy is usually compliance or legal, and they cannot edit a compose file.
    AdminRetention = "/admin/retention",
    AdminPush = "/admin/push",
    SelfProfile = "/user/profile",
    ApprovalsWaiting = "/approvals/waiting",
    SelfProfileSideNav = "/user/sidebarNav",
    UserListNotBelongToChannel = "user/usersListNotBelongToChannelId",
    ChannelBasicInfo = "/ch/channelBasicInfo",
    PublicAttachmentURL = "/getFile",
    GetChannelMedia = "/ch/getFile",
    GetProjectMedia = "/project/getFile",
    GetDocMedia = "/doc/getFile",
    GetChannelLatestPost = "/po/latestPosts",
    GetChatLatestMessage = "/dm/latestChat",
    GetGroupChatLatestMessage = "/groupChat/latestChat",
    // Read receipts: GET who has seen a DM or group chat, POST to mark it seen.
    DmSeen = "/dm/seen",
    GroupChatSeen = "/groupChat/seen",
    GetChatMedia = "/dm/getFile",
    GetGroupChatMedia = "/groupChat/getFile",
    GetChannelRecordingMedia = "/ch/getRecordingURL",
    GetChatRecordingMedia = "/dm/getRecordingURL",
    GetGrpChatRecordingMedia = "/groupChat/getRecordingURL",
    GetChannelRecordingTranscript = "/ch/getRecordingTranscript",
    GetChatRecordingTranscript = "/dm/getRecordingTranscript",
    GetGrpChatRecordingTranscript = "/groupChat/getRecordingTranscript",
    GetMqttConfig = "/config/mqttConfig",
    GetClientConfig = "/config/client",
    GetUserLatestChatList = "/dm/getLatestChatList",
    GetUserTeamList = "/team/teamListByUserUID",
    GetAllUser = "/user/allUsers",
    GetDMableAITargets = "/user/dm-ai-targets",
    GetUserPrivateDocList = "/doc/getPrivateDoc",
    GetUserPublicDocList = "/doc/getPublicDoc",
    GetUserActiveChannelList = "/ch/userActiveChannelsWithLatestPost",
    GetAllActiveChannelList = "/ch/allActiveChannels",
    GetUserArchiveChannelList = "/ch/userArchiveChannelsWithLatestPost",
    GetTeamInfo = "/team/info",
    GetTeamProjectList = "/team/projectList",
    GetProjectMembers = "/project/memberWithAdminFlag",
    GetProjectInfo = "/project/info",
    GetProjectTaskList = "/project/taskList",
    GetProjectTaskListForKanban = "/project/taskListForKanban",
    GetUserTaskList = "/user/assignedTaskList",
    GetUserTaskListForKanban = "/user/assignedTaskListForKanban",
    projectListByAdminUID = "/project/projectListByAdminUID",
    GetTaskInfo = "/task/info",
    ProjectFields = "/project",
    ProjectWorkload = "/project/workload",
    BotKinds = "/user/botKinds",
    // Time on tasks: /task/time/{task} (GET, POST to add, /start), /task/time/stop,
    // /task/time/running, /task/time/entry/{id}/update|delete; a project's report
    // is /project/{id}/time.
    TaskTime = "/task/time",
    GetUserProjectList = "/user/userProjectList",
    GetDmGroupParticipants = "/groupChat/getDmParticipants",
    GetDocInfo = "/doc/getDocInfo",
    GetBoardInfo = "/board/getBoardInfo",
    GetScheduledMessages = "/message/scheduled",
    // AI Agent Builder
    GetAgents = "/agents",
    GetChannelAgents = "/agent-card/channel", // append /{channelId}; channel members only
    GetOAuthRequest = "/oauth/requests", // append /{id}
    AgentNotePreference = "/ai/agent-note/preference",
    // Tables (first-class structured-data entity)
    GetTables = "/tables",
    GetTable = "/tables",       // append /{id} (bundle)
    GetMentionActivity= "/activity/mentions",
    GetUnifiedActivity= "/activity/unified",
    GoogleCalendarAuthUrl = "/integration/google-calendar/auth-url",
    GoogleCalendarStatus = "/integration/google-calendar/status",
    GoogleCalendarEvents = "/event/getEvents",
    GetEvent = "/event/getEvent",

    // Email notification preferences (per-user).
    GetNotificationPreferences = "/user/notificationPreferences",

    // AI Second Brain
    AIStatus = "/ai/status",
    GetAIMyModels = "/ai/models",

    // Workspace settings (admin)
    GetWorkspaceSettings = "/admin/settings",
    GetDefaultChannels = "/admin/default-channels",
    GetAdminAuditLog = "/admin/audit-log",
    /** How full the server's disk is (admins only): used_pct, free_bytes, level. */
    GetAdminDisk = "/admin/disk",
    GetTranscriptionConfig = "/admin/transcription/config",

    // AI model management (Admin)
    GetAIConfig = "/admin/ai/config",
    GetAIAuthorizedModels = "/admin/ai/authorized-models",

    // Capability permission policies (Admin)
    GetCapabilityPolicies = "/admin/capabilities",
    // Current user's resolved capabilities (member-accessible)
    MyCapabilities = "/me/capabilities",

    GetGitHubSyncStatus = "/task/github-sync-status",

    GetArchiveJobs = "/admin/archive/jobs",
    GetArchiveStats = "/admin/archive/stats",

    // The other providers' imports: services/importService.
}

export enum PostFileUploadURL {
    UploadFile = "/uploadFile",
}

export enum PostEndpointUrl {
    LaterSave = "/later/save",
    LaterUpdate = "/later/update",
    LaterDelete = "/later/delete",
    CreateTeam = "/team/createTeam",
    CreateProject = "/project/createProject",
    CreateChannel = "/ch/create",
    CreateDoc = "/doc/createDoc",
    UpdateDoc = "/doc/updateDoc",
    CreateBoard = "/board/createBoard",
    DeleteBoard = "/board/deleteBoard",
    AnswerOAuthRequest = "/oauth/requests", // append /{id}/approve or /{id}/deny
    LeaveAgentNote = "/ai/agent-note",
    SetAgentNotePreference = "/ai/agent-note/preference",
    DisconnectMyAssistant = "/me/assistants", // append /{id}/disconnect
    UpdateBoardPermissions = "/board/updateBoardPermissions",
    JoinChannel = "/ch/joinChannel",
    UpdateChannel = "/ch/updateInfo",
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
    SetReadReceiptsPolicy = "/admin/read-receipts",
    SetDefaultChannels = "/admin/default-channels",
    StartChannelCallRecording = "/ch/startCallRecording",
    StopChannelCallRecording = "/ch/stopCallRecording",
    StartDmCallRecording = "/dm/startCallRecording",
    StopDmCallRecording = "/dm/stopCallRecording",
    StartGrpCallRecording = "/groupChat/startCallRecording",
    StopGrpCallRecording = "/groupChat/stopCallRecording",
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
    MoveTask = "/task/moveTask",
    UpdateTaskPriority = "/task/updateTaskPriority",
    UpdateTaskLabel = "/task/updateTaskLabel",
    UpdateTaskDesc = "/task/updateTaskDesc",
    UpdateTaskStartDate = "/task/updateTaskStartDate",
    UpdateTaskDueDate = "/task/updateTaskDueDate",
    UpdateTaskEstimate = "/task/updateTaskEstimate",
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
    AddInvitation = "/admin/addInvitation",
    DeleteInvitation = "/admin/deleteInvitation/",
    UpdateEmailConfig = "/admin/config/email",
    UploadEmailLogo = "/admin/config/email/logo",

    GoogleCalendarUnlink = "/integration/google-calendar/unlink",
    CreateCalendarEvent = "/event/createEvent",
    EndFocus = "/event/endFocus",

    PauseNotifications = "/user/notificationPause",
    NotifyAnyway = "/user/notifyAnyway",

    // Workspace settings (admin)
    UpdateWorkspaceSettings = "/admin/settings",
    UpdateTranscriptionConfig = "/admin/transcription/config",
    TestTranscriptionConfig = "/admin/transcription/test",

    // Webhooks (Admin)
    CreateWebhook = "/admin/webhooks",
    DeleteWebhook = "/admin/webhooks", // append /{webhookId} — use DELETE

    // Capability permission policies (Admin)
    SetCapabilityPolicy = "/admin/capabilities",

    // GitHub (Admin)
    GitHubCallback = "/admin/github/callback",
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

    // Archive (Admin)
    UpdateArchivePolicy = "/admin/archive/policies", // append /{entityType} — use PUT
    RunArchiveJob = "/admin/archive/run", // append /{entityType}
    RestoreArchiveItems = "/admin/archive/restore",
    UndoArchiveJob = "/admin/archive/undo", // append /{jobId}
}
