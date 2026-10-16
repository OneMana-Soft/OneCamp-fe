"use client"

import { ProfilePage } from "@/components/profile/ProfilePage"

/**
 * Your profile, the first page of the settings shell (design v3, admin D1,
 * mock M7b): "You › Profile", not a dialog that scrolls inside itself. The
 * page itself is components/profile/ProfilePage, which the phone's own
 * profile page (/app/profile) draws too.
 */
export default function ProfileSettingsPage() {
  return <ProfilePage />
}
