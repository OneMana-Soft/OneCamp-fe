import { expect, test, type Page } from "@playwright/test"

import { JONAS, LAUNCH, MAYA, ME, VIEWS, channel, openChannel } from "./channelPage"
import { SHOT_THEMES, reviewShot, withStatus } from "./stubbedApp"

// A channel's members and check-ins that couldn't be read say so in place,
// with Try again (chat Q5), in a real browser with no backend: the members
// keep the channel's own count, never "· 0", the check-ins offer nothing to
// set up, and the press reads them. With SHOTS=<dir> each failed read and its
// retry are saved at 1280 and 390, light and dark.

const PRESSED = "data-pressed-try-again"

/**
 * A 500 until the page's own Try again is pressed, then `ok`. SWR retries a
 * failed read on its own every few seconds, so a flag the test set just
 * before pressing could hand `ok` to one of those retries instead, and the
 * button would be gone before the press; the page's click turns it.
 */
function failsUntilPressed(tab: Page, ok: unknown) {
  return async () => ((await tab.evaluate((attr) => document.documentElement.hasAttribute(attr), PRESSED)) ? ok : withStatus(500, { msg: "Internal Server Error" }))
}

/** Marks the page once its own Try again is pressed (failsUntilPressed). */
function markTryAgain(tab: Page) {
  return tab.addInitScript((attr) => {
    document.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("button")?.textContent?.includes("Try again")) document.documentElement.setAttribute(attr, "")
    }, true)
  }, PRESSED)
}

for (const view of VIEWS) {
  for (const scheme of SHOT_THEMES) {
    test(`at ${view.name}, ${scheme}: members that couldn't be read say so under the channel's own count, and Try again reads them`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const tab = await openChannel(browser, testInfo, view, scheme, (t) => ({
        [`/ch/channelInfoWithMemberAdminFlag/${LAUNCH}`]: failsUntilPressed(t, { msg: "ok", channel_info: { ...channel, ch_members: [MAYA, JONAS, ME] } }),
        "/user/usersListNotBelongToChannelId": { msg: "ok", users: [] },
        [`/conversations/channel/${LAUNCH}/broadcasts`]: { msg: "ok", data: { members_may: true, own: false, manages: true } },
        "/guest/links": { msg: "ok", data: [] },
      }), markTryAgain)
      if (view.phone) {
        await tab.getByRole("button", { name: "Channel options" }).click()
        await tab.getByRole("button", { name: "Details and members" }).click()
      } else {
        await tab.getByRole("button", { name: "Channel details" }).click()
      }
      const members = tab.getByRole("region", { name: "Members · 3" })
      const failed = members.getByText("Couldn't load the members")
      await expect(failed).toBeVisible({ timeout: 30_000 })
      await expect(tab.getByRole("region", { name: "Members · 0" })).toHaveCount(0)
      await expect(members.getByText("No members yet")).toHaveCount(0)
      await failed.scrollIntoViewIfNeeded()
      await reviewShot(tab, "q5-members-failed", scheme)
      await members.getByRole("button", { name: "Try again" }).click()
      await expect(members.getByText("Maya Chen")).toBeVisible()
      await expect(failed).toHaveCount(0)
      await reviewShot(tab, "q5-members-retried", scheme)
      await tab.context().close()
    })

    test(`at ${view.name}, ${scheme}: check-ins that couldn't be read say so with nothing to set up, and Try again reads them`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const tab = await openChannel(browser, testInfo, view, scheme, (t) => ({
        [`/ch/${LAUNCH}/checkins`]: failsUntilPressed(t, { msg: "ok", data: { checkins: [], can_edit: true } }),
      }), markTryAgain)
      if (view.phone) {
        await tab.getByRole("button", { name: "Channel options" }).click()
        await tab.getByRole("button", { name: "Check-ins" }).click()
      } else {
        await tab.getByRole("button", { name: "More channel actions" }).click()
        await tab.getByRole("menuitem", { name: "Check-ins" }).click()
      }
      const dialog = tab.getByRole("dialog", { name: "Check-ins" })
      await expect(dialog.getByText("Couldn't load check-ins")).toBeVisible({ timeout: 30_000 })
      await expect(dialog.getByRole("button", { name: "New check-in" })).toHaveCount(0)
      await reviewShot(tab, "q5-checkins-failed", scheme)
      await dialog.getByRole("button", { name: "Try again" }).click()
      await expect(dialog.getByRole("button", { name: "New check-in" })).toBeVisible()
      await expect(dialog.getByText("Couldn't load check-ins")).toHaveCount(0)
      await reviewShot(tab, "q5-checkins-retried", scheme)
      await tab.context().close()
    })
  }
}
