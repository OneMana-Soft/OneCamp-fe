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
import { Shield, Users, ShieldAlert, Mail, Settings, GitBranch, Mic } from "@/lib/icons"
import { Users2, Webhook, Archive, UserX, Database, ChevronLeft, ChevronRight, Plug, SlidersHorizontal, Zap, KeyRound } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { useMedia } from "@/context/MediaQueryContext"
import { FEATURE_CALLS, useFeature } from "@/hooks/useClientConfig"

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

const TABS: TabDef[] = [
  { value: "teams", label: "Teams", icon: Users },
  { value: "users", label: "Users", icon: Users2 },
  { value: "admins", label: "Admins", icon: ShieldAlert },
  { value: "invitations", label: "Invitations", icon: Mail },
  { value: "email-settings", label: "Email Config", icon: Settings },
  { value: "settings", label: "Settings", icon: SlidersHorizontal },
  { value: "permissions", label: "Permissions", icon: KeyRound },
  { value: "transcription", label: "Transcription", icon: Mic },
  { value: "webhooks", label: "Webhooks", icon: Webhook },
  { value: "workflows", label: "Workflows", icon: Zap },
  { value: "apps", label: "Apps", icon: Plug },
  { value: "integrations", label: "Integrations", icon: GitBranch },
  { value: "external-users", label: "External Users", icon: UserX },
  { value: "archive", label: "Archive", icon: Archive },
  { value: "slack-import", label: "Slack Import", icon: Database },
  { value: "import", label: "Import", icon: Database },
]

const AdminPage = () => {
  const searchParams = useSearchParams()
  const {isDesktop } = useMedia();
  const { toast } = useToast()
  const callsAvailable = useFeature(FEATURE_CALLS)
  const visibleTabs = TABS.filter((tab) => {
    if (tab.value === "transcription") return callsAvailable
    return true
  })
  const requestedTab = searchParams.get("tab") || "teams"
  const defaultTab = visibleTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : "teams"
  const processed = useRef(false)

  // Horizontal scroll affordance for the tab strip — show fade + arrow
  // buttons only when there is actually overflow on the current viewport.
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const updateOverflow = () => {
    const el = tabsScrollRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }

  useEffect(() => {
    updateOverflow()
    const el = tabsScrollRef.current
    if (!el) return
    el.addEventListener("scroll", updateOverflow, { passive: true })
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateOverflow)
      ro.disconnect()
    }
  }, [])

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

  const scrollTabs = (dir: "left" | "right") => {
    const el = tabsScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" })
  }

  return (
    <main
      id="main-content"
      className="flex flex-col h-full min-h-0 bg-background"
    >
      {/* Header */}
      <header className="shrink-0 border-b border-border/60 bg-card/30 backdrop-blur-md">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          {isDesktop && <div className="flex items-center gap-2.5">
            <div className="bg-primary/10 p-1.5 rounded-md">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Admin Dashboard
            </h1>
          </div>}
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Manage your organization&apos;s teams, users, integrations and administrative permissions.
          </p>
        </div>
      </header>

      {/* Content */}
      <Tabs
        defaultValue={defaultTab}
        className="flex-1 min-h-0 flex flex-col"
      >
        {/* Sticky tab strip — horizontally scrollable on narrow widths */}
        <div className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="relative px-4 sm:px-6 lg:px-8">
            {/* Left fade + arrow */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent transition-opacity",
                overflow.left ? "opacity-100" : "opacity-0"
              )}
            />
            {overflow.left && (
              <button
                type="button"
                aria-label="Scroll tabs left"
                onClick={() => scrollTabs("left")}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-background/90 border border-border/60 shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}

            <div
              ref={tabsScrollRef}
              className="overflow-x-auto no-scrollbar -mx-1"
              role="presentation"
            >
              <TabsList
                className={cn(
                  "inline-flex h-auto items-stretch gap-1 bg-transparent p-1",
                  "rounded-none w-max"
                )}
              >
                {visibleTabs.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={cn(
                      "gap-2 px-3 py-2 rounded-md whitespace-nowrap text-sm font-medium",
                      "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                      "transition-colors",
                      "data-[state=active]:bg-accent data-[state=active]:text-foreground",
                      "data-[state=active]:shadow-none"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Right fade + arrow */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent transition-opacity",
                overflow.right ? "opacity-100" : "opacity-0"
              )}
            />
            {overflow.right && (
              <button
                type="button"
                aria-label="Scroll tabs right"
                onClick={() => scrollTabs("right")}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-background/90 border border-border/60 shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

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
            <div className="mx-auto w-full max-w-6xl">
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
                {/* SCIM sits between guest access and the audit log because the three are one
                    progression: who may get in from outside, how members are provisioned, and what
                    was done. The audit log stays last — it is a viewer over the others, not a
                    setting alongside them. */}
                <div className={ADMIN_SECTION_STACK}>
                  <WorkspaceSettingsCard />
                  <GuestAccessCard />
                  <ScimProvisioningCard />
                  <AdminAuditLog />
                  {/* Beside the audit log, because retention is the policy that
                      explains why an old entry has no content. */}
                  <RetentionCard />
                  <PushNotificationsCard />
                </div>
              </TabsContent>
              <TabsContent value="permissions" className="mt-0 outline-none">
                <PermissionsCard />
              </TabsContent>
              {callsAvailable && (
              <TabsContent value="transcription" className="mt-0 outline-none">
                <TranscriptionSettingsCard />
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
              <TabsContent value="slack-import" className="mt-0 outline-none">
                <SlackImportCard />
              </TabsContent>
              <TabsContent value="import" className="mt-0 outline-none">
                <ImportCard />
              </TabsContent>
            </div>
          </div>
        </div>
      </Tabs>
    </main>
  )
}

export default AdminPage
