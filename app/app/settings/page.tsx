"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Shield } from "@/lib/icons"
import { useCapabilities } from "@/hooks/useCapabilities"
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { sectionAccess } from "@/lib/settingsSections"
import { useMedia } from "@/context/MediaQueryContext"
import { PROFILE_HREF, SETTINGS_GROUP_HUE, SETTINGS_PLACES } from "@/lib/adminSections"
import {
  PhoneProfileCard,
  PhoneSettingsGroup,
  PhoneSettingsRow,
  PhoneSettingsRowPending,
} from "@/components/admin/SettingsPhoneList"

/**
 * Your sections, in the settings nav's order: one list for the phone and the
 * computer (QA SH-17: the phone put Agents and skills before Your AI
 * assistants). Profile is the card above them.
 */
const YOUR_SECTIONS = SETTINGS_PLACES.flatMap((p) => (p.group === "you" && p.settings ? [p.settings] : []))

/**
 * Your settings on a phone (design v3, admin S1): who you are first, as a
 * card that opens your profile, then your sections as one card of 52px rows,
 * each on its own hue's tile, and for an admin the way into Admin. It was a
 * bordered box of rows with a line each and no way to the profile.
 *
 * A row that waits on this person's permissions or on whether the server has
 * AI holds its place until the answer is in: Workflows and Agents used to
 * insert themselves above API tokens a moment after the page drew, moving
 * the row under the thumb.
 *
 * On a computer the settings nav is the index, so there is no page that only
 * lists links: Settings opens on Profile.
 */
export default function SettingsPage() {
  const { can, isLoading } = useCapabilities()
  const ai = useFeatureState(FEATURE_AI)
  const { isMobile } = useMedia()
  const router = useRouter()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const isAdmin = !!self.data?.data?.user_is_admin
  useEffect(() => {
    if (!isMobile) router.replace(PROFILE_HREF)
  }, [isMobile, router])
  if (!isMobile) return null
  return (
    <div className="space-y-6">
      {/* The phone's top bar says "Settings". */}
      <h1 className="sr-only">Settings</h1>
      <PhoneProfileCard />
      <nav aria-label="Settings" className="space-y-6">
        <PhoneSettingsGroup label="You">
          {YOUR_SECTIONS.map((s) => {
            const access = sectionAccess(s, { can, capabilitiesKnown: !isLoading, ai })
            if (access === "hidden") return null
            if (access === "unknown") return <PhoneSettingsRowPending key={s.href} />
            return <PhoneSettingsRow key={s.href} href={s.href} label={s.label} icon={s.icon} hue={s.hue} />
          })}
        </PhoneSettingsGroup>
        {isAdmin && (
          <PhoneSettingsGroup label="Workspace">
            <PhoneSettingsRow href="/app/admin" label="Admin" icon={Shield} hue={SETTINGS_GROUP_HUE.workspace} />
          </PhoneSettingsGroup>
        )}
      </nav>
    </div>
  )
}
