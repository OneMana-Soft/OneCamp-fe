"use client"

import { useState } from "react"
import ApiTokensCard from "@/components/admin/ApiTokensCard"
import { Button } from "@/components/ui/button"
import { SETTINGS_STACK, sectionActionClass } from "@/components/ui/settingsSection"
import { Plus } from "@/lib/icons"
import { SectionHeader } from "../SectionHeader"

export default function ApiTokensSettingsPage() {
  // The page's one primary action sits in its header and opens the card's dialog.
  const [creating, setCreating] = useState(false)
  return (
    <div className={SETTINGS_STACK}>
      <SectionHeader
        href="/app/settings/api-tokens"
        actions={
          <Button size="sm" onClick={() => setCreating(true)} className={sectionActionClass}>
            <Plus aria-hidden="true" />
            New token
          </Button>
        }
      >
        A token acts as you, limited to the scopes you grant, for scripts and outside tools. Send it as{" "}
        <code className="rounded-sm bg-sunken px-1 font-mono text-xs" translate="no">Authorization: Bearer …</code>.
      </SectionHeader>
      <ApiTokensCard creating={creating} onCreatingChange={setCreating} />
    </div>
  )
}
