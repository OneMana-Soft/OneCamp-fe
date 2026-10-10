"use client"

import MyAIActivityCard from "@/components/ai/MyAIActivityCard"
import AgentsCard from "@/components/admin/AgentsCard"
import McpServersCard from "@/components/admin/McpServersCard"
import DataSourcesCard from "@/components/admin/DataSourcesCard"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_AGENT_MANAGE } from "@/services/capabilityService"
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"
import { SectionHeader } from "../SectionHeader"
import { SectionLoading } from "../SectionLoading"

const HREF = "/app/settings/agents"

export default function AgentsSettingsPage() {
  const { can, isLoading } = useCapabilities()
  // Three answers, not two: "not yet known" is not "no AI here". Read as a
  // yes or no, the page said "This server runs without AI" on servers that
  // have it, until their config arrived.
  const ai = useFeatureState(FEATURE_AI)

  if (ai === "unknown" || (ai === "available" && isLoading)) {
    return (
      <div className="space-y-10">
        <SectionHeader href={HREF} />
        <SectionLoading label="Loading agents and skills" />
      </div>
    )
  }

  if (ai === "unavailable") {
    return (
      <div className="space-y-10">
        <SectionHeader href={HREF}>
          This server runs without AI, so there are no agents to build or watch here.
        </SectionHeader>
      </div>
    )
  }

  // NOT A DEAD END ANY MORE. Managing agents is a privilege; seeing the decisions
  // taken in your name is not. This branch used to say "agents aren't available
  // for you" and stop, which told a member that the governance they are subject
  // to is none of their business.
  if (!can(CAP_AGENT_MANAGE)) {
    return (
      <div className="space-y-10">
        <SectionHeader href={HREF}>
          Building agents is turned off for you. An admin can turn it on under Admin, Permissions. Everything an
          agent did in your name is below.
        </SectionHeader>
        <MyAIActivityCard />
      </div>
    )
  }

  return (
    // The agents first: the page is named for them. The record of what was
    // done in your name follows the things that do it.
    <div className="space-y-10">
      <SectionHeader href={HREF} />
      <AgentsCard />
      <McpServersCard />
      <DataSourcesCard />
      <MyAIActivityCard />
    </div>
  )
}
