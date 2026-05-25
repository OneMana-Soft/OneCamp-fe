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
import ArchiveCard from "@/components/admin/ArchiveCard"
import ExternalUsersCard from "@/components/admin/ExternalUsersCard"
import SlackImportCard from "@/components/admin/SlackImportCard"
import ImportCard from "@/components/admin/ImportCard"
import { Shield, Users, ShieldAlert, Mail, Settings, GitBranch } from "@/lib/icons"
import { Users2, Webhook, Archive, UserX, Database, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { useMedia } from "@/context/MediaQueryContext"

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
  { value: "webhooks", label: "Webhooks", icon: Webhook },
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
  const defaultTab = searchParams.get("tab") || "teams"
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
                {TABS.map(({ value, label, icon: Icon }) => (
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

        {/* Per-tab content. Each card owns its own internal scrolling. */}
        <div className="flex-1 min-h-0">
          <div className="h-full px-4 sm:px-6 lg:px-8 py-6">
            <div className="h-full mx-auto w-full max-w-6xl">
              <TabsContent value="teams" className="mt-0 h-full outline-none">
                <TeamsCard />
              </TabsContent>
              <TabsContent value="users" className="mt-0 h-full outline-none">
                <UserCard />
              </TabsContent>
              <TabsContent value="admins" className="mt-0 h-full outline-none">
                <AdminCard />
              </TabsContent>
              <TabsContent value="invitations" className="mt-0 h-full outline-none">
                <InvitationCard />
              </TabsContent>
              <TabsContent value="email-settings" className="mt-0 h-full outline-none">
                <EmailSettingsCard />
              </TabsContent>
              <TabsContent value="webhooks" className="mt-0 h-full outline-none">
                <WebhooksCard />
              </TabsContent>
              <TabsContent value="integrations" className="mt-0 h-full outline-none">
                <GitHubIntegrationCard />
              </TabsContent>
              <TabsContent value="external-users" className="mt-0 h-full outline-none">
                <ExternalUsersCard />
              </TabsContent>
              <TabsContent value="archive" className="mt-0 h-full outline-none">
                <ArchiveCard />
              </TabsContent>
              <TabsContent value="slack-import" className="mt-0 h-full outline-none">
                <SlackImportCard />
              </TabsContent>
              <TabsContent value="import" className="mt-0 h-full outline-none">
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
