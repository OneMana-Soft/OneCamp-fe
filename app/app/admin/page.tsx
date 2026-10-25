"use client"

import React, { useEffect, useRef } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import UserCard from "@/components/admin/userCard"
import { SectionJumpMenu } from "@/components/admin/SectionJumps"
import { AdminCardSkeleton } from "@/components/admin/AdminCardSkeleton"
import { PeopleTabSkeleton } from "@/components/admin/PeopleFrame"
import { AdminScrollContext } from "@/components/admin/adminScroll"
import dynamic from "next/dynamic"
import { PageFrame, PageFrameHeader } from "@/components/ui/settingsPage"
import { OnThisPageRail } from "@/components/ui/OnThisPage"
import { SettingsPhoneList } from "@/components/admin/SettingsPhoneList"
import { useJumpFlash } from "@/hooks/useJumpFlash"
import { SETTINGS_GROUP_LABEL, SETTINGS_PLACES, adminPlace, normaliseAdminTab, type SettingsGroupKey } from "@/lib/adminSections"
import { useMedia } from "@/context/MediaQueryContext"
import { FEATURE_AI, FEATURE_CALLS, useFeatureState } from "@/hooks/useClientConfig"
import { useImportReviewPlace } from "@/lib/importReviews"

// The people tabs wait in their own frame's shape (header, toolbar, six rows),
// so nothing moves when the card's code arrives and again when its data does;
// they waited as a generic card of four rows and a button bar.
// Every section but Members (where the page opens) loads its cards when it is
// first opened, or ahead of that when the pointer or focus reaches it in the
// settings nav (components/admin/adminPreload). All thirty-six cards used to come with the page, so
// opening Members fetched 1.1 MB of script for one list (app/adminFirstLoad.test.ts).
const TeamsCard = dynamic(() => import("@/components/admin/teamCard"), { loading: () => <PeopleTabSkeleton leading="tile" /> })
const AdminCard = dynamic(() => import("@/components/admin/adminCard"), { loading: () => <PeopleTabSkeleton /> })
const InvitationCard = dynamic(() => import("@/components/admin/invitationCard"), { loading: () => <PeopleTabSkeleton leading="tile" /> })
const EmailSettingsCard = dynamic(() => import("@/components/admin/EmailSettingsCard"), { loading: AdminCardSkeleton })
const EmailProviderCard = dynamic(() => import("@/components/admin/EmailProviderCard"), { loading: AdminCardSkeleton })
const WebhooksCard = dynamic(() => import("@/components/admin/WebhooksCard"), { loading: AdminCardSkeleton })
const GitHubIntegrationCard = dynamic(() => import("@/components/admin/GitHubIntegrationCard"), { loading: AdminCardSkeleton })
const OAuthConfigCard = dynamic(() => import("@/components/admin/OAuthConfigCard"), { loading: AdminCardSkeleton })
const ArchiveCard = dynamic(() => import("@/components/admin/ArchiveCard"), { loading: AdminCardSkeleton })
const DocHistoryCard = dynamic(() => import("@/components/admin/DocHistoryCard"), { loading: AdminCardSkeleton })
const ExternalUsersCard = dynamic(() => import("@/components/admin/ExternalUsersCard"), { loading: () => <PeopleTabSkeleton hasAction={false} /> })
const SlackImportCard = dynamic(() => import("@/components/admin/SlackImportCard"), { loading: AdminCardSkeleton })
const SlackBridgeCard = dynamic(() => import("@/components/admin/SlackBridgeCard"), { loading: AdminCardSkeleton })
const ImportCard = dynamic(() => import("@/components/admin/ImportCard"), { loading: AdminCardSkeleton })
// The review of who earlier imports added: its code is asked for as the page
// opens, with its read (useImportReviewPlace), so the Import tab draws once.
const loadImportReviewCard = () => import("@/components/admin/ImportReviewCard")
const ImportReviewCard = dynamic(loadImportReviewCard, { loading: () => null })
const ExportCard = dynamic(() => import("@/components/admin/ExportCard"), { loading: AdminCardSkeleton })
// AI & agents: one section of six sub-pages, each a chunk of its own.
const AIAgentsSection = dynamic(() => import("@/components/admin/ai/AIAgentsSection"), { loading: AdminCardSkeleton })
const AppsCard = dynamic(() => import("@/components/admin/AppsCard"), { loading: AdminCardSkeleton })
const WorkspaceSettingsCard = dynamic(() => import("@/components/admin/WorkspaceSettingsCard"), { loading: AdminCardSkeleton })
const GuestAccessCard = dynamic(() => import("@/components/admin/GuestAccessCard"), { loading: AdminCardSkeleton })
const ReadReceiptsPolicyCard = dynamic(() => import("@/components/admin/ReadReceiptsPolicyCard"), { loading: AdminCardSkeleton })
const DefaultChannelsCard = dynamic(() => import("@/components/admin/DefaultChannelsCard"), { loading: AdminCardSkeleton })
const ScimProvisioningCard = dynamic(() => import("@/components/admin/ScimProvisioningCard"), { loading: AdminCardSkeleton })
const PermissionsCard = dynamic(() => import("@/components/admin/PermissionsCard"), { loading: AdminCardSkeleton })
const ProjectsPermissionsCard = dynamic(() => import("@/components/admin/ProjectsPermissionsCard"), { loading: AdminCardSkeleton })
const TranscriptionSettingsCard = dynamic(() => import("@/components/admin/TranscriptionSettingsCard"), { loading: AdminCardSkeleton })
const WorkflowsCard = dynamic(() => import("@/components/admin/WorkflowsCard"), { loading: AdminCardSkeleton })
const AdminAuditLog = dynamic(() => import("@/components/admin/AdminAuditLog"), { loading: AdminCardSkeleton })
const RetentionCard = dynamic(() => import("@/components/admin/RetentionCard"), { loading: AdminCardSkeleton })
const PushNotificationsCard = dynamic(() => import("@/components/admin/PushNotificationsCard"), { loading: AdminCardSkeleton })
const SystemCheckCard = dynamic(() => import("@/components/admin/SystemCheckCard"), { loading: AdminCardSkeleton })
const UpdatesCard = dynamic(() => import("@/components/admin/UpdatesCard"), { loading: AdminCardSkeleton })

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
}

