"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { AgentNotePreferenceCard } from "@/components/notifications/AgentNotePreferenceCard"
import { ReadReceiptsCard } from "@/components/notifications/ReadReceiptsCard"
import { SETTINGS_STACK } from "@/components/ui/settingsSection"
import { SectionHeader } from "../SectionHeader"

/**
 * Notifications (design v3, admin S2): one save model on the whole page,
 * instant, each row with its saved tick. The sections carry the ids Search
 * settings lands on: notifications-email, -digest, -quiet, -daily-note and
 * -read-receipts.
 */
export default function NotificationSettingsPage() {
  return (
    <div className={SETTINGS_STACK}>
      <SectionHeader href="/app/settings/notifications" />
      <NotificationPreferencesCard />
      <AgentNotePreferenceCard />
      <ReadReceiptsCard />
    </div>
  )
}
