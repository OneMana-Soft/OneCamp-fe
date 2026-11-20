"use client"

/**
 * Whether others see when you're busy (gcal-14): each person's own choice,
 * kept in the Policy Registry at person scope (GET/PUT /calendar/freebusy).
 * A workspace that shows nobody's busy times wins: the switch is off and
 * can't be changed, and one line says why. It acts on the caller's own
 * choice alone; the server decides what anyone sees.
 */

import { useState } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { isAppOffline } from "@/lib/connectivity"
import { SettingsCardError, SettingsList, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"

interface FreeBusy {
  hidden: boolean
  workspace: boolean
}

const URL = "/calendar/freebusy"

export function FreeBusySection() {
  const res = useFetch<{ data?: FreeBusy }>(URL, undefined, undefined, OWN_ERRORS)
  const save = useSaveStatus()
  // The switch moves at once and goes back if the save doesn't hold.
  const [moved, setMoved] = useState<boolean | null>(null)
  const got = res.data?.data
  const workspace = got?.workspace !== false
  const shown = moved ?? (!!got && !got.hidden)
  // A held change is offered back (Undo), through this same save.
  const change = async (on: boolean): Promise<boolean> => {
    setMoved(on)
    const held = await save.run(async () => {
      if (isAppOffline()) throw new Error("You're offline. This can't be saved now.")
      const r = await axiosInstance.put(URL, { hidden: !on }, OWN_ERRORS)
      await res.mutate(r.data, { revalidate: false })
    }, switchOffer("Show when you're busy", on, change))
    // Held: the server's answer is in; not held: back as it was, and read again.
    if (!held) {
      setMoved(null)
      void res.mutate()
    }
    return held
  }
  return (
    <SettingsSection id="profile-freebusy" title="Busy times" description="Whether teammates see when you're busy, on their calendars and when they find a time.">
      {got ? (
        <SettingsList>
          <SwitchRow
            label="Show when you're busy"
            description={workspace ? "Off keeps your busy times to yourself. Events you share stay shared." : "Your workspace keeps everyone's busy times private."}
            checked={workspace && shown}
            disabled={!workspace || save.status.state === "saving"}
            onChange={(on) => void change(on)}
            status={save.status}
          />
        </SettingsList>
      ) : res.isError ? (
        <SettingsCardError what="your busy-times choice" onRetry={() => void res.mutate()} />
      ) : (
        <SettingsRowsSkeleton rows={1} />
      )}
    </SettingsSection>
  )
}
