"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { AgentNotePreferenceCard } from "@/components/notifications/AgentNotePreferenceCard"

export default function NotificationSettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
      <NotificationPreferencesCard />
      <AgentNotePreferenceCard />
    </div>
  )
}
