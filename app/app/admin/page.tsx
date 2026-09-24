"use client"

import React, { useEffect, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import TeamsCard from "@/components/admin/teamCard"
import UserCard from "@/components/admin/userCard"
import AdminCard from "@/components/admin/adminCard"
import InvitationCard from "@/components/admin/invitationCard"
import EmailSettingsCard from "@/components/admin/EmailSettingsCard"
import WebhooksCard from "@/components/admin/WebhooksCard"
import GitHubIntegrationCard from "@/components/admin/GitHubIntegrationCard"
import OAuthConfigCard from "@/components/admin/OAuthConfigCard"
import ArchiveCard from "@/components/admin/ArchiveCard"
import ExternalUsersCard from "@/components/admin/ExternalUsersCard"
import SlackImportCard from "@/components/admin/SlackImportCard"
import ImportCard from "@/components/admin/ImportCard"
import AIModelsCard from "@/components/admin/AIModelsCard"
import AgentDelegationCard from "@/components/admin/AgentDelegationCard"
import GovernanceDrillCard from "@/components/admin/GovernanceDrillCard"
import MCPServerCard from "@/components/admin/MCPServerCard"
import AIActivityCard from "@/components/admin/AIActivityCard"
import AppsCard from "@/components/admin/AppsCard"
import WorkspaceSettingsCard from "@/components/admin/WorkspaceSettingsCard"
import GuestAccessCard from "@/components/admin/GuestAccessCard"
import ScimProvisioningCard from "@/components/admin/ScimProvisioningCard"
import PermissionsCard from "@/components/admin/PermissionsCard"
import TranscriptionSettingsCard from "@/components/admin/TranscriptionSettingsCard"
import WorkflowsCard from "@/components/admin/WorkflowsCard"
import AdminAuditLog from "@/components/admin/AdminAuditLog"
import RetentionCard from "@/components/admin/RetentionCard"
import PushNotificationsCard from "@/components/admin/PushNotificationsCard"
import SystemCheckCard from "@/components/admin/SystemCheckCard"
import { Shield, Users, ShieldAlert, Mail, Settings, GitBranch, Mic, Activity } from "@/lib/icons"
import { Users2, Webhook, Archive, UserX, Database, Sparkles, Plug, SlidersHorizontal, Zap, KeyRound, Lock, ScrollText } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { useMedia } from "@/context/MediaQueryContext"
import { FEATURE_AI, FEATURE_CALLS, useFeatureState } from "@/hooks/useClientConfig"

/**
 * Vertical rhythm between top-level cards on a tab that holds more than one.
 *
 * A named constant rather than the literal repeated three times, so the tabs cannot drift apart and
 * so adminLayout.test.ts can assert that every multi-card tab actually uses it. The AI Models tab
 * previously had no wrapper at all and its cards rendered flush against each other; that is not
 * detectable by reading one tab in isolation, which is why the rule is expressed once and checked.
 */
const ADMIN_SECTION_STACK = "space-y-8"

type TabDef = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// GROUPED, IN A SIDE MENU. This was seventeen tabs in one strip that scrolled
// sideways: on a laptop most sat off-screen behind a fade, and related ones were
// scattered (Users, Admins, Teams, Invitations and External users were five
// tabs apart). Admin consoles people already know (Slack, Linear, GitHub) group
// settings under a few headings in a column, so an admin scans a short list for
// the right heading instead of scrolling a strip for the right word.
type TabGroup = { label: string; tabs: TabDef[] }

const TAB_GROUPS: TabGroup[] = [
  {
    label: "People",
    tabs: [
      { value: "users", label: "Users", icon: Users2 },
      { value: "admins", label: "Admins", icon: ShieldAlert },
      { value: "teams", label: "Teams", icon: Users },
      { value: "invitations", label: "Invitations", icon: Mail },
      { value: "external-users", label: "External users", icon: UserX },
    ],
  },
  {
    label: "Workspace",
    tabs: [
      { value: "settings", label: "General", icon: SlidersHorizontal },
      { value: "security", label: "Security", icon: Lock },
      { value: "permissions", label: "Permissions", icon: KeyRound },
      { value: "email-settings", label: "Email", icon: Settings },
      { value: "audit", label: "Audit log", icon: ScrollText },
      { value: "archive", label: "Archive", icon: Archive },
      // ONE IMPORT TAB, NOT TWO. "Slack Import" and "Import" sat next to each other
      // with the same icon and no way to tell which held what, so an admin looking
      // for their migration had to open both and read the cards. They are one
      // question — how do I get my existing work in — and now one place.
      { value: "import", label: "Import", icon: Database },
    ],
  },
  {
    label: "AI and automation",
    tabs: [
      { value: "ai-models", label: "AI & agents", icon: Sparkles },
      { value: "workflows", label: "Workflows", icon: Zap },
      { value: "transcription", label: "Transcription", icon: Mic },
    ],
  },
  {
    label: "Connections",
    tabs: [
      { value: "integrations", label: "Integrations", icon: GitBranch },
      { value: "apps", label: "Apps", icon: Plug },
      { value: "webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  {
    label: "System",
    tabs: [{ value: "health", label: "Health", icon: Activity }],
  },
]

const TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs)

const AdminPage = () => {
  const searchParams = useSearchParams()
  const {isDesktop } = useMedia();
  const { toast } = useToast()
  // Two tabs exist only when the server has the subsystem behind them, and the
  // page cannot know that until the config request answers. It used to read the
  // two-state hook, which reports "no" while that request is in flight, and pick
  // its tab ONCE from that answer: a cold load of /app/admin?tab=ai-models, which
  // is what every link to the drill card is, therefore opened on Teams and stayed
  // there. The setup checklist sent a new admin to see an agent refused and
  // landed them on a list of teams.
  const aiState = useFeatureState(FEATURE_AI)
  const callsState = useFeatureState(FEATURE_CALLS)
  const aiAvailable = aiState === "available"
  const callsAvailable = callsState === "available"
  const visibleTabs = TABS.filter((tab) => {
    if (tab.value === "ai-models") return aiAvailable
    if (tab.value === "transcription") return callsAvailable
    return true
  })
  // ?tab=slack-import still resolves, because links to it exist in the wild: the
  // onboarding step pointed there, and so did anything an admin bookmarked. A
  // merged tab that broke its own old address would be a worse fix than the
  // confusion it removed.
  const TAB_ALIASES: Record<string, string> = { "slack-import": "import" }
  const rawTab = searchParams.get("tab") || "users"
  // The audit log moved out of General into its own section. Links to
  // ?tab=settings#audit-log, the governance drill's among them, still land on it.
  const hash = typeof window !== "undefined" ? window.location.hash : ""
  const requestedTab =
    rawTab === "settings" && hash === "#audit-log" ? "audit" : TAB_ALIASES[rawTab] ?? rawTab
  const requestedTabVisible = visibleTabs.some((tab) => tab.value === requestedTab)
  // The URL asked for a gated tab and the server has not said yet whether it
  // exists. Falling back to Teams here would be answering before the question
  // was asked, and the fallback would stick.
  const gateForRequested =
    requestedTab === "ai-models" ? aiState : requestedTab === "transcription" ? callsState : "available"
  const waitingOnRequestedTab = gateForRequested === "unknown"
  const [activeTab, setActiveTab] = useState(requestedTabVisible ? requestedTab : "users")
  useEffect(() => {
    // Honour the URL the moment its tab becomes real. After that the user owns
    // the selection: this only re-runs when the answer itself changes.
    if (requestedTabVisible) setActiveTab(requestedTab)
  }, [requestedTab, requestedTabVisible])
  const processed = useRef(false)
  // Groups with at least one tab this server offers, in menu order.
  const visibleGroups = TAB_GROUPS.map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => visibleTabs.some((v) => v.value === t.value)),
  })).filter((g) => g.tabs.length > 0)

  // Choosing a section updates the address, so a refresh or Back returns here.
  // replaceState rather than the router: the page is already showing the tab.
  const chooseTab = (value: string) => {
    setActiveTab(value)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", value)
      url.hash = ""
      window.history.replaceState(window.history.state, "", url.toString())
    }
  }

  useEffect(() => {
    if (processed.current) return
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success === "1") {
      processed.current = true
      toast({ title: "GitHub Connected", description: "Your GitHub account has been linked successfully." })
    } else if (error) {
      processed.current = true
      const messages: Record<string, string> = {
        no_code: "No authorization code received from GitHub.",
        unauthorized: "You must be logged in as an admin to connect GitHub.",
        exchange_failed: "Failed to exchange authorization code. Please try again.",
      }
      toast({ title: "Connection Failed", description: messages[error] || "An unexpected error occurred.", variant: "destructive" })
    }
    if (processed.current && typeof window !== "undefined") {
      const cleanUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, document.title, cleanUrl)
    }
  }, [searchParams, toast])

  return (
    <main
      id="main-content"
      className="flex flex-col h-full min-h-0 bg-background"
    >
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-card/30 backdrop-blur-md">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          {isDesktop && <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Admin Dashboard
            </h1>
          </div>}
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            People, workspace settings, AI and connections, in one place.
          </p>
        </div>
      </header>

      {/* Content */}
      {waitingOnRequestedTab ? (
        <div role="status" aria-label="Loading admin settings" className="flex-1 min-h-0" />
      ) : (
      <Tabs
        value={activeTab}
        onValueChange={chooseTab}
        orientation={isDesktop ? "vertical" : "horizontal"}
        className="flex-1 min-h-0 flex flex-col"
      >
        {/* Per-tab content. THIS IS THE ONLY SCROLL CONTAINER ON THE PAGE.
            
            It used to be "each card owns its own internal scrolling", which works for a tab holding
            exactly one card and breaks silently the moment a second is added. That had already
            happened twice. On the AI Models tab, AIModelsCard was h-full with its own
            overflow-y-auto, so it occupied the entire visible region and scrolled inside itself,
            while AgentDelegationCard, MCPServerCard and AIActivityCard were appended BELOW it —
            reachable only by scrolling the app shell's scroller (app/app/LayoutContent.tsx). Two
            scrollbars with different meanings on one screen: the inner one moved the AI settings, the
            outer one moved the page and took the header and the tab strip off-screen with it. Scroll
            far enough and the inner scrollport was itself partly off-screen, so content stayed
            clipped with no reachable scrollbar. The integrations tab had the same latent fault, since
            GitHubIntegrationCard is also a full-height internal scroller with a sibling beneath it.
            
            Scrolling here instead of inside the cards fixes all of it at once, and it is the reason
            the header and tab strip now stay put — which is what "Sticky tab strip" above always
            claimed. Cards must therefore NOT set h-full or their own overflow-y-auto; they size to
            their content and this box scrolls. adminLayout.test.ts holds that line. */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="mx-auto w-full max-w-6xl lg:flex lg:items-start lg:gap-8">
              {isDesktop ? (
                // Sticky within the one scroller rather than a second scroller of
                // its own: the whole menu fits, and one scrollbar keeps one meaning.
                <TabsList
                  aria-label="Admin sections"
                  className="sticky top-0 flex h-auto w-52 shrink-0 flex-col items-stretch gap-0.5 rounded-none bg-transparent p-0"
                >
                  {visibleGroups.map((group, gi) => (
                    <React.Fragment key={group.label}>
                      <p
                        role="presentation"
                        className={cn(
                          "px-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80",
                          gi === 0 ? "pt-0" : "pt-5",
                        )}
                      >
                        {group.label}
                      </p>
                      {group.tabs.map(({ value, label, icon: Icon }) => (
                        <TabsTrigger
                          key={value}
                          value={value}
                          className={cn(
                            "justify-start gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium",
                            "text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors",
                            "data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {label}
                        </TabsTrigger>
                      ))}
                    </React.Fragment>
                  ))}
                </TabsList>
              ) : (
                // A phone gets the platform's own picker, grouped the same way:
                // seventeen tabs do not fit a strip at this width, and a native
                // select is the control every phone already knows.
                <label className="mb-5 block">
                  <span className="sr-only">Admin section</span>
                  <select
                    value={activeTab}
                    onChange={(e) => chooseTab(e.target.value)}
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-medium"
                  >
                    {visibleGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.tabs.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              )}
              <div className="min-w-0 flex-1">
              <TabsContent value="teams" className="mt-0 outline-none">
                <TeamsCard />
              </TabsContent>
              <TabsContent value="users" className="mt-0 outline-none">
                <UserCard />
              </TabsContent>
              <TabsContent value="admins" className="mt-0 outline-none">
                <AdminCard />
              </TabsContent>
              <TabsContent value="invitations" className="mt-0 outline-none">
                <InvitationCard />
              </TabsContent>
              <TabsContent value="email-settings" className="mt-0 outline-none">
                <EmailSettingsCard />
              </TabsContent>
              {/* A tab holding more than one card wraps them in ADMIN_SECTION_STACK.
                  
                  One shared value rather than a per-tab judgement, and space-y-8 rather than the
                  space-y-6 this used to be, because 8 is what AIModelsCard already puts between its
                  OWN sections. At 6 the gap between two top-level cards was tighter than the gap
                  between subsections inside one of them, which reads as though the cards belong
                  together. Separation has to grow with level, not shrink. */}
              <TabsContent value="settings" className="mt-0 outline-none">
                {/* General was six unrelated cards. Access and provisioning moved to
                    Security, and the audit log with its retention policy to Audit
                    log, so each section answers one question. */}
                <div className={ADMIN_SECTION_STACK}>
                  <WorkspaceSettingsCard />
                  <PushNotificationsCard />
                </div>
              </TabsContent>
              <TabsContent value="security" className="mt-0 outline-none">
                {/* Who may get in from outside, then how members are provisioned. */}
                <div className={ADMIN_SECTION_STACK}>
                  <GuestAccessCard />
                  <ScimProvisioningCard />
                </div>
              </TabsContent>
              <TabsContent value="audit" className="mt-0 outline-none">
                {/* Retention beside the log, because it is the policy that explains
                    why an old entry has no content. */}
                <div className={ADMIN_SECTION_STACK}>
                  <AdminAuditLog />
                  <RetentionCard />
                </div>
              </TabsContent>
              {/* Its own tab rather than a card under Settings: this is a diagnostic, not a
                  setting, and the Settings tab's order is a deliberate progression that an
                  unrelated card in the middle of it would break. */}
              <TabsContent value="health" className="mt-0 outline-none">
                <SystemCheckCard />
              </TabsContent>
              <TabsContent value="permissions" className="mt-0 outline-none">
                <PermissionsCard />
              </TabsContent>
              {callsAvailable && (
              <TabsContent value="transcription" className="mt-0 outline-none">
                <TranscriptionSettingsCard />
              </TabsContent>
              )}
              {/* These four had NO wrapper at all, so they rendered flush: "Agent collaboration"
                  ended and "External agent access" began against it with only a hairline between,
                  and the eye read them as one section. The two tabs above were wrapped; this one was
                  missed when cards were appended to it, which is exactly the kind of thing that
                  survives review because nothing about it looks wrong in the diff. */}
              {aiAvailable && (
              <TabsContent value="ai-models" className="mt-0 outline-none">
                <div className={ADMIN_SECTION_STACK}>
                  <AIModelsCard />
                  <AgentDelegationCard />
                  {/* Straight after delegation, because delegation says what an agent MAY
                      do and this proves the limit actually holds on this install. */}
                  <GovernanceDrillCard />
                  {/* Beside agent collaboration because they are the same kind of decision:
                      who may cause an agent to act here. Delegation governs agents inside
                      the workspace; this governs clients outside it. */}
                  <MCPServerCard />
                  <AIActivityCard />
                </div>
              </TabsContent>
              )}
              <TabsContent value="webhooks" className="mt-0 outline-none">
                <WebhooksCard />
              </TabsContent>
              <TabsContent value="workflows" className="mt-0 outline-none">
                <WorkflowsCard />
              </TabsContent>
              <TabsContent value="apps" className="mt-0 outline-none">
                <AppsCard />
              </TabsContent>
              <TabsContent value="integrations" className="mt-0 outline-none">
                <div className={ADMIN_SECTION_STACK}>
                  <GitHubIntegrationCard />
                  <OAuthConfigCard />
                </div>
              </TabsContent>
              <TabsContent value="external-users" className="mt-0 outline-none">
                <ExternalUsersCard />
              </TabsContent>
              <TabsContent value="archive" className="mt-0 outline-none">
                <ArchiveCard />
              </TabsContent>
              <TabsContent value="import" className="mt-0 outline-none">
                <div className={ADMIN_SECTION_STACK}>
                  {/* Slack first: chat history is the migration most teams arrive
                      with, and the other providers carry projects and tasks. */}
                  <SlackImportCard />
                  <ImportCard />
                </div>
              </TabsContent>
              </div>
            </div>
          </div>
        </div>
      </Tabs>
      )}
    </main>
  )
}

export default AdminPage
