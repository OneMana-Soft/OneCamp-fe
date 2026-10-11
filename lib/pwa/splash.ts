/**
 * The installed app's launch screen on iOS (design v3, mobile: PWA polish).
 *
 * iOS shows an apple-touch-startup-image while a home-screen app starts, and
 * without one it shows white, which in dark mode is a white flash before a
 * dark app. Each image must match the device's screen exactly, so there is
 * one per current iPhone size, in light and dark.
 *
 * They are the frame's colour and nothing else (--frame: #F3F4F6, #0B0C0E):
 * the app's own splash (shell L1) paints only the frame for its first 150ms
 * and then draws the ring, so a launch image with the ring on it would show
 * the ring, lose it, and draw it again. This way the launch runs straight into
 * the splash with no seam.
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
