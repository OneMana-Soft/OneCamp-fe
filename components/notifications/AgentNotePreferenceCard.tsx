"use client"

/**
 * The member's switch for the daily note OneCamp AI leaves in their DM.
 * Hidden where there is no AI, since there is then no note to turn off.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { toast } from "@/hooks/use-toast"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { getAgentNoteEnabled, setAgentNoteEnabled } from "@/services/agentNoteService"

const TITLE = "Daily note from OneCamp AI"
const LINE = "Saved as soon as you switch it."

export function AgentNotePreferenceCard() {
  const ai = useAIAvailable()
  // null while it loads; "failed" when it couldn't be read. A setting that
  // can't be read used to make the whole section vanish, so the person never
  // learned it was there.
  const [enabled, setEnabled] = React.useState<boolean | null | "failed">(null)

  const load = React.useCallback(() => {
    setEnabled(null)
    getAgentNoteEnabled()
      .then(setEnabled)
      .catch(() => setEnabled("failed"))
  }, [])

  React.useEffect(() => {
    if (ai) load()
  }, [ai, load])

  if (!ai) return null

  if (enabled === null) {
    return (
      <SettingsSection title={TITLE} description={LINE}>
        <div role="status" aria-label="Loading the daily note setting">
          <SettingsList>
            <div className="flex items-start justify-between gap-4 px-4 py-3" aria-hidden="true">
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="mt-0.5 h-5 w-9 shrink-0" />
            </div>
          </SettingsList>
        </div>
      </SettingsSection>
    )
  }

  if (enabled === "failed") {
    return (
      <SettingsSection title={TITLE} description={LINE}>
        <SettingsList>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">Couldn&apos;t load the daily note setting</p>
              <p className="text-xs text-muted-foreground text-pretty">
                Nothing has changed. This is usually a connection problem: try again in a moment.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={load}>
              Try again
            </Button>
          </div>
        </SettingsList>
      </SettingsSection>
    )
  }

  const change = async (next: boolean) => {
    setEnabled(next)
    try {
      await setAgentNoteEnabled(next)
      toast({ title: next ? "Daily note on" : "Daily note off" })
    } catch (e) {
      setEnabled(!next)
      toast({
        title: next ? "Couldn't turn the daily note on" : "Couldn't turn the daily note off",
        description: apiErrorMessage(e, "Check your connection and try again."),
        variant: "destructive",
      })
    }
  }

  return (
    <SettingsSection title={TITLE} description={LINE}>
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
