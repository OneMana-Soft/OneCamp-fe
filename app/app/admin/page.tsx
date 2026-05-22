"use client"

import React, { useEffect, useRef } from "react"
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
import { Shield, Users, ShieldAlert, Mail, Settings, GitBranch } from "@/lib/icons";
import { Users2, Webhook, Archive, UserX } from "lucide-react";
import { useTranslation } from "react-i18next"

const AdminPage = () => {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const defaultTab = searchParams.get("tab") || "teams"
  const processed = useRef(false)

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
    <div className="flex flex-col h-full bg-background/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-border/50 bg-card/30">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your organization's teams, users, and administrative permissions.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-8">
        <Tabs defaultValue={defaultTab} className="h-full flex flex-col gap-6">
          <TabsList className="w-full sm:w-fit grid grid-cols-3 sm:flex bg-muted/50 p-1 border border-border/50 backdrop-blur-sm h-auto overflow-hidden">
            <TabsTrigger 
              value="teams" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Users className="h-4 w-4" />
              Teams
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Users2 className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger 
              value="admins" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <ShieldAlert className="h-4 w-4" />
              Admins
            </TabsTrigger>
            <TabsTrigger 
              value="invitations" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Mail className="h-4 w-4" />
              Invitations
            </TabsTrigger>
            <TabsTrigger 
              value="email-settings" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Settings className="h-4 w-4" />
              Email Config
            </TabsTrigger>
            <TabsTrigger 
              value="webhooks" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger 
              value="integrations" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <GitBranch className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger 
              value="external-users" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <UserX className="h-4 w-4" />
              External Users
            </TabsTrigger>
            <TabsTrigger 
              value="archive" 
              className="gap-2 px-4 py-2 rounded-md transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Archive className="h-4 w-4" />
              Archive
            </TabsTrigger>
          </TabsList>


          <div className="flex-1 overflow-hidden">
              <div className="h-full pr-4">
                <div className="max-w-4xl h-full">
                <TabsContent value="teams" className="mt-0 outline-none h-full">
                  <TeamsCard />
                </TabsContent>
                <TabsContent value="users" className="mt-0 outline-none h-full">
                  <UserCard />
                </TabsContent>
                <TabsContent value="admins" className="mt-0 outline-none h-full">
                  <AdminCard />
                </TabsContent>
                <TabsContent value="invitations" className="mt-0 outline-none h-full">
                  <InvitationCard />
                </TabsContent>
                <TabsContent value="email-settings" className="mt-0 outline-none h-full">
                  <EmailSettingsCard />
                </TabsContent>
                <TabsContent value="webhooks" className="mt-0 outline-none h-full">
                  <WebhooksCard />
                </TabsContent>
                <TabsContent value="integrations" className="mt-0 outline-none h-full">
                  <GitHubIntegrationCard />
                </TabsContent>
                <TabsContent value="external-users" className="mt-0 outline-none h-full">
                  <ExternalUsersCard />
                </TabsContent>
                <TabsContent value="archive" className="mt-0 outline-none h-full">
                  <ArchiveCard />
                </TabsContent>
              </div>
              </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

export default AdminPage
