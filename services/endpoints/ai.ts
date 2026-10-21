/**
 * The ai area's API endpoints: what only ai code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum AiGet {
    // Conversations you can come back to. Before these, a chat could not be
    // listed or resumed: the id lived only in React state and the history only
    // in Redis under a 30 minute TTL.
    AIChatSessions = "/ai/sessions",
    MyAgentWork = "/ai/agent-work",
    /**
    * What the AI did FOR YOU, refusals included.
    *
    * The member-scoped twin of GetAIActivity. The server returns the caller's own
    * agent runs and the decisions recorded against them as the actor; the
    * workspace-wide log stays on the admin route. Two constants rather than a
    * flag, because which one a call site uses IS the access decision and it
    * should be visible at the call site.
    */
    MyAIActivity = "/ai/activity",
    /**
    * The same record as a file you can keep. Served as a download carrying the
    * rows, the recipe for recomputing each row's hash, and what that does and
    * does not prove, so it still means something outside this workspace.
    */
    MyAIActivityProof = "/ai/activity/proof",
    AgentWorkForEntity = "/ai/agent-work/for", // append /{entityId}
    GetAgentCard = "/agent-card", // append /{botUserId}; any member may read it
    GetAgentRuns = "/agents", // append /{id}/runs
    GetAgentActivity = "/agents/activity",
    GetAgentInventory = "/agents/inventory",
    MyAIInstructions = "/ai/instructions",
    AIVoiceInput = "/ai/voice-input",
    // Current MCP admission decision, plus the tool groups that actually exist. The
    // available groups come from the server so the UI cannot offer a group with no
    // tools in it, or fail to offer one a new tool introduced.
    GetAIMCPServer = "/admin/ai/mcp-server",
    GetAISystemStats = "/admin/ai/system",
    GetAICodePRScorecard = "/admin/ai/code-pr/scorecard",
    GetAICodePRRuns = "/admin/ai/code-pr/runs",
    GetAIReindexStatus = "/admin/ai/reindex/status",
    GetAIMemoryRebuildStatus = "/admin/ai/memory/rebuild/status",
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
    MyAssistants = "/me/assistants", // outside agents this person has connected
}

export enum AiPost {
    // AI Agent Builder
    CreateAgent = "/agents",
    DraftAgent = "/agents/draft",
    CheckRemoteBrain = "/agents/agui/check",
    RevokeInventoryCredential = "/agents/inventory/credentials", // append /{id}/revoke
    UpdateAgent = "/agents", // append /{id}/update
    DeleteAgent = "/agents", // append /{id}/delete
    SetAgentActive = "/agents", // append /{id}/active
    RunAgent = "/agents", // append /{id}/run
    StopAgentWork = "/ai/agent-work", // append /{taskId}/stop
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
    AIAnalyzeImage = "/ai/analyze-image",
    AIAnalyzeDocument = "/ai/analyze-document",
    AITranslate = "/ai/translate",
    AIAskStream = "/ai/ask/stream",
    AIAskStop = "/ai/ask/stop",
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
}
