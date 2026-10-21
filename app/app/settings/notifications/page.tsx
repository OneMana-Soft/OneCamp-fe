"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { AgentNotePreferenceCard } from "@/components/notifications/AgentNotePreferenceCard"
import { ReadReceiptsCard } from "@/components/notifications/ReadReceiptsCard"
import dynamic from "next/dynamic"
import { SETTINGS_STACK, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { SectionHeader } from "../SectionHeader"

/**
 * Notifications (design v3, admin S2): one save model on the whole page,
 * instant, each row with its saved tick. The sections carry the ids Search
 * settings lands on: notifications-email, -digest, -quiet, -keywords, -daily-note
 * and -read-receipts.
 */
// Keywords and VIPs load after the page (their chips and people picker are
// 50 KB of source): the section, its id for Search settings, and a skeleton
// hold the place.
const KeywordsAndVipsCard = dynamic(() => import("@/components/notifications/KeywordsAndVipsCard").then((m) => m.KeywordsAndVipsCard), {
  loading: () => (
    <SettingsSection id="notifications-keywords" title="Keywords and VIPs">
      <SettingsRowsSkeleton rows={2} control="field" />
    </SettingsSection>
  ),
})

export default function NotificationSettingsPage() {
  return (
    <div className={SETTINGS_STACK}>
      <SectionHeader href="/app/settings/notifications" />
      <NotificationPreferencesCard />
      <KeywordsAndVipsCard />
      <AgentNotePreferenceCard />
      <ReadReceiptsCard />
    </div>
  )
}
