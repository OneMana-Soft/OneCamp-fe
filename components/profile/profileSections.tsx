"use client"

import { lazyPart } from "@/lib/lazy/lazyPart"

// Your profile's parts that save as they change (the theme and accent, the
// calendar, sign-in and security): 197 KB of source the press on Settings
// fetched with the page. A chunk of their own, which the shell warms once the
// first screen has settled (SidebarFoot), so the press fetches the details
// alone (fluid-14). A jump to one of them waits for it (hooks/useJumpFlash).

/** Their room while their code comes: three cards' worth, so the page doesn't jump. */
function Coming() {
  return <div role="status" aria-label="Loading appearance, calendar and sign-in" aria-busy="true" className="min-h-[640px]" />
}

/** Their code couldn't come: said in their place, as the invite form says it, with a way to try again. */
function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-ui-sm text-ink-2">
      Couldn&apos;t open appearance, calendar and sign-in. Check your connection.
      <button type="button" onClick={retry} className="font-medium text-brand-text underline-offset-[3px] hover:underline">
        Try again
      </button>
    </div>
  )
}

export const profileSections = lazyPart(() => import("./ProfileSettingsSections").then((m) => m.ProfileSections), {
  placeholder: Coming,
  failed: Failed,
})

/** Fetches their code ahead of the press: for the shell, once the first screen has settled. */
export const warmProfileSections = profileSections.warm
