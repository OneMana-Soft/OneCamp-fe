"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { AgentNotePreferenceCard } from "@/components/notifications/AgentNotePreferenceCard"
import { ReadReceiptsCard } from "@/components/notifications/ReadReceiptsCard"

export default function NotificationSettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
      <NotificationPreferencesCard />
      <ReadReceiptsCard />
      <AgentNotePreferenceCard />
    </div>
  )
}
