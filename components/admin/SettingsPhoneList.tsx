"use client"

import type { ComponentType, ReactNode } from "react"
import Link from "next/link"
import { ChevronRight } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics/Tile"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { CampHue } from "@/lib/campHue"
import { SETTINGS_GROUP_LABEL, PROFILE_HREF, type SettingsGroupKey } from "@/lib/adminSections"
import { useSettingsPlaces } from "@/components/navigationBar/desktop/SettingsNav"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { displayNameOf } from "@/lib/personName"
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor"
import { getNameInitials } from "@/lib/utils/getNameInitials"

const ADMIN_GROUPS: SettingsGroupKey[] = ["workspace", "ai", "connections", "records", "system"]

/**
 * One row of a phone's settings list (design v3, admin §1.1 and S1): 52px,
 * the destination's 28px hue tile (here the tile names a destination, which
 * identity may), its name at 15/22 and a chevron. No description: the page it
 * opens says what it is about.
 */
export function PhoneSettingsRow({ href, label, icon: Icon, hue }: { href: string; label: string; icon: ComponentType; hue: CampHue }) {
  return (
    <li className="set-row !min-h-[52px] !p-0">
      <Link
        href={href}
        data-press="row"
        className="flex min-h-[52px] items-center gap-3 px-3.5 transition-colors hover:bg-highlight active:bg-press focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <Tile hue={hue} size="md" className="size-7 rounded-lg">
          <Icon />
        </Tile>
        <span className="min-w-0 flex-1 truncate text-body text-foreground">{label}</span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      </Link>
    </li>
  )
}

/** A row whose place is still being decided (a permission, the server's AI): held in its shape. */
export function PhoneSettingsRowPending() {
  return (
    <li aria-hidden="true" className="set-row flex !min-h-[52px] items-center gap-3 !px-3.5 !py-0">
      <Skeleton className="size-7 shrink-0 rounded-lg" />
      <Skeleton className="h-3.5 w-32" />
    </li>
  )
}

/** A group of rows: its label at 12/510 ink-3, then the card. */
export function PhoneSettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="mb-1.5 px-3 text-2xs font-medium text-ink-3">{label}</h2>
      <ul className="set-card">{children}</ul>
    </section>
  )
}

/**
 * Who you are, at the top of a phone's settings (design v3, admin S1): your
 * avatar, your name and your email, opening your profile. The list of your
 * settings had no way to the profile at all.
 */
export function PhoneProfileCard() {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const profile = self.data?.data
  const { src } = useUserAvatar(profile?.user_profile_object_key)
  if (!profile) {
    return (
      <div aria-hidden="true" data-profile-card="" className="flex min-h-[80px] items-center gap-3 rounded-[16px] bg-raised p-4 shadow-e1">
        <Skeleton variant="circle" className="size-12 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    )
  }
  const name = displayNameOf(profile) || profile.user_email_id || "You"
  return (
    <Link
      href={PROFILE_HREF}
      data-profile-card=""
      data-press="card"
      className="flex min-h-[80px] items-center gap-3 rounded-[16px] bg-raised p-4 shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Avatar className="size-12 shrink-0">
        {src && <AvatarImage src={src} alt="" />}
        <AvatarFallback className={`${getAvatarFallbackClass(name)} text-sm font-semibold`}>{getNameInitials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-3 text-foreground">{name}</span>
        {profile.user_email_id && <span className="block truncate text-xs text-muted-foreground">{profile.user_email_id}</span>}
      </span>
      <span className="sr-only">, your profile</span>
      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
    </Link>
  )
}

/**
 * Admin on a phone (design v3, admin A1 and §1.1): the settings nav is its
 * own screen, the sections as grouped cards of 52px rows. A section opens
 * full screen with the platform's back. It replaced a native select 44px tall.
 * A section the server's answer decides (its AI, its calls) holds its place
 * while that answer loads, so the rows under it don't jump down when it comes.
 */
export function SettingsPhoneList() {
  const places = useSettingsPlaces(true)
  return (
    <main id="main-content" className="h-full min-h-0 overflow-y-auto px-4 pb-24 pt-4">
      <h1 className="sr-only">Admin</h1>
      <div className="space-y-6">
        {ADMIN_GROUPS.map((group) => {
          const rows = places.filter((p) => p.place.group === group)
          if (rows.length === 0) return null
          return (
            <PhoneSettingsGroup key={group} label={SETTINGS_GROUP_LABEL[group]}>
              {rows.map(({ place, pending }) =>
                pending ? (
                  <PhoneSettingsRowPending key={place.key} />
                ) : (
                  <PhoneSettingsRow key={place.key} href={place.href} label={place.label} icon={place.icon} hue={place.hue} />
                ),
              )}
            </PhoneSettingsGroup>
          )
        })}
      </div>
    </main>
  )
}
