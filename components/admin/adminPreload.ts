/**
 * A section's code, fetched ahead: when the pointer or focus reaches its row
 * in the settings nav, so by the time it is opened its cards are usually
 * here. The same modules as the admin page's dynamic() calls, which the
 * bundler loads once. Each import() is a chunk of its own, so nothing here
 * adds to what opening Admin downloads (app/adminFirstLoad.test.ts).
 */
const PRELOAD: Record<string, () => Promise<unknown>[]> = {
  admins: () => [import("@/components/admin/adminCard")],
  teams: () => [import("@/components/admin/teamCard")],
  invitations: () => [import("@/components/admin/invitationCard")],
  "external-users": () => [import("@/components/admin/ExternalUsersCard")],
  settings: () => [
    import("@/components/admin/WorkspaceSettingsCard"),
    import("@/components/admin/DefaultChannelsCard"),
    import("@/components/admin/ReadReceiptsPolicyCard"),
    import("@/components/admin/PushNotificationsCard"),
  ],
  security: () => [import("@/components/admin/GuestAccessCard"), import("@/components/admin/ScimProvisioningCard")],
  permissions: () => [import("@/components/admin/PermissionsCard")],
  "email-settings": () => [import("@/components/admin/EmailProviderCard"), import("@/components/admin/EmailSettingsCard")],
  audit: () => [import("@/components/admin/AdminAuditLog"), import("@/components/admin/RetentionCard")],
  archive: () => [import("@/components/admin/ArchiveCard")],
  import: () => [import("@/components/admin/SlackImportCard"), import("@/components/admin/ImportCard")],
  // AI & agents opens on Overview: its frame and the Overview sub-page come
  // ahead; the other sub-pages load when their tab is chosen.
  "ai-models": () => [import("@/components/admin/ai/AIAgentsSection"), import("@/components/admin/ai/tabs/OverviewTab")],
  workflows: () => [import("@/components/admin/WorkflowsCard")],
  transcription: () => [import("@/components/admin/TranscriptionSettingsCard")],
  integrations: () => [
    import("@/components/admin/SlackBridgeCard"),
    import("@/components/admin/GitHubIntegrationCard"),
    import("@/components/admin/OAuthConfigCard"),
  ],
  apps: () => [import("@/components/admin/AppsCard")],
  webhooks: () => [import("@/components/admin/WebhooksCard")],
  health: () => [import("@/components/admin/UpdatesCard"), import("@/components/admin/SystemCheckCard")],
}

const preloaded = new Set<string>()

/** Starts fetching a section's cards, once. */
export function preloadAdminSection(key: string) {
  if (preloaded.has(key) || !PRELOAD[key]) return
  preloaded.add(key)
  for (const p of PRELOAD[key]()) p.catch(() => preloaded.delete(key))
}

/** The sections with a preload, for the guard. */
export const PRELOADED_SECTIONS = Object.keys(PRELOAD)
