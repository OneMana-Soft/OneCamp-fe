"use client"

// The workspace's calendar privacy (calendar A6, owner decision O7): members
// see when other members are busy, and never what, on a calendar not shared
// with them. On by default; an admin may turn it off, and then such a
// calendar shows nothing. A calendar shared with someone shows what it is
// shared to show either way. One switch row that saves on change and says
// "Saved" beside its label; a refusal puts it back and says why. The server
// records each change.

import { useState } from "react"
import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ADMIN_POLICIES_KEY, CALENDAR_FREEBUSY, setWorkspacePolicy, type PolicyInfo } from "@/services/workAccessService"

export default function CalendarPermissionsCard() {
  const policies = useFetch<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, undefined, undefined, OWN_ERRORS)
  const info = policies.data?.data?.find((p) => p.key === CALENDAR_FREEBUSY)
  // The value being saved, shown at once; null once the server has answered.
  const [pending, setPending] = useState<boolean | null>(null)
  const { status, run } = useSaveStatus()

  const toggle = async (next: boolean): Promise<boolean> => {
    setPending(next)
    const held = await run(() => setWorkspacePolicy(CALENDAR_FREEBUSY, next), switchOffer("Members see when others are busy", next, toggle))
    setPending(null)
    return held
  }

  let body: React.ReactNode
  if (!policies.data && !policies.isError) {
    body = (
      <SettingsCard aria-label="Loading the calendar permissions">
        <SettingsRowsSkeleton rows={1} />
      </SettingsCard>
    )
  } else if (!info) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the calendar permissions" onRetry={() => void policies.mutate()} />
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        <SwitchRow
          label="Members see when others are busy"
          description="Only when, never what: a title, a place or a guest shows only on a calendar shared with them."
          checked={pending ?? info.value !== false}
          disabled={status.state === "saving"}
          status={status}
          onChange={(v) => void toggle(v)}
        />
      </SettingsCard>
    )
  }

  return (
    <SettingsSection title="Calendars" description="What members see of each other's calendars. Each person can share theirs to show more.">
      {body}
    </SettingsSection>
  )
}
