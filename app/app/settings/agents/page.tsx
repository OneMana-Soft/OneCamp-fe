"use client"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import AgentsCard from "@/components/admin/AgentsCard"
import McpServersCard from "@/components/admin/McpServersCard"
import DataSourcesCard from "@/components/admin/DataSourcesCard"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_AGENT_MANAGE } from "@/services/capabilityService"
import { Loader2 } from "@/lib/icons"
import { PageHeader } from "@/components/ui/pageHeader"
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
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
        <PageHeader title="Agents and skills">
          <p className="text-sm text-muted-foreground">
            This server runs without AI, so there are no agents to build or watch here.
          </p>
        </PageHeader>
      </div>
    )
  }

  // NOT A DEAD END ANY MORE. Managing agents is a privilege; seeing the decisions
  // taken in your name is not. This branch used to say "agents aren't available
  // for you" and stop, which told a member that the governance they are subject
  // to is none of their business.
  if (!can(CAP_AGENT_MANAGE)) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-16 pt-4">
        <PageHeader title="Agents and skills">
          <p className="text-sm text-muted-foreground text-pretty">
            Building agents is turned off for you. An admin can turn it on under Admin, Permissions. Everything an
            agent did in your name is below.
          </p>
        </PageHeader>
        <MyAIActivityCard />
      </div>
    )
  }


  return (
    // The agents first: the page is named for them. The record of what was
    // done in your name follows the things that do it.
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-16 pt-4">
      <PageHeader title="Agents and skills" />
      <AgentsCard />
      <McpServersCard />
      <DataSourcesCard />
      <MyAIActivityCard />
    </div>
  )
}
