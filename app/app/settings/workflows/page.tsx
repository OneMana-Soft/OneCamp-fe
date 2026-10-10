"use client"

import { useState } from "react"
import WorkflowsCard from "@/components/admin/WorkflowsCard"
import { WORKFLOWS_DESCRIPTION, WorkflowsListSkeleton } from "@/components/admin/workflowsParts"
import { Button } from "@/components/ui/button"
import { sectionActionClass } from "@/components/ui/settingsSection"
import { cn } from "@/lib/utils/helpers/cn"
import { Plus } from "@/lib/icons"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_WORKFLOW_MANAGE } from "@/services/capabilityService"
import { settingsSection } from "@/lib/settingsSections"
import { SectionHeader } from "../SectionHeader"

const HREF = "/app/settings/workflows"

/**
 * The page's h1 holds its one action, New workflow, and says what workflows
 * do; the list under it draws no title of its own. The card used to repeat
 * "Workflows" and New workflow under the h1.
 *
 * While permissions load, the page draws the rows the list will draw, so the
 * list lands in their place: a different, boxed placeholder came first and
 * jumped when the card's own skeleton replaced it.
 */
export default function WorkflowsSettingsPage() {
  const { can, isLoading } = useCapabilities()
  const allowed = can(CAP_WORKFLOW_MANAGE)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-6">
      <SectionHeader
        href={HREF}
        actions={
          !isLoading && allowed ? (
            <Button size="sm" className={cn(sectionActionClass, "gap-1.5")} onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New workflow
            </Button>
          ) : null
        }
      >
        {!isLoading && !allowed
          ? "Making workflows is turned off for you. An admin can turn it on under Admin, Permissions."
          : WORKFLOWS_DESCRIPTION}
      </SectionHeader>
      {isLoading ? (
        <WorkflowsListSkeleton />
      ) : allowed ? (
        <WorkflowsCard hue={settingsSection(HREF)?.hue} withTitle={false} creating={creating} onCreatingChange={setCreating} />
      ) : null}
    </div>
  )
}
