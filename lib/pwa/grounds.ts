/**
 * The ground the app starts on, light and dark: what every start screen is
 * painted on before the app takes over (design v3; the splash, 17 Oct 2026).
 *
 * A phone's app is the sheet edge to edge (its top bar and pages are the
 * sheet's colour), so a phone starts on the sheet; from 640px the app is the
 * frame with the sheet on it, so a wider screen starts on the frame. Every
 * start surface uses these four values, so none of them can flash a colour
 * the next one doesn't have:
 *   - the browser's bar before the app has run (app/layout's theme-color
 *     metas, and the boot script's exact pick: lib/appBoot);
 *   - the installed app's launch screen: iOS's startup images and Android's
 *     manifest colours (scripts/generate-launch-screens.mjs writes both);
 *   - the splash itself (globals.css, .splash: the sheet under 640px);
 *   - the desktop app's window (onecamp-desktop, the frame).
 *
 * They are the tokens --sheet and --frame (app/globals.css), written out
 * because a launch image, a manifest and a script that runs before the
 * stylesheet can't read a custom property. grounds.test.ts holds them equal
 * to the tokens, and every generated asset equal to them.
 */
export const GROUND = {
  light: { phone: "#ffffff", wide: "#f3f4f6" },
  dark: { phone: "#131416", wide: "#0b0c0e" },
} as const

/** Below this width the app is the phone's (MediaQueryContext's isMobile, Tailwind's sm). */
export const PHONE_MAX_PX = 639

/** The ground for a mode and a width. Pure. */
export function groundFor(dark: boolean, width: number): string {
  const scheme = dark ? GROUND.dark : GROUND.light
  return width <= PHONE_MAX_PX ? scheme.phone : scheme.wide
}

/**
 * The browser bar's colour before any code has run, as theme-color metas the
 * browser picks from by media query, first match wins: dark, then the rest.
 * A phone's: it is a phone's bar that shows (a desktop browser's mostly
 * doesn't), and on an app address the boot script sets the exact ground
 * before the first paint anyway. ThemeColorMeta then keeps every one on the
 * chrome the person is looking at, in the mode chosen in the app.
 */
export const THEME_COLOR_METAS: { media?: string; color: string }[] = [
  { media: "(prefers-color-scheme: dark)", color: GROUND.dark.phone },
  { color: GROUND.light.phone },
]
