import { expect, test, type Page, type Request } from "@playwright/test"

import { FIELD_LOOK, disabledPrimaryLook } from "../controlLook"
import { stubBackend, withStatus } from "../stubbedApp"
import { SCHEMES, SCREENS, press, screenUse, type Screen } from "../screens"

/**
 * A published address's cards (docs C6): /p/<slug> asks what the address
 * answers first. A live page opens on the server; a password page, an expired
 * one, an address with no page and a busy one each show on /p's own frame, in
 * the page's own words; signed out, a copy asks for a sign-in. On a computer
 * and on a phone by touch, light and dark; on a phone each card keeps its
 * corners inside the 16px gutter. A room's passcode (calls) is the same shared
 * card with the same lock. SHOTS=<dir> saves each card for review.
 */
const STATES: Record<string, unknown> = {
  "open-page": { data: { state: "live" } },
  "locked-page": { data: { state: "locked" } },
  "old-page": { data: { state: "gone" } },
  "no-page": { data: { state: "missing" } },
  "busy-page": withStatus(429, { msg: "Too many requests" }),
}

/** Opens `path`, finds the card by its heading, checks its place on a phone, and saves it as `shot` under SHOTS. */
async function cardOn(page: Page, screen: Screen, path: string, heading: string, shot: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 60_000 })
  const card = page.locator("[data-paper-card]")
  if (screen.isMobile) {
    const box = await card.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(16)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(screen.width - 16)
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("16px")
  }
  const dir = process.env.SHOTS
  if (dir) await page.screenshot({ path: `${dir}/publish-${shot}.png`, animations: "disabled" })
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("each state of a published address shows on its own card, and a live page opens", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const tried: string[] = []
        await stubBackend(page, testInfo, {
          ...Object.fromEntries(Object.entries(STATES).map(([slug, answer]) => [`/public/p/${slug}/state`, answer])),
          "/public/p/locked-page/unlock": (_url: URL, request: Request) => {
            tried.push(String(request.postDataJSON()?.password ?? ""))
            return withStatus(401, { msg: "Wrong password" })
          },
          "/guest/links/copy": withStatus(401, { msg: "Sign in again." }),
          "/user/profile": withStatus(401, { msg: "Sign in again." }),
          "/refreshToken": withStatus(401, { msg: "Sign in again." }),
        })

        await cardOn(page, screen, "/p/old-page", "This page has expired", `expired-${screen.name}-${scheme}`)
        await cardOn(page, screen, "/p/no-page", "There's no page here", `missing-${screen.name}-${scheme}`)
        await cardOn(page, screen, "/p/copy-page?copy=1", "Sign in to copy this page", `copy-${screen.name}-${scheme}`)

        await cardOn(page, screen, "/p/locked-page", "This page needs a password", `password-${screen.name}-${scheme}`)
        // The one lock a room's passcode shows too (SecretCard's LockTile).
        await expect(page.locator("[data-unlock-tile]")).toBeVisible()
        const open = page.getByRole("button", { name: "Open the page" })
        await expect(open).toBeDisabled()
        // A primary that can't be pressed wears the disabled field's look at full strength, never the brand fill.
        await expect.poll(() => disabledPrimaryLook(open)).toEqual(FIELD_LOOK)
        await page.getByLabel("Password", { exact: true }).fill("not it")
        await press(screen, open)
        await expect(page.getByRole("alert").filter({ hasText: "That password doesn't open this page." })).toBeVisible()
        expect(tried).toEqual(["not it"])
        const dir = process.env.SHOTS
        if (dir) await page.screenshot({ path: `${dir}/publish-password-wrong-${screen.name}-${scheme}.png`, animations: "disabled" })

        await page.goto("/p/open-page", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await page.waitForURL(/\/public\/p\/open-page$/, { timeout: 60_000 })
      })

      test("a room's passcode is the same card and lock, and says a wrong one", async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        await stubBackend(page, testInfo, {
          "/public/r/maya": { data: { state: "locked" } },
          "/public/r/maya/unlock": withStatus(401, { msg: "Wrong passcode" }),
        })
        await cardOn(page, screen, "/r/maya", "This room needs a passcode", `room-passcode-${screen.name}-${scheme}`)
        await expect(page.locator("[data-unlock-tile]")).toBeVisible()
        await page.getByLabel("Passcode", { exact: true }).fill("not it")
        await press(screen, page.getByRole("button", { name: "Continue" }))
        await expect(page.getByRole("alert").filter({ hasText: "That passcode doesn't open this room." })).toBeVisible()
        const dir = process.env.SHOTS
        if (dir) await page.screenshot({ path: `${dir}/publish-room-passcode-wrong-${screen.name}-${scheme}.png`, animations: "disabled" })
      })

      test("a busy page offers Try again, which asks the address again", async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        let asks = 0
        await stubBackend(page, testInfo, {
          "/public/p/busy-page/state": () => {
            asks += 1
            return STATES["busy-page"]
          },
        })
        await cardOn(page, screen, "/p/busy-page", "This page is busy", `busy-${screen.name}-${scheme}`)
        const before = asks
        await press(screen, page.getByRole("button", { name: "Try again" }))
        await expect.poll(() => asks).toBeGreaterThan(before)
        await expect(page.getByRole("heading", { name: "This page is busy" })).toBeVisible({ timeout: 60_000 })
      })
    })
  }
}
