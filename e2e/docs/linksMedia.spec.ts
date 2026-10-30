import { expect, test, type Page } from "@playwright/test"

import { SAM, reviewShot } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs } from "./twoPeople"

// Docs B4 in two browsers (the A1 two-client harness): pasted Markdown becomes
// blocks for both, and one undo gives the pasted text back; a pasted link's
// menu makes a bookmark, its preview read by the workspace's server, or the
// YouTube player; a dropped PDF uploads and reaches the other person. The
// collaboration socket and every API call are answered in this process:
// nothing reaches a real server.

const DOC = "7c2d9e4f-1a3b-4c5d-8e6f-9a0b1c2d3e4f"
const OBJECT = "0d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a"

test.describe.configure({ mode: "serial" })

/** Answers one API path (exactly) with JSON, as the app's backend would, CORS and all. */
async function answer(page: Page, path: string, json: unknown) {
  await page.route(
    (url) => url.pathname.endsWith(path),
    (route) => {
      const origin = route.request().headers()["origin"] || "*"
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": route.request().headers()["access-control-request-headers"] || "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      }
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      return route.fulfill({ status: 200, headers, json })
    },
  )
}

/** Pastes plain text where the caret is, as the browser's paste event carries it. */
async function paste(page: Page, text: string) {
  await page.locator('.doc-editor .ProseMirror[contenteditable="true"]').evaluate((el, t) => {
    const data = new DataTransfer()
    data.setData("text/plain", t)
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

test("pasted Markdown becomes blocks for both, and one undo gives the text back", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await paste(sam.page, "# Launch plan\n\n- Write the notes\n- Record the film\n\nShip on **Friday**.")
  await expect(sam.body.getByRole("heading", { name: "Launch plan" })).toBeVisible()
  await expect(sam.body.locator("li")).toHaveCount(2)
  await expect(sam.body.locator("strong")).toHaveText("Friday")
  await expect(priya.body.getByRole("heading", { name: "Launch plan" })).toBeVisible({ timeout: 15_000 })
  await expect(priya.body.locator("li")).toHaveCount(2)

  // One undo: the blocks go, the text as it was pasted stays (never nothing).
  await sam.page.keyboard.press("Control+z")
  await expect(sam.body.getByRole("heading", { name: "Launch plan" })).toHaveCount(0)
  await expect(sam.body).toContainText("# Launch plan")
  await expect(sam.body).toContainText("Ship on **Friday**.")
  await expect(priya.body).toContainText("# Launch plan", { timeout: 15_000 })
  await expect(priya.body.locator("li")).toHaveCount(0)

  await sam.close()
  await priya.close()
})

test("a pasted link's menu makes a bookmark, its preview read by the workspace's server", async ({ browser }, testInfo) => {
  const url = "https://onemana.dev/blog/launch"
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })
  await answer(sam.page, "/unfurl", { msg: "ok", data: { url, title: "Launch notes", description: "What we shipped", site_name: "OneMana", fetched: true } })

  await sam.body.click()
  await paste(sam.page, url)
  const menu = sam.page.getByRole("listbox", { name: "Paste as" })
  await expect(menu).toBeVisible()
  // A link that isn't a player: Link, Mention and Bookmark, Link first.
  await expect(menu.getByRole("option")).toHaveCount(3)
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true")
  await menu.getByRole("option", { name: /^Bookmark/ }).click()

  const card = sam.body.getByRole("link", { name: /Launch notes/ })
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute("href", url)
  await expect(card).toContainText("What we shipped")
  await expect(priya.body.getByRole("link", { name: /Launch notes/ })).toBeVisible({ timeout: 15_000 })

  await sam.close()
  await priya.close()
})

test("a pasted YouTube link embeds its player, sandboxed, for both", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await paste(sam.page, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  const menu = sam.page.getByRole("listbox", { name: "Paste as" })
  await expect(menu.getByRole("option")).toHaveCount(4)
  await menu.getByRole("option", { name: /^Embed/ }).click()

  const frame = sam.body.locator('iframe[title="YouTube embed"]')
  await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0")
  await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin")
  expect(await frame.getAttribute("sandbox")).not.toMatch(/allow-top-navigation/)
  await expect(priya.body.locator('iframe[title="YouTube embed"]')).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0", { timeout: 15_000 })

  await sam.close()
  await priya.close()
})

// A picture copied from a web page comes as its file and an <img> of it. It
// is one picture: uploaded once, placed once (the file handler answers the
// paste handled, so the HTML isn't pasted as a second one, and ProseMirror's
// own capture doesn't run the paste again).
test("a picture copied from a web page pastes as one image, uploaded once", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  await answer(sam.page, "/uploadFile", { msg: "ok", object_uuid: OBJECT })
  let uploads = 0
  sam.page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/uploadFile")) uploads++
  })

  await sam.body.click()
  await sam.page.locator('.doc-editor .ProseMirror[contenteditable="true"]').evaluate((el) => {
    const data = new DataTransfer()
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0))
    data.items.add(new File([png], "shot.png", { type: "image/png" }))
    data.setData("text/html", '<meta charset="utf-8"><img src="https://example.com/shot.png">')
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  })

  // Image nodes, not <img> tags: an image's view draws its preview and its
  // picture while it loads, and nothing for an address the stub can't serve.
  const images = sam.body.locator(".node-image")
  await expect(images).toHaveCount(1, { timeout: 15_000 })
  await expect.poll(() => uploads, { timeout: 15_000 }).toBe(1)
  // Still one once anything late has had its chance (ProseMirror's capture runs 50 ms on).
  await sam.page.waitForLoadState("networkidle")
  await expect(images).toHaveCount(1)
  expect(uploads).toBe(1)

  // Clicked, the image wears its own outline alone: no block selection's tint around it.
  await images.first().click()
  await expect(images.first().locator(".outline-brand")).toHaveCount(1)
  await expect(sam.body.locator(".block-selected")).toHaveCount(0)
  await reviewShot(sam.page, "image-chosen", "light")

  await sam.close()
})

test("a dropped PDF uploads into the doc and reaches the other person", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })
  await answer(sam.page, "/uploadFile", { msg: "ok", object_uuid: OBJECT })

  await sam.body.click()
  const box = (await sam.body.boundingBox())!
  const files = await sam.page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(2048)], "plan.pdf", { type: "application/pdf" }))
    return data
  })
  await sam.body.dispatchEvent("drop", { dataTransfer: files, clientX: box.x + 40, clientY: box.y + 12 })

  const block = sam.body.locator('[data-file-block="pdf"]')
  await expect(block).toBeVisible({ timeout: 15_000 })
  await expect(block).toContainText("plan.pdf")
  await expect(block.getByRole("button", { name: "Download plan.pdf" })).toBeVisible()
  // The other person gets the finished file, never the upload's progress.
  await expect(priya.body.locator('[data-file-block="pdf"]')).toContainText("plan.pdf", { timeout: 15_000 })

  await sam.close()
  await priya.close()
})
