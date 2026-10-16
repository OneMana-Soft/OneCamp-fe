import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// A status, set and cleared on a computer and on a phone: an emoji picked in
// the picker (a plain one, one that comes in skin tones, one joined from
// three by a ZWJ, a flag), your own words, and when it clears. The picker
// offers no skin tones, so a status keeps the emoji's id and shows its
// default; a workspace's own emoji have no store, so the picker offers none.
// "Clear after → Custom" closed the whole menu on a computer: the date
// picker it opened took the focus from the popover.

type Sent = { path: string; body: Record<string, string> | null }

const EMOJI = [
  { search: "pizza", title: "Pizza", glyph: "🍕", id: "pizza", words: "Pizza Friday" },
  { search: "waving", title: "Waving Hand", glyph: "👋", id: "wave", words: "Back at 3" },
  { search: "technologist", title: "Woman Technologist", glyph: "👩‍💻", id: "female-technologist", words: "Shipping the release" },
  { search: "india", title: "India Flag", glyph: "🇮🇳", id: "flag-in", words: "Working from Pune" },
]

async function app(page: Page, testInfo: TestInfo): Promise<Sent[]> {
  const sent: Sent[] = []
  await stubBackend(page, testInfo, {
    "/user/updateStatusEmojiStatus": { msg: "status updated", status: "success" },
    "/user/clearUserEmojiStatus": { msg: "status cleared", status: "success" },
    "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
  })
  page.on("request", (r) => {
    if (r.method() === "POST" && /EmojiStatus/i.test(r.url())) sent.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() })
  })
  // The keyboard tip rises six seconds in, once, on a computer, and takes the
  // focus from the status menu, which closes; it is not what this is about.
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
  return sent
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  const openStatus = async (page: Page) => {
    await page.getByRole("button", { name: "Profile and settings" }).first().click({ timeout: 120_000 })
    // The status field in the menu reads "Set a status", or the status set.
    await page.locator('[role="menuitem"]').filter({ hasText: /Set a status|Pizza Friday|Back at 3|Shipping the release|Working from Pune|Out for the afternoon/ }).first().click()
    await expect(page.locator("[data-status-popover]")).toBeVisible({ timeout: 60_000 })
  }
  const shownStatus = async (page: Page) => {
    await page.getByRole("button", { name: "Profile and settings" }).first().click()
    const chip = page.locator("[data-account-status]")
    const text = (await chip.count()) ? await chip.textContent() : ""
    await page.keyboard.press("Escape")
    return text
  }

  test("sets a status with each kind of emoji, a custom time, and clears it", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const sent = await app(page, testInfo)

    for (const e of EMOJI) {
      await openStatus(page)
      await page.getByRole("button", { name: "Choose a status emoji" }).click()
      await page.getByRole("textbox", { name: "Search emoji" }).fill(e.search)
      await page.locator(`button[title="${e.title}"]`).first().click()
      await expect(page.getByRole("button", { name: "Choose a status emoji" })).toHaveText(e.glyph)
      await page.getByRole("textbox", { name: "Status" }).fill(e.words)
      await page.getByRole("button", { name: /^(Set status|Save)$/ }).click()
      await expect.poll(() => sent.at(-1)?.body?.emoji_id).toBe(e.id)
      expect(sent.at(-1)?.body?.emoji_status_desc).toBe(e.words)
      await expect.poll(() => shownStatus(page)).toBe(`${e.glyph}${e.words}`)
    }

    // Clear after → Custom: the date picker opens over the menu, which stays.
    await openStatus(page)
    await page.getByRole("textbox", { name: "Status" }).fill("Out for the afternoon")
    await page.getByRole("radio", { name: "Custom" }).click()
    const picker = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Set expiration" }) })
    await expect(picker).toBeVisible()
    await expect(page.locator("[data-status-popover]")).toBeVisible()
    await picker.getByRole("button", { name: "Set expiration" }).click()
    await expect(page.locator('[data-clear-after="custom"]')).toHaveText(/^Until /)
    await page.getByRole("button", { name: "Save" }).click()
    await expect.poll(() => sent.at(-1)?.body?.emoji_expiry_time_in).toBe("custom")
    expect(Number(sent.at(-1)?.body?.emoji_expiry_time_at)).toBeGreaterThan(Date.now() / 1000)

    // Clear.
    await openStatus(page)
    await page.getByRole("button", { name: "Clear status" }).click()
    await expect.poll(() => sent.at(-1)?.path).toBe("/user/clearUserEmojiStatus")
    await expect.poll(() => shownStatus(page)).toBe("")
  })
})

test.describe("on a phone", () => {
  // The public web's account sheet on a phone shows the status but has no
  // row to set it yet (the private web added it later), so this way in
  // isn't here to drive.
  test.skip(true, "the phone account sheet has no status row on the public web")
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  const openSheet = async (page: Page) => {
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await expect(page.locator("[data-you-status]")).toBeVisible({ timeout: 60_000 })
  }
  const shownStatus = async (page: Page) => {
    await openSheet(page)
    const line = (await page.locator("[data-you-status]").textContent()) ?? ""
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-you-status]")).toBeHidden()
    return line
  }

  test("sets a status with each kind of emoji, and clears it", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    const sent = await app(page, testInfo)

    for (const e of EMOJI) {
      await openSheet(page)
      await page.getByRole("button", { name: /^(Set a status|Change your status)$/ }).click()
      const field = page.getByRole("textbox", { name: "Status" })
      await expect(field).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Choose a status emoji" }).click()
      await page.getByPlaceholder("Search", { exact: true }).fill(e.search)
      await page.getByRole("button", { name: e.glyph, exact: true }).first().click()
      await expect(page.getByRole("button", { name: "Choose a status emoji" })).toHaveText(e.glyph)
      await field.fill(e.words)
      // The sheet's "Clear after" chips take a finger's 44px.
      for (const chip of await page.locator("[data-clear-after]").all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await page.getByRole("button", { name: /^(Set status|Save)$/ }).click()
      await expect.poll(() => sent.at(-1)?.body?.emoji_id).toBe(e.id)
      await expect.poll(() => shownStatus(page)).toContain(e.words)
    }

    await openSheet(page)
    await page.getByRole("button", { name: "Change your status" }).click()
    await page.getByRole("button", { name: "Clear status" }).click()
    await expect.poll(() => sent.at(-1)?.path).toBe("/user/clearUserEmojiStatus")
    await expect.poll(() => shownStatus(page)).not.toContain("Working from Pune")
  })
})
