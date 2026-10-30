import type { Locator } from "@playwright/test"

/**
 * The screens a flow is checked on: a computer at 1280, and a phone at 390
 * held by a finger (isMobile, hasTouch), each in light and in dark.
 */
export const SCREENS = [
  { name: "computer", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
] as const

export const SCHEMES = ["light", "dark"] as const

export type Screen = (typeof SCREENS)[number]

/** A screen and a scheme as a test's browser options (test.use). */
export const screenUse = ({ width, height, isMobile, hasTouch }: Screen, colorScheme: (typeof SCHEMES)[number]) => ({ viewport: { width, height }, isMobile, hasTouch, colorScheme })

/** A finger's tap on a touch screen, a click on a computer. */
export const press = (screen: Screen, target: Locator) => (screen.hasTouch ? target.tap() : target.click())
