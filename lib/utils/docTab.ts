// Which docs tab to open.
//
// The list used to open on Private every time. A new member, or anyone whose
// docs are all shared, landed on an empty tab showing only "Blank document",
// with the team's docs one tap away behind Public. Now a tab named in the URL
// wins; otherwise Private opens only when it has something in it.

export const DOC_TABS = ["private", "public"] as const
export type DocTab = (typeof DOC_TABS)[number]

export function isDocTab(v: unknown): v is DocTab {
  return typeof v === "string" && (DOC_TABS as readonly string[]).includes(v)
}

/** The tab to show. privateCount is undefined while it is still loading. Pure. */
export function defaultDocTab(urlTab: string | null, privateCount: number | undefined): DocTab {
  if (isDocTab(urlTab)) return urlTab
  return privateCount === 0 ? "public" : "private"
}
