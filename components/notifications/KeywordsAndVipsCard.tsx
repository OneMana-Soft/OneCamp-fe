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
import { listOnceRead } from "@/lib/utils/listOf"

/** The most of each the server keeps (business/PersonalAlert). */
const MAX_KEYWORDS = 50
const MAX_VIPS = 300

type List<T> = { data: T[] | null }

/** The toast's words for a list that gained or lost one item: "Keyword added: launch". */
function listWords<T>(noun: string, was: T[], next: T[], name: (t: T) => string, key: (t: T) => string = name): string {
  const had = new Set(was.map(key))
  const has = new Set(next.map(key))
  const added = next.filter((t) => !had.has(key(t)))
  const [one, ...more] = [...added, ...was.filter((t) => !has.has(key(t)))]
  if (!one || more.length) return `${noun}s changed`
  return `${noun} ${added.length ? "added" : "removed"}: ${name(one)}`
}

export function KeywordsAndVipsCard() {
  const kw = useFetch<List<string>>(PERSONAL_ALERT_PATHS.keywords)
  const vip = useFetch<List<PickedPerson>>(PERSONAL_ALERT_PATHS.vips)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = self.data?.data?.user_uuid
  const kwSave = useSaveStatus()
  const vipSave = useSaveStatus()

  const keywords = listOnceRead<List<string>, string>(kw.data, (a) => a.data)
  const vips = listOnceRead<List<PickedPerson>, PickedPerson>(vip.data, (a) => a.data)

  /**
   * Shows next at once, sends it, and keeps the server's answer or puts the
   * list back. A change that held is offered back: the old list, sent again.
   */
  const save = async <T, B>(
    req: typeof kw | typeof vip,
    path: string,
    was: T[],
    next: T[],
    bodyOf: (list: T[]) => B,
    run: ReturnType<typeof useSaveStatus>["run"],
    what: string,
  ): Promise<boolean> => {
    const mutate = req.mutate as (d: List<T>, o: { revalidate: boolean }) => Promise<unknown>
    void mutate({ data: next }, { revalidate: false })
    let kept: T[] | undefined
    const held = await run(
      async () => {
        const res = await axiosInstance.put<List<T>>(path, bodyOf(next), OWN_ERRORS)
        kept = res?.data?.data ?? undefined
      },
      { what, undo: () => save(req, path, kept ?? next, was, bodyOf, run, what) },
    )
    void mutate({ data: held ? (kept ?? next) : was }, { revalidate: false })
    return held
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
      ) : keywords === undefined || vips === undefined ? (
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
              onChange={(next) =>
                void save(kw, PERSONAL_ALERT_PATHS.keywords, keywords, next, (l) => ({ keywords: l }), kwSave.run, listWords("Keyword", keywords, next, (k) => k))
              }
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
              onChange={(next) => {
                const capped = next.slice(0, MAX_VIPS)
                const words = listWords("VIP", vips, capped, (p) => p.name, (p) => p.uuid)
                void save(vip, PERSONAL_ALERT_PATHS.vips, vips, capped, (l) => ({ vips: l.map((p) => p.uuid) }), vipSave.run, words)
              }}
            />
          </SettingRow>
        </SettingsList>
      )}
    </SettingsSection>
  )
}
