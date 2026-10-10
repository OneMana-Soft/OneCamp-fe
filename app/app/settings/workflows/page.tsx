"use client"

import WorkflowsCard from "@/components/admin/WorkflowsCard"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_WORKFLOW_MANAGE } from "@/services/capabilityService"
import { settingsSection } from "@/lib/settingsSections"
import { SectionHeader } from "../SectionHeader"
import { SectionLoading } from "../SectionLoading"

const HREF = "/app/settings/workflows"

export default function WorkflowsSettingsPage() {
  const { can, isLoading } = useCapabilities()
  const allowed = can(CAP_WORKFLOW_MANAGE)

  return (
    <div className="space-y-10">
      {/* Said by the page only when the card isn't there to say it. */}
      <SectionHeader href={HREF}>
        {!isLoading && !allowed
          ? "Making workflows is turned off for you. An admin can turn it on under Admin, Permissions."
          : null}
      </SectionHeader>
      {isLoading ? (
        <SectionLoading label="Loading workflows" />
      ) : allowed ? (
        <WorkflowsCard hue={settingsSection(HREF)?.hue} withTitle={false} />
      ) : null}
    </div>
  )
}