// THE SECTIONS LIVE IN THE SETTINGS NAV (design v3, admin §1.1). Entering
// Admin swaps the sidebar for the settings nav, grouped as lib/adminSections
// lists them, so there is no menu in the page: the 208px it took goes back to
// the content. The page shows the section its `?tab=` names, with that
// section's own header (its group's hue on one tile, its name as the h1, its
// one line). The order and groups below are the nav's, read from one list.
type TabGroup = { key: SettingsGroupKey; label: string; tabs: TabDef[] }

const TAB_GROUPS: TabGroup[] = (["workspace", "ai", "connections", "records", "system"] as const).map((key) => ({
  key,
  label: SETTINGS_GROUP_LABEL[key],
  tabs: SETTINGS_PLACES.filter((p) => p.group === key && p.href.startsWith("/app/admin?tab=")).map((p) => ({ value: p.key, label: p.label })),
}))

const TABS: TabDef[] = TAB_GROUPS.flatMap((g) => g.tabs)

// AI & agents has sub-pages under a tab bar in place of an on-this-page rail
// (components/admin/ai/aiTabs, where its old jump ids map to them).

/** The jumps of a long section: its cards, from the settings map, once each. */
function jumpsFor(tab: string): { id: string; label: string }[] | null {
  // The tab bar under AI & agents' header is its navigation.
  if (tab === "ai-models") return null
  if (tab !== "security" && tab !== "integrations" && tab !== "settings") return null
  const seen = new Set<string>()
  const out: { id: string; label: string }[] = []
  for (const c of adminPlace(tab)?.cards ?? []) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    out.push({ id: c.id, label: c.title })
  }
  return out.length >= 3 ? out : null
}

