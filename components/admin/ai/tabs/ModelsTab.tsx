"use client"

import AIModelsCard from "@/components/admin/AIModelsCard"
import ModelRoutingCard from "@/components/admin/ModelRoutingCard"
import AuthorizedModelsSection from "@/components/admin/ai/AuthorizedModelsSection"
import { SETTINGS_STACK } from "@/components/ui/settingsSection"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"

/**
 * Models (admin §A15): the providers, each a card (the local one opens to the
 * model catalog and installer), the model in force for each kind of work,
 * the model per job, and the models members may pick for themselves.
 */
export default function ModelsTab() {
  const { config } = useAIConfig()
  return (
    <div className={SETTINGS_STACK}>
      <div id="ai-models-models" className="scroll-mt-5">
        <AIModelsCard />
      </div>
      {/* Right after the models, because routing chooses from them. */}
      <div id="ai-models-routing" className="scroll-mt-5">
        <ModelRoutingCard />
      </div>
      {config && (
        <div id="ai-models-allowlist" className="scroll-mt-5">
          <AuthorizedModelsSection config={config} />
        </div>
      )}
    </div>
  )
}
