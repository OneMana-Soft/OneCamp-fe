"use client"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import AgentsCard from "@/components/admin/AgentsCard"
import McpServersCard from "@/components/admin/McpServersCard"
import DataSourcesCard from "@/components/admin/DataSourcesCard"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_AGENT_MANAGE } from "@/services/capabilityService"
import { Loader2, Sparkles } from "@/lib/icons"
import { useAIAvailable } from "@/hooks/useClientConfig"

export default function AgentsSettingsPage() {
  const { can, isLoading } = useCapabilities()
  const aiAvailable = useAIAvailable()

  if (isLoading) {
    return (
      <div className="container mx-auto flex items-center justify-center px-4 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!aiAvailable) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">AI agents are not on this server</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              This workspace is running an edition or configuration without AI, so
              there is nothing here to manage.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // NOT A DEAD END ANY MORE. Managing agents is a privilege; seeing the decisions
  // taken in your name is not. This branch used to say "agents aren't available
  // for you" and stop, which told a member that the governance they are subject
  // to is none of their business.
  if (!can(CAP_AGENT_MANAGE)) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <MyAIActivityCard />
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Building agents isn&apos;t enabled for you</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              A workspace admin can turn on member-built agents in Settings &rarr;
              Permissions. You can still see everything done in your name above.
            </p>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <MyAIActivityCard />
      <AgentsCard />
      <McpServersCard />
      <DataSourcesCard />
    </div>
  )
}
