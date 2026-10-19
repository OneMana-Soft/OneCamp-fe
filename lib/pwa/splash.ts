/**
 * The installed app's launch screen on iOS (design v3, mobile: PWA polish).
 *
 * iOS shows an apple-touch-startup-image while a home-screen app starts, and
 * without one it shows white, which in dark mode is a white flash before a
 * dark app. Each image must match the device's screen exactly, so there is
 * one per current iPhone size, in light and dark.
 *
 * They are the ground the app starts on and nothing else (lib/pwa/grounds:
 * an iPhone's is the sheet, #FFFFFF and #131416, as the phone's app is the
 * sheet edge to edge): the splash's glow and scene arrive on that ground from
 * its first paint, so a launch image with the ring on it would show the ring,
 * lose it, and assemble it again. Flat, the launch runs straight into the
 * splash with no seam. scripts/generate-launch-screens.mjs writes them from
 * the tokens; lib/pwa/grounds.test.ts holds them to it.
 */
export interface SplashDevice {
  /** CSS px, portrait. */
  width: number
  height: number
  ratio: 2 | 3
}

export const SPLASH_DEVICES: SplashDevice[] = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
  { width: 430, height: 932, ratio: 3 }, // 14/15 Pro Max, 15/16 Plus
  { width: 428, height: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 16
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { width: 375, height: 667, ratio: 2 }, // SE
]

export function splashLinks(): { href: string; media: string }[] {
  return SPLASH_DEVICES.flatMap(({ width, height, ratio }) =>
    (["light", "dark"] as const).map((scheme) => ({
      href: `/splash/${scheme}-${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
    })),
  )
}
