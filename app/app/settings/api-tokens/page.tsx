"use client"

import { useState } from "react"
import ApiTokensCard from "@/components/admin/ApiTokensCard"
import { Button } from "@/components/ui/button"
import { sectionActionClass } from "@/components/ui/settingsSection"
import { cn } from "@/lib/utils/helpers/cn"
import { Plus } from "@/lib/icons"
import { SectionHeader } from "../SectionHeader"

export default function ApiTokensSettingsPage() {
  // The page's one primary action sits in its header and opens the card's dialog.
  const [creating, setCreating] = useState(false)
  return (
    <div className="space-y-10">
      <SectionHeader
        href="/app/settings/api-tokens"
        actions={
          <Button size="sm" onClick={() => setCreating(true)} className={cn("gap-1.5", sectionActionClass)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New token
          </Button>
        }
      >
        A token acts as you, limited to the scopes you grant, for scripts and outside tools. Send it as{" "}
        <code className="rounded-sm bg-muted px-1 font-mono text-xs" translate="no">Authorization: Bearer …</code>.
      </SectionHeader>
      <ApiTokensCard creating={creating} onCreatingChange={setCreating} />
    </div>
  )
}
