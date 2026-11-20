"use client"

/**
 * Push to my phone while I'm in OneCamp (A4 H4, slack TN-87): the person's own
 * preference notify.push_delay, in minutes: 0, 1, 5 or 10 (the server's
 * allowlist), 1 when never set. While OneCamp is open on one of their devices,
 * the desktop notice shows at once and the push waits this long; it isn't sent
 * if they read the message first. Read and saved through the one preferences
 * hook: a choice shows at once and is offered back; refused or offline, it goes
 * back and the row says why. The picker is the shared Select (a drawer on a
 * phone), loaded through the Select's own phone-sheet chunk
 * (components/ui/selectSheet): the page's first load stays under its line, and
 * no new chunk group reaches the Select, so the build keeps the chunks it cut
 * without this row (app/firstLoad.test.ts).
 */

import { SettingRow, SettingsCardError, SettingsList, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { Skeleton } from "@/components/ui/skeleton"
import { useFetch } from "@/hooks/useFetch"
import { lazyView } from "@/lib/lazy/lazyView"
import { KEY as PREFERENCES, usePreference, type Preferences } from "@/lib/preferences/usePreference"

const Picker = lazyView(() => import("@/components/ui/selectSheet"))

const KEY = "notify.push_delay"
/** The server's default, shown until the person chooses. */
const DEFAULT_MINUTES = 1
const CHOICES = [
  { value: "0", words: "Right away" },
  { value: "1", words: "After 1 minute" },
  { value: "5", words: "After 5 minutes" },
  { value: "10", words: "After 10 minutes" },
]
const LABEL = "Push to my phone while I'm in OneCamp"
const wordsOf = (minutes: number) => CHOICES.find((c) => c.value === String(minutes))?.words ?? `After ${minutes} minutes`

export function PushDelaySection() {
  const [minutes, set] = usePreference<number>(KEY)
  // How the hook's request stands (the same request, read once), for the row's
  // shape while it loads and its Try again when it fails: the hook stays as
  // small as every page that loads it needs.
  const read = useFetch<{ data?: Preferences }>(PREFERENCES)
  const state = read?.data?.data ? "read" : read?.isError ? "failed" : "loading"
  const { status, run } = useSaveStatus()
  const shown = typeof minutes === "number" ? minutes : DEFAULT_MINUTES
  const choose = (next: number, before: number): Promise<boolean> =>
    run(() => set(next), { what: `Push to my phone: ${wordsOf(next)}`, undo: () => choose(before, next) })
  let body: React.ReactNode
  if (state === "loading") body = <SettingsRowsSkeleton rows={1} control="button" />
  else if (state === "failed") body = <SettingsCardError what="your push setting" onRetry={() => void read?.mutate()} />
  else
    body = (
      <SettingRow
        label={LABEL}
        description="While you're in OneCamp, a push waits this long and is skipped if you read it first."
        controlId="push_delay"
        status={status}
      >
        <Picker.View
          fallback={<Skeleton aria-hidden="true" className="h-11 w-44 rounded-md md:h-8 pointer-coarse:h-11" />}
          render={(m) => (
            <m.Select value={String(shown)} onValueChange={(v) => void choose(Number(v), shown)} disabled={status.state === "saving"}>
              <m.SelectTrigger id="push_delay" aria-label={LABEL} aria-describedby="push_delay-desc" className="w-44">
                <m.SelectValue />
              </m.SelectTrigger>
              <m.SelectContent>
                {CHOICES.map((c) => (
                  <m.SelectItem key={c.value} value={c.value}>
                    {c.words}
                  </m.SelectItem>
                ))}
              </m.SelectContent>
            </m.Select>
          )}
        />
      </SettingRow>
    )
  return (
    <SettingsSection id="notifications-push" title="Push" description="When a push reaches your phone.">
      <SettingsList>{body}</SettingsList>
    </SettingsSection>
  )
}
