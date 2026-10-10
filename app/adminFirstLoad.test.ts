import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import path from "path"

// What opening Admin downloads. The page imported all thirty-six of its cards
// up front, the AI tab's 2,761-line models card and the GitHub, apps, webhooks
// and MCP cards among them, so opening Members (the default section) fetched
// 1.1 MB of script in twelve files for one list. Each section's cards now load
// when the section is first opened, or when the pointer or focus reaches it in
// the menu; only Members' own card comes with the page.
//
// This walks the page's static imports (a dynamic import() starts a chunk of
// its own, so it isn't followed) and fails, naming the chain, when a card that
// belongs to another section is reached.

const ROOT = path.resolve(__dirname, "..")
const ENTRY = "app/app/admin/page.tsx"
const OTHER_SECTIONS = [
  "AIModelsCard", "ModelRoutingCard", "AgentDelegationCard", "AgentInventoryCard", "GovernanceDrillCard", "MCPServerCard", "AIActivityCard",
  "GitHubIntegrationCard", "SlackBridgeCard", "OAuthConfigCard", "AppsCard", "MarketplaceCard", "WebhooksCard", "WorkflowsCard",
  "TranscriptionSettingsCard", "AdminAuditLog", "RetentionCard", "ArchiveCard", "SlackImportCard", "ImportCard",
  "WorkspaceSettingsCard", "DefaultChannelsCard", "ReadReceiptsPolicyCard", "PushNotificationsCard", "GuestAccessCard",
  "ScimProvisioningCard", "PermissionsCard", "EmailSettingsCard", "EmailProviderCard", "teamCard", "adminCard",
  "invitationCard", "ExternalUsersCard", "SystemCheckCard", "UpdatesCard",
]

const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(path.join(ROOT, c)) && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

function staticReach(entry: string): Map<string, string | null> {
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const next = resolve(m[1], file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return parent
}

describe("opening Admin", () => {
  it("brings only the default section's card with the page", () => {
    const reach = staticReach(ENTRY)
    const chain = (f: string | null) => {
      const out: string[] = []
      while (f) {
        out.push(f)
        f = reach.get(f) ?? null
      }
      return out.join(" <- ")
    }
    const reached = [...reach.keys()].filter((f) => OTHER_SECTIONS.some((c) => f === `components/admin/${c}.tsx`))
    expect(reached.map(chain)).toEqual([])
    // Members is the section the page opens on, so its card comes with it.
    expect(reach.has("components/admin/userCard.tsx")).toBe(true)
  })

  it("would see one: the walk follows a static import", () => {
    expect(staticReach("components/admin/userCard.tsx").has("components/admin/AdminUserList.tsx")).toBe(true)
  })
})
