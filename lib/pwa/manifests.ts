/**
 * The installed app's manifest in each mode: the same app (one id) on that
 * mode's phone ground (V-322, 2 Nov 2026).
 *
 * Chrome on Android launches an installed app on its manifest's colours and,
 * since August 2026, paints the app's navigation bar with its theme_color. It
 * reads no dark pair from a manifest (the user_preferences member is for a
 * browser that does), so a dark app over the light manifest sat on a white
 * bar. app/layout links the light one, and the boot script (lib/appBoot)
 * links the dark one when the app shows dark, before Chrome reads it: on
 * install, and on its update check (at most daily, as the app finishes
 * loading), which is when an installed app takes new colours; the id keeps
 * it the same app at either address. The light one keeps the address
 * installed apps were made from.
 *
 * Both write these addresses out rather than import them: what the root
 * layout reaches counts on every route's first-load source line, and the
 * boot script is a string. lib/appBoot.test.ts and e2e/splash.spec.ts hold
 * both to these; scripts/generate-launch-screens.mjs writes the files at
 * them, and lib/pwa/grounds.test.ts holds the files to the grounds.
 */
export const MANIFEST = { light: "/manifest.json", dark: "/manifest-dark.json" } as const
