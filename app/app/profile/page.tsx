"use client"

import { PageFrame } from "@/components/ui/settingsPage"
import { ProfilePage } from "@/components/profile/ProfilePage"

/**
 * Your profile on a phone (the More menu's "Your profile"): the same page the
 * settings shell shows on a computer, in the same 720px frame (design v3,
 * admin D1). It was a form of its own, behind the computer's design. A
 * computer never stays here (layout.tsx sends it to the settings page).
 */
export default function MobileSelfProfilePage() {
  return (
    <PageFrame>
      <ProfilePage />
    </PageFrame>
  )
}
