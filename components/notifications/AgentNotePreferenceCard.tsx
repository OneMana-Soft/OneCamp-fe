"use client"

/**
 * The member's switch for the daily note OneCamp AI leaves in their DM.
 * Hidden where there is no AI, since there is then no note to turn off.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { getAgentNoteEnabled, setAgentNoteEnabled } from "@/services/agentNoteService"

export function AgentNotePreferenceCard() {
  const ai = useAIAvailable()
  const { toast } = useToast()
  const [enabled, setEnabled] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (!ai) return
    getAgentNoteEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(null))
  }, [ai])

  if (!ai || enabled === null) return null

  const change = async (next: boolean) => {
    setEnabled(next)
    try {
      await setAgentNoteEnabled(next)
      toast({ title: next ? "Daily note on" : "Daily note off" })
    } catch {
      setEnabled(!next)
      toast({ title: "Could not save that", variant: "destructive" })
    }
  }

  return (
    <SettingsSection title="Daily note from OneCamp AI" description="Saved as soon as you switch it.">
      <SettingsList>
        <SwitchRow
          label="Send me the daily note"
          description="The first time you open OneCamp each day, OneCamp AI sends you a DM listing what needs you: approvals, overdue tasks, commitments and today's meetings. Reply to it for help. Nothing is sent on a day with nothing to say."
          checked={enabled}
          onChange={(v) => void change(v)}
        />
      </SettingsList>
    </SettingsSection>
  )
}
