"use client"

/**
 * Your keywords and VIPs (chat P3 stage 3, TN-53/54/58).
 *
 * Keywords: a channel message that holds one of them, as a whole word in any
 * case, tells you as a mention would, by your level for the channel; the
 * messages you read mark them. VIPs: their messages and mentions reach you
 * through a pause, focus time and quiet hours.
 *
 * Instant, like every setting on the page (design v3, admin S2): each change
 * sends the whole list, which the server answers as kept; the row ticks when
 * it holds, and a refusal puts the list back and says the server's reason on
 * the row, never a toast. The keyword read is the one the message list marks
 * from (hooks/useMyKeywords), so a change shows there at once.
 */

import * as React from "react"
import { KeywordsInput } from "@/components/common/keywordsInput"
import { PeoplePicker, type PickedPerson } from "@/components/common/peoplePicker"
import {
  SettingRow,
  SettingsCardError,
  SettingsList,
  SettingsRowsSkeleton,
  SettingsSection,
} from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { PERSONAL_ALERT_PATHS } from "@/hooks/useMyKeywords"
import type { UserProfileInterface } from "@/types/user"

/** The most of each the server keeps (business/PersonalAlert). */
const MAX_KEYWORDS = 50
const MAX_VIPS = 300

type List<T> = { data: T[] }

export function KeywordsAndVipsCard() {
  const kw = useFetch<List<string>>(PERSONAL_ALERT_PATHS.keywords)
  const vip = useFetch<List<PickedPerson>>(PERSONAL_ALERT_PATHS.vips)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = self.data?.data?.user_uuid
  const kwSave = useSaveStatus()
  const vipSave = useSaveStatus()

  const keywords = kw.data?.data
  const vips = vip.data?.data

  /** Shows next at once, sends it, and keeps the server's answer or puts the list back. */
  const save = async <T, B>(
    req: typeof kw | typeof vip,
    path: string,
    was: T[],
    next: T[],
    body: B,
    run: ReturnType<typeof useSaveStatus>["run"],
  ) => {
    const mutate = req.mutate as (d: List<T>, o: { revalidate: boolean }) => Promise<unknown>
    void mutate({ data: next }, { revalidate: false })
    let kept: T[] | undefined
    const held = await run(async () => {
      const res = await axiosInstance.put<List<T>>(path, body, OWN_ERRORS)
      kept = res?.data?.data
    })
    void mutate({ data: held ? (kept ?? next) : was }, { revalidate: false })
  }

  const failed = kw.isError || vip.isError
  return (
    <SettingsSection
      id="notifications-keywords"
      title="Keywords and VIPs"
      description="Hear about the words you care about, and from the people who matter most."
    >
      {failed ? (
        <SettingsCardError
          what="your keywords and VIPs"
          onRetry={() => {
            void kw.mutate()
            void vip.mutate()
          }}
        />
      ) : !keywords || !vips ? (
        <SettingsRowsSkeleton rows={2} control="field" />
      ) : (
        <SettingsList>
          <SettingRow
            layout="stacked"
            control="field"
            controlId="notify-keywords"
            label="Keywords"
            description="A channel message with one of these words tells you as a mention would. Whole words, any case."
            status={kwSave.status}
          >
            <KeywordsInput
              id="notify-keywords"
              value={keywords}
              max={MAX_KEYWORDS}
              maxLength={64}
              placeholder="Add a word or short phrase…"
              onChange={(next) => void save(kw, PERSONAL_ALERT_PATHS.keywords, keywords, next, { keywords: next }, kwSave.run)}
            />
          </SettingRow>
          <SettingRow
            layout="stacked"
            control="field"
            controlId="notify-vips"
            label="VIPs"
            description="Their messages and mentions reach you through a pause, focus time and quiet hours."
            status={vipSave.status}
          >
            <PeoplePicker
              id="notify-vips"
              value={vips}
              exclude={selfId ? [selfId] : []}
              placeholder={vips.length >= MAX_VIPS ? `You can keep up to ${MAX_VIPS}.` : "Add a person by name"}
              onChange={(next) =>
                void save(vip, PERSONAL_ALERT_PATHS.vips, vips, next.slice(0, MAX_VIPS), { vips: next.slice(0, MAX_VIPS).map((p) => p.uuid) }, vipSave.run)
              }
            />
          </SettingRow>
        </SettingsList>
      )}
    </SettingsSection>
  )
}
