import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { docInfo, stubBackend, withStatus } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"

// The docs quick wins (PROGRAM A0, small-details.md §3) in a real browser, on
// the real doc editor. An empty doc opens its live editor at once (there's no
// saved copy to stand in), and the collaboration socket is silent, so what's
// typed stays in this page.

test.use({ viewport: { width: 1280, height: 900 } })

const EMPTY = "5b8e2c1d-7a4f-4e3b-9d6c-1f2a3b4c5d6e"

async function openEmptyDoc(page: Page, testInfo: TestInfo, title = "Quick wins") {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${EMPTY}`]: docInfo({ doc_uuid: EMPTY, doc_title: title, doc_body: "", edit: true }),
  })
  // A doc is editable once its live session says so (A2's useDocSession), so
  // its collaboration socket is answered, in this process (e2e/docs/collabRelay.ts).
  await new CollabRelay().attach(page, "Sam")
  await page.goto(`/app/doc/${EMPTY}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  // The body: a multi-line textbox named by the doc's title (A6).
  const body = page.getByRole("textbox", { name: title })
  await expect(body).toBeVisible({ timeout: 30_000 })
  return body
}

const mod = process.platform === "darwin" ? "Meta" : "Control"

test("an empty doc's body is a textbox named by its title, and a click in it adds a line at most", async ({ page }, testInfo) => {
  const body = await openEmptyDoc(page, testInfo)
  await expect(body).toHaveAttribute("aria-multiline", "true")
  await expect(body).toHaveAttribute("contenteditable", "true")

  // A click in the middle of the empty body, well below its first line (T8):
  // it made a dozen empty lines down to the click.
  const blocks = () => body.evaluate((el) => el.childElementCount)
  const before = await blocks()
  const box = (await body.boundingBox())!
  const firstLine = (await body.locator(":scope > *").first().boundingBox())!
  const y = box.y + box.height / 2
  expect(y).toBeGreaterThan(firstLine.y + firstLine.height + 100)
  await page.mouse.click(box.x + box.width / 2, y)
  expect(await blocks()).toBeLessThanOrEqual(before + 1)
  // And the caret is in the body: what's typed lands there.
  await page.keyboard.type("Hello")
  await expect(body).toContainText("Hello")
  expect(await blocks()).toBeLessThanOrEqual(before + 1)
})

test("Markdown rules and block keys, as typed", async ({ page }, testInfo) => {
  const body = await openEmptyDoc(page, testInfo)
  await body.click()

  // K12, K15: ~strike~ and [text](address).
  await page.keyboard.type("a ~gone~ and [the brief](example.com/brief) ")
  await expect(body.locator("s")).toHaveText("gone")
  await expect(body.locator("a")).toHaveAttribute("href", "https://example.com/brief")
  // T29: no fractions, ≠ or × while typing.
  await page.keyboard.type("1/2 != 3x4")
  await expect(body.locator("p").first()).toContainText("1/2 != 3x4")

  // S7: ⌘D copies the line under itself, not the browser's bookmark.
  await page.keyboard.press(`${mod}+d`)
  await expect(body.locator(":scope > p", { hasText: "1/2 != 3x4" })).toHaveCount(2)

  // S2: the first ⌘A selects the line, not the page.
  await page.keyboard.press(`${mod}+a`)
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "")
  expect(selected).toContain("1/2 != 3x4")
  expect(selected.split("1/2 != 3x4").length - 1).toBe(1)

  // T30: ⌘Z first undoes the automatic change ("## " back to text).
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.keyboard.type("## ")
  await expect(body.locator("h2")).toHaveCount(1)
  await page.keyboard.press(`${mod}+z`)
  await expect(body.locator("h2")).toHaveCount(0)
  await expect(body).toContainText("## ")

  // K10: three backticks make a code block at once.
  await page.keyboard.press("Enter")
  await page.keyboard.type("```")
  await expect(body.locator("pre")).toHaveCount(1)

  // T16: ⌫ at a later item's start takes the bullet away, in place.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  const items = body.locator("ul > li")
  await page.keyboard.type("- one")
  await page.keyboard.press("Enter")
  await page.keyboard.type("two")
  await expect(items).toHaveCount(2)
  // Pressed as a person would on a busy page, before the browser has told the
  // editor where Home put the caret (CaretFromScreen): it joined the items once.
  await page.keyboard.press("Home")
  await page.keyboard.press("Backspace")
  await expect(items).toHaveCount(1)
  // A line of its own, right under the list (not a second line of "one").
  await expect(body.locator(":scope > ul + p")).toHaveText("two")
})

const GONE = "8c1f3e5a-2b4d-4f6a-8e0c-3d5b7f9a1c2e"

test("a deleted doc says so, with Restore for whom the server says may", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${GONE}`]: withStatus(410, { msg: "This doc was deleted.", deleted: true, can_restore: true }),
    "/doc/restore": { msg: "Restored.", data: { restored: 1, parent_uuid: "" } },
  })
  await page.goto(`/app/doc/${GONE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "This doc was deleted" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("link", { name: "Back to docs" })).toHaveAttribute("href", "/app/doc")
  const restored = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/doc/restore"))
  await page.getByRole("button", { name: "Restore" }).click()
  expect((await restored).postDataJSON()).toEqual({ doc_uuid: GONE })
  // The toast, and its words read out by the live region: either will do.
  await expect(page.getByText("Doc restored").first()).toBeVisible()
})

test("a deleted doc offers no Restore to someone who can't, and 404 and a failed network stay what they were", async ({ page }, testInfo) => {
  const NOT_MINE = "2e4a6c8b-1d3f-4a5c-9e7b-0f2d4b6a8c1e"
  const NOWHERE = "9a7c5e3b-1f2d-4c6e-8a0b-2d4f6b8a0c3e"
  const OFFLINE = "4d6f8b0a-3c5e-4e7a-9b1d-5f7b9d1f3a5c"
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${NOT_MINE}`]: withStatus(410, { msg: "This doc was deleted.", deleted: true, can_restore: false }),
    [`/doc/getDocInfo/${OFFLINE}`]: withStatus(0, null),
  })

  await page.goto(`/app/doc/${NOT_MINE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "This doc was deleted" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0)

  await page.goto(`/app/doc/${NOWHERE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "This doc doesn't exist or was deleted" })).toBeVisible({ timeout: 30_000 })

  await page.goto(`/app/doc/${OFFLINE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "Can't reach the server" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
})
