import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// A status, set and cleared on a computer and on a phone: an emoji picked in
// the picker (a plain one, one that comes in skin tones, one joined from
// three by a ZWJ, a flag), your own words, and when it clears. The picker
// offers no skin tones, so a status keeps the emoji's id and shows its
// default; a workspace's own emoji have no store, so the picker offers none.
// "Clear after → Custom" closed the whole menu on a computer: the date
// picker it opened took the focus from the popover. Custom is a day and a
// time in the status itself now, each the shared field: a popover by it on a
// computer, a panel of the status sheet on a phone (components/ui/drawer).

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
    // Closed with a click away from it, at the top right. Escape went to any
    // toast that came in after the menu opened (Radix gives it to the newest
    // layer), so the menu stayed and hid the page from the next step.
    await page.mouse.click(1270, 10)
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

    // Clear after → Custom: the day and the time in the menu, whose time
    // picker opens by its field and leaves the menu open.
    await openStatus(page)
    await page.getByRole("textbox", { name: "Status" }).fill("Out for the afternoon")
    await page.getByRole("radio", { name: "Custom" }).click()
    await expect(page.locator("[data-status-custom]")).toBeVisible()
    await page.getByRole("button", { name: /^Clears at/ }).click()
    const times = page.getByRole("listbox", { name: "Time" })
    await expect(times).toBeVisible()
    await expect(page.locator("[data-status-popover]")).toBeVisible()
    await times.locator("[aria-selected='true']").click()
    await expect(times).toBeHidden()
    await expect(page.locator("[data-status-popover]")).toBeVisible()
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
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  const openSheet = async (page: Page) => {
    await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
    await expect(page.locator("[data-you-status]")).toBeVisible({ timeout: 60_000 })
  }
  const shownStatus = async (page: Page) => {
    await openSheet(page)
    const line = (await page.locator("[data-you-status]").textContent()) ?? ""
    // Closed as a finger closes it: a tap on the dimmed page above the sheet,
    // in the top 8% a large sheet leaves. Escape went to any toast that came
    // in after the sheet opened (Radix gives it to the newest layer), so the
    // sheet stayed and the poll ran out.
    await page.locator("[data-v3-scrim]").last().tap({ position: { x: 195, y: 24 } })
    await expect(page.locator("[data-you-status]")).toBeHidden()
    return line
  }

  test("sets a status with each kind of emoji, a custom end, and clears it", async ({ page }, testInfo) => {
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

    // Clear after → Custom, in the sheet: the time is a panel of it, with Back.
    await openSheet(page)
    await page.getByRole("button", { name: "Change your status" }).click()
    await page.getByRole("radio", { name: "Custom" }).click()
    await page.getByRole("button", { name: /^Clears at/ }).click()
    const times = page.getByRole("listbox", { name: "Time" })
    await expect(times).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
    await times.locator("[aria-selected='true']").click()
    await expect(times).toBeHidden()
    await page.getByRole("button", { name: "Save" }).click()
    await expect.poll(() => sent.at(-1)?.body?.emoji_expiry_time_in).toBe("custom")
    expect(Number(sent.at(-1)?.body?.emoji_expiry_time_at)).toBeGreaterThan(Date.now() / 1000)

    await openSheet(page)
    await page.getByRole("button", { name: "Change your status" }).click()
    await page.getByRole("button", { name: "Clear status" }).click()
    await expect.poll(() => sent.at(-1)?.path).toBe("/user/clearUserEmojiStatus")
    await expect.poll(() => shownStatus(page)).not.toContain("Working from Pune")
  })
})
