import { expect } from "@playwright/test"

/**
 * A finger's target. Every control a phone check holds to a finger is at least 44 CSS px on the side that binds
 * (app/phone.css F3; WCAG 2.5.5's 44 px). A computer's row keeps its own, smaller bar, passed as `bar`.
 */
export const TOUCH_PX = 44

/**
 * Layout reports sizes in fractions of a pixel: an h-11 box can read 43.99994 px when a font lands late or the
 * machine is busy (V-319: projectPlan's Clear, once in three runs under load; csvImport's select every time). So
 * every bar is compared to a hundredth of a pixel: a float a hair under the bar passes, and a box drawn short fails.
 */
export const PX_TOLERANCE = 0.01

/** Whether `px` reaches `bar` (a finger's 44 px unless named), read to PX_TOLERANCE. No size (no box) never does. */
export function reachesTouch(px: number | null | undefined, bar: number = TOUCH_PX): boolean {
  return typeof px === "number" && px >= bar - PX_TOLERANCE
}

/**
 * Expects `px` to reach `bar` (a finger's 44 px unless named), read to PX_TOLERANCE, so no spec's bar trips on a
 * float. `what` names the control in the failure message. No size (no box) fails.
 */
export function expectTouchSize(px: number | null | undefined, what = "a touch target", bar: number = TOUCH_PX): void {
  expect(px ?? Number.NaN, `${what}: ${px} px against ${bar}`).toBeGreaterThanOrEqual(bar - PX_TOLERANCE)
}
