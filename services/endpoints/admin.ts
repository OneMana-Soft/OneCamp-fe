/**
 * The admin area's API endpoints: what only admin code uses (split from
 * services/endPoints.ts on 18 Oct 2026, platform P-SPEED). A route loads only its
 * own area's. An endpoint a second area comes to use moves to services/endPoints.ts
 * (app/endpointsShared.test.ts); scripts/endpoints/areas.mjs says which file is whose.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values */

export enum AdminGet {
    // The agents an API token can be bound to: only the API tokens card reads it
    // on the public AI-free web (the agents' own pages are the AI edition's).
    GetAgents = "/agents",
    // API tokens (public API)
    GetApiTokens = "/api-tokens",
    GetApiTokenScopes = "/api-tokens/scopes",
    GetAdminTeamList = "/admin/getAllTeamList",
    GetAdminUserList = "/admin/getAllUsersList",
    GetAdminAdminList = "/admin/getAllAdminUsers",
    GetAdminInvitationList = "/admin/getAllInvitations",
    GetEmailConfig = "/admin/config/email",
    // Per-user connectors (Gmail, Calendar, GitHub) the AI can read/act through.
    Connectors = "/connectors",
    // App platform (admin)
    GetApps = "/admin/apps",
    GetApp = "/admin/apps", // append /{appId}
    GetAppOAuthURL = "/admin/apps", // append /{appId}/oauth-url
    GetMarketplace = "/admin/marketplace",
    MarketplaceTemplates = "/marketplace/templates", // append ?kind= or /{id}
    // Login OAuth credentials (admin)
    GetOAuthConfig = "/admin/auth/oauth-config",
    // Your OWN second factor. Scoped to the caller — none of the 2FA endpoints takes a user id, so
    // there is nothing to pass and no way to read another member's factor.
    GetTwoFactorStatus = "/auth/2fa",
    // SCIM provisioning credentials (admin). These authenticate the customer's identity provider
    // against /scim/v2, so they belong to the WORKSPACE rather than to whoever created them — which is
    // why they are managed here and not in a member's own settings.
    GetScimTokens = "/admin/scim/tokens",
    // Webhooks (Admin)
    GetAllWebhooks = "/admin/webhooks",
    GetWebhookLogs = "/admin/webhooks", // append /{webhookId}/logs
    GetWebhookEventTypes = "/admin/webhooks/event-types",
    // Workflows (capability-gated: admins always, members when allowed)
    GetAllWorkflows = "/workflows",
    // GitHub (Admin)
    GetGitHubAuthUrl = "/admin/github/auth-url",
    GetGitHubConfig = "/admin/github/config",
    GetGitHubStatus = "/admin/github/status",
    GetGitHubRateLimit = "/admin/github/rate-limit",
    GetGitHubWebhookHealth = "/admin/github/webhook-health",
    GetGitHubRepos = "/admin/github/repos",
    GetGitHubImportJob = "/admin/github/import-job", // append /{jobId}
    // External Users (Admin)
    GetExternalUsers = "/admin/external-users",
    // Archive (Admin)
    GetArchivePolicies = "/admin/archive/policies",
    // Slack Import (Admin)
    GetSlackImportJobs = "/admin/import/slack/jobs",
    GetSlackImportErrors = "/admin/import/slack/jobs", // append /{jobId}/errors
}

export enum AdminPost {
    // API tokens (public API)
    CreateApiToken = "/api-tokens", // POST /api-tokens
    RevokeApiToken = "/api-tokens", // append /{id}/revoke
    // Templates (shareable templates)
    CreateMarketplaceTemplate = "/marketplace/templates", // POST
    DeleteMarketplaceTemplate = "/marketplace/templates", // append /{id}/delete
    InstallMarketplaceTemplate = "/marketplace/templates", // append /{id}/install
    ResendInvitation = "/admin/resendInvitation",
    DeleteEmailLogo = "/admin/config/email/logo",
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
    CreateScimToken = "/admin/scim/tokens", // POST /admin/scim/tokens
    RevokeScimToken = "/admin/scim/tokens", // append /{id}/revoke
    UpdateWebhook = "/admin/webhooks", // append /{webhookId} — use PUT
    RegenerateWebhookToken = "/admin/webhooks", // append /{webhookId}/regenerate-token
    RegenerateWebhookSecret = "/admin/webhooks", // append /{webhookId}/regenerate-secret
    TestWebhook = "/admin/webhooks", // append /{webhookId}/test
    // Workflows (capability-gated: admins always, members when allowed)
    CreateWorkflow = "/workflows",
    DraftWorkflow = "/workflows/draft",
    UpdateWorkflow = "/workflows", // append /{id} — use PUT
    DeleteWorkflow = "/workflows", // append /{id} — use DELETE
    SetWorkflowActive = "/workflows", // append /{id}/active
    // Member-managed invitation create (capability-gated)
    CreateInvitation = "/invitations",
    UpdateGitHubConfig = "/admin/github/config",
    // External Users (Admin)
    UnlinkExternalUser = "/admin/external-users/unlink",
    // Slack Import (Admin)
    SlackImportUpload = "/admin/import/slack/upload",
    SlackImportAPIRead = "/admin/import/slack/api-read",
    SlackImportPlan = "/admin/import/slack/plan", // append /{jobId}
    SlackImportRun = "/admin/import/slack/run", // append /{jobId}
    SlackImportCancel = "/admin/import/slack/cancel", // append /{jobId}
    SlackImportRollback = "/admin/import/slack/rollback", // append /{jobId}
}
