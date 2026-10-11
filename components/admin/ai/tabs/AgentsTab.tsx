"use client"

import AgentInventoryCard from "@/components/admin/AgentInventoryCard"
import AgentDelegationCard from "@/components/admin/AgentDelegationCard"
import McpServersCard from "@/components/admin/McpServersCard"
import { AmbientAgentsPanel } from "@/components/admin/AIModelsCard"
import { SETTINGS_STACK } from "@/components/ui/settingsSection"

/**
 * Agents (admin §A15): what can act here and who answers for it, with the
 * switch to stop it (the inventory, drawn as it is), how agents may work
 * together, the automations that run on the models, and the tool servers
 * agents can reach.
 */
export default function AgentsTab() {
  return (
    <div className={SETTINGS_STACK}>
      <div id="ai-models-inventory" className="scroll-mt-5">
        <AgentInventoryCard />
      </div>
      <div id="ai-models-delegation" className="scroll-mt-5">
        <AgentDelegationCard />
      </div>
      <div id="ai-models-ambient" className="scroll-mt-5">
        <AmbientAgentsPanel />
      </div>
      <div id="ai-models-mcp-servers" className="scroll-mt-5">
        <McpServersCard />
      </div>
    </div>
  )
}