const AdminPage = () => {
  const searchParams = useSearchParams()
  const { isMobile } = useMedia()
  const { toast } = useToast()
  // Two sections exist only when the server has the subsystem behind them,
  // and the page cannot know that until the config request answers. A cold
  // load of /app/admin?tab=ai-models, which is what every link to the drill
  // card is, used to open on Teams and stay there.
  // Where the Import tab draws the review of who earlier imports added, asked
  // as the page opens so that tab is settled before it draws.
  const reviewPlace = useImportReviewPlace(loadImportReviewCard)
  const aiState = useFeatureState(FEATURE_AI)
  const callsState = useFeatureState(FEATURE_CALLS)
  const aiAvailable = aiState === "available"
  const callsAvailable = callsState === "available"
  const visibleTabs = TABS.filter((tab) => {
    if (tab.value === "ai-models") return aiAvailable
    if (tab.value === "transcription") return callsAvailable
    return true
  })
  // ?tab=slack-import still resolves, because links to it exist in the wild,
  // and ?tab=settings#audit-log lands on the audit log, which moved out of
  // General ("slack-import": "import" and the audit alias live in
  // lib/adminSections, beside the sections).
  const rawTab = searchParams.get("tab")
  const hash = typeof window !== "undefined" ? window.location.hash : ""
  const requestedTab = normaliseAdminTab(rawTab, hash)
  // On a phone with no section asked for, the page is the list of sections.
  const phoneList = isMobile && !rawTab
  const requestedTabVisible = visibleTabs.some((tab) => tab.value === requestedTab)
  // The URL asked for a gated section and the server has not said yet whether
  // it exists: hold the section's skeleton rather than answer early.
  const gateForRequested =
    requestedTab === "ai-models" ? aiState : requestedTab === "transcription" ? callsState : "available"
  const waitingOnRequestedTab = gateForRequested === "unknown"
  const activeTab = requestedTabVisible ? requestedTab : "users"
  const processed = useRef(false)
  // The page's one scroller, for lists that draw only the rows in view.
  const scrollRef = useRef<HTMLDivElement>(null)
  const shownTab = waitingOnRequestedTab ? requestedTab : activeTab
  const place = adminPlace(shownTab) ?? adminPlace("users")!
  const jumps = waitingOnRequestedTab ? null : jumpsFor(shownTab)
  // A search hit or a deep link with a #card scrolls to it and flashes it.
  useJumpFlash(shownTab)
  // The section's own scroll starts at its top.
  useEffect(() => {
    const el = scrollRef.current
    if (!window.location.hash && el) el.scrollTop = 0
  }, [shownTab])

  useEffect(() => {
    if (processed.current) return
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success === "1") {
      processed.current = true
      toast({ title: "GitHub connected", description: "Your GitHub account is linked.", tone: "success" })
    } else if (error) {
      processed.current = true
      const messages: Record<string, string> = {
        no_code: "GitHub sent no authorisation code. Try connecting again.",
        unauthorized: "Only a workspace admin can connect GitHub.",
        exchange_failed: "GitHub didn't accept the authorisation code. Try connecting again.",
      }
      toast({ title: "Couldn't connect GitHub", description: messages[error] || "Something went wrong on the way back from GitHub.", variant: "destructive" })
    }
    if (processed.current && typeof window !== "undefined") {
      const cleanUrl = window.location.pathname + `?tab=${shownTab}` + window.location.hash
      window.history.replaceState({}, document.title, cleanUrl)
    }
  }, [searchParams, toast, shownTab])

  if (phoneList) return <SettingsPhoneList />

  return (
    <main
      id="main-content"
      className="flex flex-col h-full min-h-0 bg-background"
    >
      <Tabs
        value={shownTab}
        className="flex-1 min-h-0 flex flex-col"
      >
        {/* THIS IS THE ONLY SCROLL CONTAINER ON THE PAGE. Cards must not set
            h-full or their own overflow-y-auto; they size to their content and
            this box scrolls (adminLayout.test.ts). Two scrollbars with
            different meanings on one screen is the bug this replaced. */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <AdminScrollContext.Provider value={scrollRef}>
          <div className="flex justify-center gap-10 min-[1280px]:pr-6">
            <PageFrame key={shownTab} wide={place.wide} className="min-w-0 flex-1 min-[1280px]:mx-0">
              <PageFrameHeader
                hue={place.hue}
                icon={place.icon}
                title={place.label}
                description={place.description}
                actions={jumps ? <SectionJumpMenu jumps={jumps} className="min-[1280px]:hidden" /> : undefined}
              />
              <div className="min-w-0">
              {waitingOnRequestedTab ? (
                <AdminCardSkeleton />
              ) : (
              <>
              <TabsContent value="teams" className="mt-0">
                <TeamsCard />
              </TabsContent>
              <TabsContent value="users" className="mt-0">
                <UserCard />
              </TabsContent>
              <TabsContent value="admins" className="mt-0">
                <AdminCard />
              </TabsContent>
              <TabsContent value="invitations" className="mt-0">
                <InvitationCard />
              </TabsContent>
              <TabsContent value="email-settings" className="mt-0">
                {/* The key first: nothing below it sends until it is set. */}
                <div className={ADMIN_SECTION_STACK}>
                  <EmailProviderCard />
                  <EmailSettingsCard />
                </div>
              </TabsContent>
              {/* A tab holding more than one card wraps them in ADMIN_SECTION_STACK.
                  
                  One shared value rather than a per-tab judgement, and space-y-8 rather than the
                  space-y-6 this used to be, because 8 is what AIModelsCard already puts between its
                  OWN sections. At 6 the gap between two top-level cards was tighter than the gap
                  between subsections inside one of them, which reads as though the cards belong
                  together. Separation has to grow with level, not shrink. */}
              <TabsContent value="settings" className="mt-0">
                {/* General was six unrelated cards. Access and provisioning moved to
                    Security, and the audit log with its retention policy to Audit
                    log, so each section answers one question. */}
                <div className={ADMIN_SECTION_STACK}>
                  <WorkspaceSettingsCard />
                  <DefaultChannelsCard />
                  <ReadReceiptsPolicyCard />
                  <PushNotificationsCard />
                </div>
              </TabsContent>
              <TabsContent value="security" className="mt-0">
                {/* Who may get in from outside, then how members are provisioned. */}
                <div className={ADMIN_SECTION_STACK}>
                  <GuestAccessCard />
                  <ScimProvisioningCard />
                </div>
              </TabsContent>
              <TabsContent value="audit" className="mt-0">
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
              <TabsContent value="health" className="mt-0">
                <div className={ADMIN_SECTION_STACK}>
                  <UpdatesCard />
                  <SystemCheckCard />
                </div>
              </TabsContent>
              <TabsContent value="permissions" className="mt-0">
                <div className={ADMIN_SECTION_STACK}>
                  <PermissionsCard />
                  <ProjectsPermissionsCard />
                </div>
              </TabsContent>
              {callsAvailable && (
              <TabsContent value="transcription" className="mt-0">
                <TranscriptionSettingsCard />
              </TabsContent>
              )}
              {aiAvailable && (
              <TabsContent value="ai-models" className="mt-0">
                {/* Six sub-pages under a tab bar (design v3, admin §A15), where
                    the seven cards stood in one 7,000px column. */}
                <AIAgentsSection />
              </TabsContent>
              )}
              <TabsContent value="webhooks" className="mt-0">
                <WebhooksCard />
              </TabsContent>
              <TabsContent value="workflows" className="mt-0">
                <WorkflowsCard />
              </TabsContent>
              <TabsContent value="apps" className="mt-0">
                <AppsCard />
              </TabsContent>
              <TabsContent value="integrations" className="mt-0">
                <div className={ADMIN_SECTION_STACK}>
                  <SlackBridgeCard />
                  <GitHubIntegrationCard />
                  <OAuthConfigCard />
                </div>
              </TabsContent>
              <TabsContent value="external-users" className="mt-0">
                <ExternalUsersCard />
              </TabsContent>
              <TabsContent value="archive" className="mt-0">
                <div className={ADMIN_SECTION_STACK}>
                  <ArchiveCard />
                  <DocHistoryCard />
                </div>
              </TabsContent>
              <TabsContent value="import" className="mt-0">
                {reviewPlace === null ? (
                  <AdminCardSkeleton />
                ) : (
                  <div className={ADMIN_SECTION_STACK}>
                    {/* The people earlier imports added, while any are left
                        to review, above everything, and at the end once all
                        are decided. Then Slack: chat history is the migration
                        most teams arrive with, and the other providers carry
                        projects and tasks (Notion its pages too). The docs'
                        export closes it. */}
                    {reviewPlace === "first" && <ImportReviewCard />}
                    <SlackImportCard />
                    <ImportCard />
                    <ExportCard />
                    {reviewPlace === "last" && <ImportReviewCard />}
                  </div>
                )}
              </TabsContent>
              </>
              )}
              </div>
            </PageFrame>
            {jumps && (
              <aside className="hidden w-[180px] shrink-0 pt-10 min-[1280px]:block">
                <OnThisPageRail items={jumps} scrollRoot={scrollRef} />
              </aside>
            )}
          </div>
          </AdminScrollContext.Provider>
        </div>
      </Tabs>
    </main>
  )
}

export default AdminPage
