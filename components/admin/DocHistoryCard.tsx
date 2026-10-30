"use client"

// How long docs keep their history (docs H1): the workspace's
// docs.history.days, a year unless an admin chooses otherwise, never under 30
// days. It says what the choice means; named and pinned versions are always
// kept. A shorter time removes nothing until the server's next scheduled tidy
// (within six hours), so a slip can be put back first. Saves on change, with
// the saved tick; the server records each change.

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SettingRow, SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { ADMIN_POLICIES_KEY, type PolicyInfo } from "@/services/workAccessService"

export const HISTORY_DAYS = "docs.history.days"

/** The lengths offered, in days. */
const CHOICES = [30, 90, 180, 365, 730, 1825]

/** A length in words: "30 days", "1 year", "5 years". Pure. */
export function lengthWords(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365
    return years === 1 ? "1 year" : `${years} years`
  }
  return days === 1 ? "1 day" : `${days} days`
}

/** What a length means, as the card says it, in the select's words. Pure. */
export function historyMeaning(days: number): string {
  const length = days >= 365 && days % 365 === 0 ? lengthWords(days) : `${days.toLocaleString("en-GB")} days`
  return `Versions older than ${length} are removed. Named and pinned versions are always kept.`
}

function HistoryRow({ info }: { info: PolicyInfo }) {
  const saved = Number(info.value) || 365
  const [pending, setPending] = useState<number | null>(null)
  const { status, run } = useSaveStatus()
  const shown = pending ?? saved
  const choices = CHOICES.includes(saved) ? CHOICES : [...CHOICES, saved].sort((a, b) => a - b)
  const choose = async (next: number): Promise<boolean> => {
    setPending(next)
    const held = await run(async () => {
      const res = await axiosInstance.put<{ data: PolicyInfo }>(`${ADMIN_POLICIES_KEY}/${HISTORY_DAYS}`, { value: next }, OWN_ERRORS)
      const after = res.data.data
      await appMutate<{ data: PolicyInfo[] }>(
        ADMIN_POLICIES_KEY,
        (d) => (d ? { ...d, data: d.data.map((p) => (p.key === HISTORY_DAYS ? after : p)) } : d),
        { revalidate: false },
      )
    }, { what: `Doc history: ${lengthWords(next)}`, undo: () => choose(saved) })
    setPending(null)
    return held
  }
  return (
    <SettingRow
      label="Keep doc history for"
      description={
        <span data-history-meaning="">
          {historyMeaning(shown)}
        </span>
      }
      controlId="doc-history-days"
      status={status}
    >
      <Select value={String(shown)} onValueChange={(v) => Number(v) !== saved && void choose(Number(v))} disabled={status.state === "saving"}>
        <SelectTrigger id="doc-history-days" aria-label="Keep doc history for" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {lengthWords(d)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  )
}

export default function DocHistoryCard() {
  const policies = useFetch<{ data: PolicyInfo[] }>(ADMIN_POLICIES_KEY, undefined, undefined, OWN_ERRORS)
  const info = (policies.data?.data ?? []).find((p) => p.key === HISTORY_DAYS)
  let body: React.ReactNode
  if (!policies.data && !policies.isError) {
    body = (
      <SettingsCard aria-label="Loading the doc history setting">
        <SettingsRowsSkeleton rows={1} control="button" />
      </SettingsCard>
    )
  } else if (policies.isError && !policies.data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the doc history setting" onRetry={() => void policies.mutate()} />
      </SettingsCard>
    )
  } else if (!info) {
    return null
  } else {
    body = (
      <>
        <SettingsCard>
          <HistoryRow info={info} />
        </SettingsCard>
        <p className="mt-2 px-1 text-meta text-ink-3" data-history-tidy="">
          A shorter time takes effect at the next tidy, within six hours, so a change can be put back before anything goes.
        </p>
      </>
    )
  }
  return (
    <SettingsSection title="Doc history" description="Every doc keeps its versions, who made each change, and a way back to any of them.">
      {body}
    </SettingsSection>
  )
}
