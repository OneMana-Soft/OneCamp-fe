"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { AgentNotePreferenceCard } from "@/components/notifications/AgentNotePreferenceCard"
import { ReadReceiptsCard } from "@/components/notifications/ReadReceiptsCard"
import { PageHeader } from "@/components/ui/pageHeader"

export default function NotificationSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 pb-16 pt-4">
      <PageHeader title="Notifications" />
      <NotificationPreferencesCard />
      <ReadReceiptsCard />
      <AgentNotePreferenceCard />
    </div>
  )
}
