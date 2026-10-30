"use client"

import { Suspense } from "react"
import { PageFrameHeader } from "@/components/ui/settingsPage"
import { SETTINGS_STACK, SettingsSection } from "@/components/ui/settingsSection"
import { profileSections } from "@/components/profile/profileSections"
import { ProfileIdentityBand } from "@/components/profile/ProfileIdentityBand"
import { AppearOnlineCard, ProfileFieldsCard } from "@/components/profile/ProfileFieldsCard"
import { PROFILE_HREF, SETTINGS_PLACES } from "@/lib/adminSections"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// Its own chunk: it draws nothing until its setting is read.
const WhoKnowsSettingCard = lazyPiece(() => import("@/components/whoKnows/WhoKnowsSettingCard"))

const place = SETTINGS_PLACES.find((p) => p.href === PROFILE_HREF)!

/**
 * Your profile (design v3, admin D1, mock M7b): "You › Profile" in the
 * settings shell, and the phone's own profile page, one page for both. The
 * identity band in your own hue, your details in one batched card, then the
 * parts that save the moment they change: Appear online, Who knows, Appearance,
 * Calendar, and Sign-in and security. The section ids are where Search
 * settings lands (lib/adminSections).
 *
 * The phone's page was a form of its own: loose fields, "Saved together when
 * you press Save profile" and a full-width Save, a design behind the page a
 * computer showed.
 */
export function ProfilePage() {
  return (
    <div className={SETTINGS_STACK}>
      <div><PageFrameHeader hue={place.hue} icon={place.icon} title={place.label} description={place.description} className="!mb-0" /></div>
      <ProfileIdentityBand />
      <SettingsSection id="profile-details" title="Details" description="How people here see you.">
        <ProfileFieldsCard />
      </SettingsSection>
      <SettingsSection id="profile-presence" title="Presence" description="Saved as soon as you switch it.">
        <AppearOnlineCard />
      </SettingsSection>
      <SettingsSection id="profile-who-knows" title="Who knows" description="Whether you can be suggested when someone asks who knows about something.">
        <Suspense fallback={null}><WhoKnowsSettingCard /></Suspense>
      </SettingsSection>
      {/* Appearance, Calendar, and Sign-in and security: a chunk of their own (fluid-14). */}
      <profileSections.Part />
    </div>
  )
}
