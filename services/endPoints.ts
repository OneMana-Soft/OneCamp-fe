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
    GetDMableAITargets = "/user/dm-ai-targets",
    GetDMAISuggestions = "/user/dm-ai-suggestions",
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
    GetBoardInfo = "/board/getBoardInfo",
    GetBoardList = "/board/getBoardList",
    GetBoardPermissions = "/board/getBoardPermissions",
    GetBoardAttachment = "/board/getBoardAttachment",
    GetBoardSnapshots = "/board/getBoardSnapshots",
    GetBoardViewers = "/board/getViewers",
    GetSourceLinks = "/link/source", // append /{source_type}/{source_uuid}
    GetRefLinks = "/link/ref",       // append /{ref_type}/{ref_uuid}
    // AI Agent Builder
    GetAgents = "/agents",
    MyAgentWork = "/ai/agent-work",
    AgentWorkForEntity = "/ai/agent-work/for", // append /{entityId}
    GetAgent = "/agents",       // append /{id}
    GetAgentRuns = "/agents",   // append /{id}/runs
    GetAgentActivity = "/agents/activity",
    // MCP servers (external tool providers)
    GetMcpServers = "/mcp/servers",
    GetMcpCatalog = "/mcp/catalog",
    GetMcpServer = "/mcp/servers", // append /{id}
    // Tables (first-class structured-data entity)
    GetTables = "/tables",
    GetTable = "/tables",       // append /{id} (bundle)
    GetTableRows = "/tables",   // append /{id}/rows
    // External data sources (read-only connectors)
    GetDataSources = "/data-sources",              // management list (agent.manage)
    GetDataSource = "/data-sources",               // append /{id}
    GetQueryableDataSources = "/data-sources/queryable", // sources the user may query
    GetDataSourceSchema = "/data-sources",         // append /{id}/schema
    // API tokens (public API)
    GetApiTokens = "/api-tokens",
    GetApiTokenScopes = "/api-tokens/scopes",
    // Templates (shareable templates)
    GetMarketplaceTemplates = "/marketplace/templates", // append ?kind= or /{id}
    GetDocSnapshots = "/doc/getDocSnapshots",
    GetDocViewers = "/doc/getViewers",
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
    GetAIMyModels = "/ai/models",
    MyAIInstructions = "/ai/instructions",
    AIVoiceInput = "/ai/voice-input",

    // Slash command framework (user-facing)
    GetCommandCatalog = "/command/catalog",

    // App platform (admin)
    GetApps = "/admin/apps",
    GetApp = "/admin/apps", // append /{appId}
    GetAppOAuthURL = "/admin/apps", // append /{appId}/oauth-url
    GetMarketplace = "/admin/marketplace",

    // Login OAuth credentials (admin)
    GetOAuthConfig = "/admin/auth/oauth-config",
    // Your OWN second factor. Scoped to the caller — none of the 2FA endpoints takes a user id, so
    // there is nothing to pass and no way to read another member's factor.
    GetTwoFactorStatus = "/auth/2fa",
    // SCIM provisioning credentials (admin). These authenticate the customer's identity provider
    // against /scim/v2, so they belong to the WORKSPACE rather than to whoever created them — which is
    // why they are managed here and not in a member's own settings.
    GetScimTokens = "/admin/scim/tokens",

    // Workspace settings (admin)
    GetWorkspaceSettings = "/admin/settings",
    GetAdminAuditLog = "/admin/audit-log",
    GetTranscriptionConfig = "/admin/transcription/config",
    GetGuestGrants = "/admin/guest-grants",

    // AI model management (Admin)
    GetAIConfig = "/admin/ai/config",
    // Current MCP admission decision, plus the tool groups that actually exist. The
    // available groups come from the server so the UI cannot offer a group with no
    // tools in it, or fail to offer one a new tool introduced.
    GetAIMCPServer = "/admin/ai/mcp-server",
    GetAISystemStats = "/admin/ai/system",
    GetAIActivity = "/admin/ai/activity",
    GetAICodePRScorecard = "/admin/ai/code-pr/scorecard",
    GetAICodePRRuns = "/admin/ai/code-pr/runs",
    GetAIReindexStatus = "/admin/ai/reindex/status",
    GetAIMemoryRebuildStatus = "/admin/ai/memory/rebuild/status",
    GetAIAuthorizedModels = "/admin/ai/authorized-models",
    DiscoverAIModelLimits = "/admin/ai/authorized-models", // append /{id}/discover-limits
    GetAISelfTestStatus = "/admin/ai/self-test/status",
    GetAIBriefing = "/ai/briefing",
    GetAIAttention = "/ai/attention",
    GetAIUsage = "/ai/usage",
    GetAIUserUsage = "/admin/ai/usage/users",
    GetAIChannelUsage = "/admin/ai/usage/channels",
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
    CreateBoard = "/board/createBoard",
    UpdateBoard = "/board/updateBoard",
    DeleteBoard = "/board/deleteBoard",
    GenerateBoardDiagram = "/board/aiGenerate",
    GenerateBoardDiagramStream = "/board/aiGenerateStream",
    PlanBoardDiagram = "/board/aiPlan",
    RefineBoardDiagram = "/board/aiRefineDiagram",
    ClusterBoardContent = "/board/aiCluster",
    GenerateBoardUI = "/board/aiGenerateUI",
    RefineBoardUI = "/board/aiRefineUI",
    AddEntityLink = "/link/add",
    RemoveEntityLink = "/link/remove",
    // AI Agent Builder
    CreateAgent = "/agents",
    DraftAgent = "/agents/draft",
    UpdateAgent = "/agents",     // append /{id}/update
    DeleteAgent = "/agents",     // append /{id}/delete
    SetAgentActive = "/agents",  // append /{id}/active
    RunAgent = "/agents",        // append /{id}/run
    StopAgentWork = "/ai/agent-work", // append /{taskId}/stop
    // MCP servers (external tool providers)
    CreateMcpServer = "/mcp/servers",
    UpdateMcpServer = "/mcp/servers",   // append /{id}/update
    DeleteMcpServer = "/mcp/servers",   // append /{id}/delete
    SetMcpServerEnabled = "/mcp/servers", // append /{id}/enabled
    TestMcpServer = "/mcp/servers",     // append /{id}/test
    // Tables (first-class structured-data entity). All writes are POST.
    CreateTable = "/tables",                 // POST /tables
    GenerateTable = "/tables/generate",      // POST /tables/generate (AI)
    UpdateTable = "/tables",                 // append /{id}/update
    DeleteTable = "/tables",                 // append /{id}/delete
    CreateTableRow = "/tables",              // append /{id}/rows
    UpdateTableRow = "/tables",              // append /{id}/rows/{rowId}/update
    DeleteTableRow = "/tables",              // append /{id}/rows/{rowId}/delete
    AggregateTable = "/tables",              // append /{id}/aggregate (read-only)
    RunTableQueryPlan = "/tables",           // append /{id}/query-plan (read-only, multi-step)
    CreateTableField = "/tables",            // append /{id}/fields
    UpdateTableField = "/tables",            // append /{id}/fields/{fieldId}/update
    DeleteTableField = "/tables",            // append /{id}/fields/{fieldId}/delete
    FillTableAIColumn = "/tables",           // append /{id}/fields/{fieldId}/ai-fill
    CreateTableView = "/tables",             // append /{id}/views
    UpdateTableView = "/tables",             // append /{id}/views/{viewId}/update
    DeleteTableView = "/tables",             // append /{id}/views/{viewId}/delete
    // External data sources (read-only connectors). All writes are POST.
    CreateDataSource = "/data-sources",             // POST /data-sources
    UpdateDataSource = "/data-sources",             // append /{id}/update
    DeleteDataSource = "/data-sources",             // append /{id}/delete
    SetDataSourceEnabled = "/data-sources",         // append /{id}/enabled
    TestDataSource = "/data-sources",               // append /{id}/test
    TestDataSourceConfig = "/data-sources/test-connection", // POST (unsaved config)
    AggregateDataSource = "/data-sources",          // append /{id}/aggregate (read-only)
    QueryPlanDataSource = "/data-sources",          // append /{id}/query-plan (read-only, multi-step)
    // API tokens (public API)
    CreateApiToken = "/api-tokens",          // POST /api-tokens
    RevokeApiToken = "/api-tokens",          // append /{id}/revoke
    // Templates (shareable templates)
    CreateMarketplaceTemplate = "/marketplace/templates",  // POST
    DeleteMarketplaceTemplate = "/marketplace/templates",  // append /{id}/delete
    InstallMarketplaceTemplate = "/marketplace/templates", // append /{id}/install
    UpdateBoardPermissions = "/board/updateBoardPermissions",
    SearchUserForBoard = "/board/searchUsers",
    BoardCommentMention = "/board/commentMention",
    BoardCommentDelete = "/board/commentDelete",
    RestoreBoardSnapshot = "/board/restoreBoardSnapshot",
    RecordBoardView = "/board/recordView",
    RestoreDocSnapshot = "/doc/restoreDocSnapshot",
    RecordDocView = "/doc/recordView",
    JoinChannel = "/ch/joinChannel",
    MarkChannelSeen = "/ch/markSeen", // append /{channel_uuid}
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
    CreateInstantMeeting = "/meet/instant",
    CreateGuestLink = "/guest/links",
    SetGuestAccess = "/admin/guest-access",
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
    SetAIWorkspaceTokenBudget = "/admin/ai/workspace-token-budget",
    SetAIUserTokenBudget = "/admin/ai/user-token-budget",
    SetAICodeAnalysisMaxFiles = "/admin/ai/code-analysis-max-files",
    SetAIReasoning = "/admin/ai/reasoning",
    SetAILocalOnly = "/admin/ai/local-only",
    SetAIAgentDelegation = "/admin/ai/agent-delegation",
    // Governed MCP surface: whether external agents may reach this workspace at all,
    // and which tool groups they see.
    SetAIMCPServer = "/admin/ai/mcp-server",
    SetAIPIIRedaction = "/admin/ai/pii-redaction",
    SetAIPIIPatterns = "/admin/ai/pii-patterns",
    SetAIMeetingRecap = "/admin/ai/meeting-recap",
    SetAIMeetingNotesDoc = "/admin/ai/meeting-notes-doc",
    SaveMyTranscript = "/livekit/my-transcript",
    ReportTranscriptionCapability = "/livekit/my-capability",
    SetAIMeetingRecapInstructions = "/admin/ai/meeting-recap/instructions",
    SetAIWebSearch = "/admin/ai/web-search",
    SetAISandbox = "/admin/ai/sandbox",
    SetAISandboxEnabled = "/admin/ai/sandbox/enabled",
    TestAISandbox = "/admin/ai/sandbox/test",
    SetAICodePR = "/admin/ai/code-pr",
    SetAICodePREnabled = "/admin/ai/code-pr/enabled",
    SetAICodePRModel = "/admin/ai/code-pr/model",
    TestAICodePR = "/admin/ai/code-pr/test",
    CreateAIProvider = "/admin/ai/providers",
    TestAIProvider = "/admin/ai/providers/test",
    UpdateAIProvider = "/admin/ai/providers", // append /{providerId} (PATCH)
    DeleteAIProvider = "/admin/ai/providers", // append /{providerId} (DELETE)
    SetAIChatModel = "/admin/ai/chat-model",
    SetAIVisionModel = "/admin/ai/vision-model",
    SetAIEmbeddingModel = "/admin/ai/embedding-model",
    PullAIModel = "/admin/ai/models/pull",
    DeleteAIModel = "/admin/ai/models/delete",
    SetAIMemoryLayer = "/admin/ai/memory-layer",
    SetAITeamReport = "/admin/ai/team-report",
    RunAITeamReport = "/admin/ai/team-report/run",
    SendAITestDigest = "/admin/ai/memory/digest/test",
    SetAINudges = "/admin/ai/nudges",
    SetAICoworker = "/admin/ai/coworker",
    SetAIIssueTriage = "/admin/ai/issue-triage",
    AuthorizeAIModel = "/admin/ai/authorized-models",
    SetAIAuthorizedModelEnabled = "/admin/ai/authorized-models", // append /{id}/enabled
    SetAIAuthorizedModelLimits = "/admin/ai/authorized-models", // append /{id}/limits
    RevokeAIAuthorizedModel = "/admin/ai/authorized-models", // append /{id} (DELETE)
    RunAISelfTest = "/admin/ai/self-test",
    SetAIModelPreference = "/ai/model-preference",
    SetMyAIInstructions = "/ai/instructions",
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
    AIAnalyzeImage = "/ai/analyze-image",
    AIAnalyzeDocument = "/ai/analyze-document",
    AITranslate = "/ai/translate",
    AIAskStream = "/ai/ask/stream",
    AICatchUp = "/ai/catch-up",
    AIDocComplete = "/ai/doc/complete",
    AIDocCompleteStream = "/ai/doc/complete/stream",
    AIExecuteAction = "/ai/action/execute",
    AnalyzeCode = "/ai/code/analyze",
    DraftReleaseNotes = "/ai/release-notes",
    DraftSocialPosts = "/ai/social-posts",
    AISchedulePropose = "/ai/schedule/propose",
    AIScheduleConfirm = "/ai/schedule/confirm",
    AIScheduleReschedule = "/ai/schedule/reschedule",
    AIScheduleRescheduleConfirm = "/ai/schedule/reschedule/confirm",
    AISchedulePrep = "/ai/schedule/prep",
    AIUnifiedSearch = "/ai/search",
    AIUnifiedSearchAnswer = "/ai/search/answer",
    AITranscribe = "/ai/transcribe",
    AIExtractTasks = "/ai/extract-tasks",
    AIExtractTasksCreate = "/ai/extract-tasks/create",
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
    // Two-factor enrolment. Setup is a POST despite reading like a fetch because it MINTS a secret and
    // stores an unconfirmed enrolment; making it a GET would let a prefetch or a repeated back-button
    // rotate the secret out from under a QR code the user is mid-scan.
    BeginTwoFactorSetup = "/auth/2fa/setup",
    ConfirmTwoFactorSetup = "/auth/2fa/confirm",
    DisableTwoFactor = "/auth/2fa/disable",
    // Break-glass reset of ANOTHER member's second factor, admin-only. Distinct from
    // DisableTwoFactor above, which is self-service and demands a code — that check is what makes a
    // stolen session unable to strip the factor, so it cannot be the path used when the phone is the
    // thing that was lost. The server refuses a self-targeted reset for the same reason.
    AdminResetTwoFactor = "/admin/auth/2fa/reset",
    CreateScimToken = "/admin/scim/tokens",  // POST /admin/scim/tokens
    RevokeScimToken = "/admin/scim/tokens",  // append /{id}/revoke

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
    DraftWorkflow = "/workflows/draft",
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