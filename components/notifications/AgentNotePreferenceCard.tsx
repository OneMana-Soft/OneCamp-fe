"use client"

/**
 * The member's switch for the daily note OneCamp AI leaves in their DM, with
 * a preview chip of what one says. Hidden where there is no AI, since there
 * is then no note to turn off. Instant (design v3, admin S2): the saved tick,
 * or the reason under the label and the switch put back.
 */

import * as React from "react"
import { SettingsCardError, SettingsList, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { getAgentNoteEnabled, setAgentNoteEnabled } from "@/services/agentNoteService"

const TITLE = "Daily note from OneCamp AI"
const LINE = "The first time you open OneCamp each day."

export function AgentNotePreferenceCard() {
  const ai = useAIAvailable()
  // null while it loads; "failed" when it couldn't be read. A setting that
  // can't be read used to make the whole section vanish, so the person never
  // learned it was there.
  const [enabled, setEnabled] = React.useState<boolean | null | "failed">(null)
  const { status, run } = useSaveStatus()

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
      <SettingsSection id="notifications-daily-note" title={TITLE} description={LINE}>
        <div role="status" aria-label="Loading the daily note setting">
          <SettingsList>
            <SettingsRowsSkeleton rows={1} />
          </SettingsList>
        </div>
      </SettingsSection>
    )
  }

  if (enabled === "failed") {
    return (
      <SettingsSection id="notifications-daily-note" title={TITLE} description={LINE}>
        <SettingsList>
          <SettingsCardError what="the daily note setting" reason="Nothing has changed. This is usually a connection problem." onRetry={load} />
        </SettingsList>
      </SettingsSection>
    )
  }

  const change = async (next: boolean): Promise<boolean> => {
    setEnabled(next)
    const held = await run(() => setAgentNoteEnabled(next), switchOffer("Daily note", next, change))
    if (!held) setEnabled(!next)
    return held
  }

  return (
    <SettingsSection id="notifications-daily-note" title={TITLE} description={LINE}>
      <SettingsList>
        <SwitchRow
          id="daily-note"
          label="Send me the daily note"
          description="A DM listing what needs you: approvals, overdue tasks, commitments and today's meetings. Nothing is sent on a day with nothing to say."
          checked={enabled}
          status={status}
          onChange={(v) => void change(v)}
        />
        <div className="set-row !min-h-0 pt-0">
          {/* What a note looks like: an example, in the agent's own square. */}
          <span data-note-preview="" className="you-note-chip">
            <span className="size-4 shrink-0">
              <AgentAvatar />
            </span>
            <span className="truncate">For example: “Your day: 2 approvals, 1 overdue task…”</span>
          </span>
        </div>
      </SettingsList>
    </SettingsSection>
  )
}
