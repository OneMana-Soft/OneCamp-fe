"use client"

import { PageFrameHeader } from "@/components/ui/settingsPage"
import { SETTINGS_STACK, SettingsSection } from "@/components/ui/settingsSection"
import { AppearanceSection, CalendarSection, SigningInSection } from "@/components/profile/ProfileSettingsSections"
import { ProfileIdentityBand } from "@/components/profile/ProfileIdentityBand"
import { AppearOnlineCard, ProfileFieldsCard } from "@/components/profile/ProfileFieldsCard"
import { PROFILE_HREF, SETTINGS_PLACES } from "@/lib/adminSections"

const place = SETTINGS_PLACES.find((p) => p.href === PROFILE_HREF)!

/**
 * Your profile (design v3, admin D1, mock M7b): "You › Profile" in the
 * settings shell, and the phone's own profile page, one page for both. The
 * identity band in your own hue, your details in one batched card, then the
 * parts that save the moment they change: Appear online, Appearance,
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
      <div id="profile-appearance" className="scroll-mt-5">
        <AppearanceSection />
      </div>
      <div id="profile-calendar" className="scroll-mt-5">
        <CalendarSection />
      </div>
      <div id="profile-security" className="scroll-mt-5">
        <SigningInSection />
      </div>
    </div>
  )
}
