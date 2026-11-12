import { SaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * Outlook off until the admin adds a free Microsoft app (B7), in one line:
 * who turns it on, and for an admin where, as a link to the steps on the
 * Microsoft card in Admin, Integrations (DESIGN-BUILD-117 F1), landing on that
 * card (DESIGN-BUILD-118 F3). The Calendars
 * panel and the phone's options both say it.
 */
export function OutlookOff({ admin }: { admin: boolean }) {
  if (!admin) return <>Your admin turns Outlook on by adding a free Microsoft app.</>
  return (
    <>
      Add a free Microsoft app in{" "}
      <a href="/app/admin?tab=integrations#integrations-oauth-microsoft" className="rounded-sm font-medium text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
        Admin, Integrations<span aria-hidden="true"> →</span>
      </a>
    </>
  )
}

/**
 * Outlook's link couldn't be read (CR-B22 G1), in one quiet line, said as the
 * panel's other reads say theirs: SaysLoadFailure keeps the failed read's
 * toast quiet while the line is on screen.
 */
export function OutlookUnloaded() {
  return (
    <>
      Outlook Calendar couldn&apos;t load
      <SaysLoadFailure />
    </>
  )
}
