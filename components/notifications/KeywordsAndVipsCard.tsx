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
 *
 * V-703: each save is a keepalive request sent the moment the change is made,
 * so a reload or a closed tab straight after can't cut it off. A new word's
 * chip says Saving until the server answers; one that didn't save stays beside
 * the kept list as Not saved, and letting it go sends nothing. No later change
 * sends it (CR-345): only Try again does, offered for a save that got no
 * answer; a word the server refused (a 4xx) would be refused again, so it
 * keeps the server's reason beside it and offers only letting it go.
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
import { reasonOf, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { browserFetch } from "@/lib/http/browserFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { PERSONAL_ALERT_PATHS } from "@/hooks/useMyKeywords"
import type { UserProfileInterface } from "@/types/user"
import { listOnceRead } from "@/lib/utils/listOf"

/** The most of each the server keeps (business/PersonalAlert). */
const MAX_KEYWORDS = 50
const MAX_VIPS = 300

type List<T> = { data: T[] | null }

/** How a save ended: kept, or not, with the server's reason when it refused outright. */
type SaveEnd = { held: boolean; refusal?: string }

/**
 * The server's reason when it refused the save outright: a 4xx, which the same
 * list meets again. None for no answer, a 5xx, a timeout (408) or too many
 * at once (429), where the same save may hold on Try again.
 */
function refusalOf(err: unknown): string | undefined {
  const status = (err as { response?: { status?: number } } | undefined)?.response?.status
  return status && status >= 400 && status < 500 && status !== 408 && status !== 429 ? reasonOf(err) : undefined
}

/** A word a save didn't keep; a refused one carries the server's reason. */
type Unsaved = { word: string; refusal?: string }

/**
 * A save sent as a keepalive fetch, so a reload or a closed tab straight after
 * can't cut it off (V-703); the API client's own refresh and errors still hold.
 */
const OUTLIVES_THE_PAGE = { ...OWN_ERRORS, adapter: browserFetch, fetchOptions: { keepalive: true } } as const

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
  ): Promise<SaveEnd> => {
    const mutate = req.mutate as (d: List<T>, o: { revalidate: boolean }) => Promise<unknown>
    void mutate({ data: next }, { revalidate: false })
    let kept: T[] | undefined
    let refusal: string | undefined
    const held = await run(
      async () => {
        try {
          const res = await axiosInstance.put<List<T>>(path, bodyOf(next), OUTLIVES_THE_PAGE)
          kept = res?.data?.data ?? undefined
        } catch (err) {
          refusal = refusalOf(err)
          throw err
        }
      },
      { what, undo: () => save(req, path, kept ?? next, was, bodyOf, run, what) },
    )
    void mutate({ data: held ? (kept ?? next) : was }, { revalidate: false })
    return { held, refusal }
  }

  /** Words sent and not yet answered, and words a save didn't keep (beside the kept list until let go). */
  const [kwSaving, setKwSaving] = React.useState<string[]>([])
  const [kwUnsaved, setKwUnsaved] = React.useState<Unsaved[]>([])
  const unsavedWords = kwUnsaved.map((u) => u.word)
  const shownKeywords = keywords && [...keywords, ...unsavedWords.filter((k) => !keywords.includes(k))]
  /** Sends the kept list with next's change; a word it adds that doesn't hold stays as Not saved. */
  const sendKeywords = async (kept: string[], next: string[]) => {
    const added = next.filter((k) => !kept.includes(k))
    setKwSaving((s) => [...s, ...added])
    const end = await save(kw, PERSONAL_ALERT_PATHS.keywords, kept, next, (l) => ({ keywords: l }), kwSave.run, listWords("Keyword", kept, next, (k) => k))
    setKwSaving((s) => s.filter((k) => !added.includes(k)))
    if (!end.held) setKwUnsaved((s) => [...s.filter((u) => !added.includes(u.word)), ...added.map((word) => ({ word, refusal: end.refusal }))])
  }
  /** A change to the shown list: its PUT leaves every Not saved word out, and they stay shown as Not saved. */
  const changeKeywords = (shown: string[]) => {
    if (!keywords) return
    const next = shown.filter((k) => keywords.includes(k) || !unsavedWords.includes(k))
    const stays = kwUnsaved.filter((u) => shown.includes(u.word))
    setKwUnsaved(stays)
    // Letting go of a word that never saved touches nothing on the server.
    if (next.length === keywords.length && next.every((k) => keywords.includes(k))) {
      if (stays.length === 0) kwSave.clear()
      return
    }
    void sendKeywords(keywords, next)
  }
  /** Try again: the words that got no answer, sent with the kept list; a refused one stays as it is. */
  const retryKeywords = () => {
    if (!keywords) return
    const again = kwUnsaved.filter((u) => !u.refusal).map((u) => u.word)
    setKwUnsaved((s) => s.filter((u) => u.refusal))
    void sendKeywords(keywords, [...keywords, ...again.filter((k) => !keywords.includes(k))])
  }
  // The server's reasons for the refused words, unless the row says them already.
  const refusals = [...new Set(kwUnsaved.flatMap((u) => (u.refusal ? [u.refusal] : [])))].join(" ")

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
              value={shownKeywords ?? keywords}
              max={MAX_KEYWORDS}
              minLength={2}
              maxLength={64}
              placeholder="Add a word or short phrase…"
              saving={kwSaving}
              unsaved={unsavedWords}
              onRetry={kwUnsaved.some((u) => !u.refusal) ? retryKeywords : undefined}
              unsavedWhy={refusals && refusals !== kwSave.status.error ? refusals : undefined}
              onChange={changeKeywords}
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

// The notifications settings' one lazy chunk (main, 9 Nov): Send me a test's section and the "why" panel behind both
// its doors, the Inbox's too, ride it rather than a chunk of their own (A4 H3).
export { NotifyTestSection } from "@/components/notifications/SendMeATest"
export { WhyRecordPanel } from "@/components/notifications/NotifyWhyPanel"
