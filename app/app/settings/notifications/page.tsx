"use client"

import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard"
import { ReadReceiptsCard } from "@/components/notifications/ReadReceiptsCard"
import { SectionHeader } from "../SectionHeader"

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-10">
      <SectionHeader href="/app/settings/notifications" />
      <NotificationPreferencesCard />
      <ReadReceiptsCard />
    </div>
  )
}
