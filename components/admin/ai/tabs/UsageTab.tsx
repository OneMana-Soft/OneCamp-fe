"use client"

import AIActivityCard from "@/components/admin/AIActivityCard"
import { TopConsumersPanel, UsagePanel } from "@/components/admin/AIModelsCard"
import { SETTINGS_STACK } from "@/components/ui/settingsSection"

/**
 * Usage (admin §A15): today's meters and the caps, who and where the spend
 * goes, and what the AI did.
 */
export default function UsageTab() {
  return (
    <div className={SETTINGS_STACK}>
      <div id="ai-models-budgets" className="scroll-mt-5">
        <UsagePanel />
      </div>
      <div id="ai-models-consumers" className="scroll-mt-5">
        <TopConsumersPanel />
      </div>
      <div id="ai-models-activity" className="scroll-mt-5">
        <AIActivityCard />
      </div>
    </div>
  )
}
