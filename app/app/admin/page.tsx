"use client"

import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TeamsCard from "@/components/admin/teamCard"
import UserCard from "@/components/admin/userCard"
import AdminCard from "@/components/admin/adminCard"
import InvitationCard from "@/components/admin/invitationCard"
import { Shield, Users, Users2, ShieldAlert, Mail } from "lucide-react"
import { useTranslation } from "react-i18next"

const AdminPage = () => {
  const { t } = useTranslation()

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
        <Tabs defaultValue="teams" className="h-full flex flex-col gap-6">
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
              </div>
              </div>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

export default AdminPage
