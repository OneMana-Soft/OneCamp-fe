/**
 * Whether this is iOS or iPadOS, where every browser is WebKit (Safari, and
 * Chrome, Firefox or Edge in their WebKit coats: CriOS, FxiOS, EdgiOS). An
 * iPad in its desktop mode says it is a Mac, so the sign is touch points with
 * Apple's WebKit and no Chrome, Chromium or Android: a Mac has no touch
 * points, and a touch laptop's browser is Chromium.
 */
export function isAppleTouch(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav || !(nav.maxTouchPoints > 0)) return false
  const ua = nav.userAgent || ""
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua)
}
