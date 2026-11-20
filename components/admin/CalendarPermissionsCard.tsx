"use client"

// The workspace's calendar privacy (calendar A6, owner decision O7): members
// see when other members are busy, and never what, on a calendar not shared
// with them. On by default; an admin may turn it off, and then such a
// calendar shows nothing. A calendar shared with someone shows what it is
// shared to show either way. And whether members may show a calendar in
// another app (basecamp-05): a secret link is a bearer link, so an admin may
// turn every one off at once; it answers like an unknown link from then on.
// Each switch row saves on change and says "Saved" beside its label; a
// refusal puts it back and says why. The server records each change.

import { useState } from "react"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ADMIN_POLICIES_KEY, CALENDAR_FREEBUSY, setWorkspacePolicy, type PolicyInfo } from "@/services/workAccessService"

// basecamp-05: members may show a calendar in another app through a secret link; off, every link stops at
// once. Kept here, not beside CALENDAR_FREEBUSY: that file is on first screens, and only this card names it.
const CALENDAR_FEEDS = "calendar.feeds.allowed"

/** One workspace switch: what it shows (the value being saved, at once), and its save, offered back on the toast. */
function usePolicySwitch(key: string, label: string, info: PolicyInfo | undefined) {
  // The value being saved, shown at once; null once the server has answered.
  const [pending, setPending] = useState<boolean | null>(null)
  const { status, run } = useSaveStatus()
  const toggle = async (next: boolean): Promise<boolean> => {
    setPending(next)
    const held = await run(() => setWorkspacePolicy(key, next), switchOffer(label, next, toggle))
    setPending(null)
    return held
  }
  return { checked: pending ?? info?.value !== false, disabled: status.state === "saving", status, onChange: (v: boolean) => void toggle(v) }
}

export default function CalendarPermissionsCard() {
  const policies = useFetch<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, undefined, undefined, OWN_ERRORS)
  const busyInfo = policies.data?.data?.find((p) => p.key === CALENDAR_FREEBUSY)
  const feedsInfo = policies.data?.data?.find((p) => p.key === CALENDAR_FEEDS)
  const busy = usePolicySwitch(CALENDAR_FREEBUSY, "Members see when others are busy", busyInfo)
  const feeds = usePolicySwitch(CALENDAR_FEEDS, "Members can show a calendar in another app", feedsInfo)

  let body: React.ReactNode
  if (!policies.data && !policies.isError) {
    body = (
      <SettingsCard aria-label="Loading the calendar permissions">
        <SettingsRowsSkeleton rows={1} />
      </SettingsCard>
    )
  } else if (!busyInfo && !feedsInfo) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the calendar permissions" onRetry={() => void policies.mutate()} />
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        {busyInfo ? (
          <SwitchRow
            label="Members see when others are busy"
            description="Only when, never what: a title, a place or a guest shows only on a calendar shared with them."
            {...busy}
          />
        ) : null}
        {feedsInfo ? (
          <SwitchRow
            label="Members can show a calendar in another app"
            description="Off stops every link at once. On, members make their own secret links."
            {...feeds}
          />
        ) : null}
      </SettingsCard>
    )
  }

  return (
    <SettingsSection title="Calendars" description="What members see of each other's calendars, and whether they can show one in another app. Each person can share theirs to show more.">
      {body}
    </SettingsSection>
  )
}
