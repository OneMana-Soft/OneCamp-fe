"use client"

import GovernanceDrillCard from "@/components/admin/GovernanceDrillCard"
import MCPServerCard from "@/components/admin/MCPServerCard"
import { RedactionPanel } from "@/components/admin/AIModelsCard"
import { SETTINGS_STACK } from "@/components/ui/settingsSection"

/**
 * Governance (admin §A15): the drill that proves the limit holds, who outside
 * the workspace may cause an agent to act here, and what leaves the server.
 */
export default function GovernanceTab() {
  return (
    <div className={SETTINGS_STACK}>
      <div id="ai-models-drill" className="scroll-mt-5">
        <GovernanceDrillCard />
      </div>
      <div id="ai-models-mcp" className="scroll-mt-5">
        <MCPServerCard />
      </div>
      <div id="ai-models-redaction" className="scroll-mt-5">
        <RedactionPanel />
      </div>
    </div>
  )
}
