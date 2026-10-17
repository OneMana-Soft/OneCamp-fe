import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"

import { SAM, docInfo, stubBackend } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, type DocTab, type Person } from "./twoPeople"

// Doc AI in a doc two people have open (docs programme B9; ai-search-io P0-3
// and P1-1), each in a browser of their own on A1's two-client harness. The
// model is answered here: the stream's frames as the API sends them.
// Nothing reaches a real server.

const DOC = "7c2d9e4f-1a3b-4c5d-8e6f-0b1c2d3e4f5a"
const LOCAL = { name: "qwen3:4b-instruct", label: "qwen3 4B", provider: "ollama", provider_label: "Ollama", local: true }

// Two browsers each, and a model's answer in between.
test.describe.configure({ mode: "serial", timeout: 180_000 })

type Answer = (request: { action: string; prompt?: string; text?: string }) => string

/** The stream's frames, as the API writes them. */
const sse = (frames: unknown[]) => frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("")

/** Opens the doc as a person with AI on, the model answering with `answer`; records go in `applied`. */
async function openWithAI(browser: Browser, testInfo: TestInfo, relay: CollabRelay, person: Person, answer: Answer, applied: unknown[]): Promise<DocTab> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p></p>", edit: true }),
    "/user/profile": { msg: "ok", data: person },
    "/auth/token": { data: { token: `e2e-${person.user_name}` } },
    "/config/client": { msg: "ok", data: { upload_limit_mb: 10, upload_limit_bytes: 10485760, transcription_mode: "off", email_enabled: false, features: { ai: true } } },
    "/doc/ai/model": { msg: "ok", data: { enabled: true, model: LOCAL } },
    "/doc/ai/starters": { msg: "ok", data: { project: null } },
    "/doc/ai/agent-edits": { msg: "ok", data: [] },
  })
  await page.route(
    (url) => url.pathname.endsWith("/ai/doc/complete/stream") || url.pathname.endsWith("/doc/ai/applied"),
    async (route) => {
      const request = route.request()
      if (request.method() === "OPTIONS") return route.fallback()
      const headers = { "access-control-allow-origin": request.headers()["origin"] || "*", "access-control-allow-credentials": "true" }
      const body = request.postDataJSON()
      if (request.url().endsWith("/doc/ai/applied")) {
        applied.push(body)
        return route.fulfill({ status: 200, headers, json: { msg: "ok" } })
      }
      return route.fulfill({
        status: 200,
        headers: { ...headers, "content-type": "text/event-stream" },
        body: sse([{ model: LOCAL }, { content: answer(body) }, { done: true }]),
      })
    },
  )
  await relay.attach(page, person.user_full_name)
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const body = page.locator('.doc-editor .ProseMirror[contenteditable="true"]')
  await expect(body).toBeVisible({ timeout: 60_000 })
  return { page, body, close: () => context.close() }
}

/** Opens the bar with ⌘J and waits for its field, which then takes the keys. */
async function askAI(tab: DocTab) {
  await tab.page.keyboard.press("Control+j")
  await expect(tab.page.getByRole("dialog", { name: "Ask AI" })).toBeVisible()
  await expect(tab.page.getByRole("dialog", { name: "Ask AI" }).getByRole("combobox")).toBeFocused()
}

/**
 * Selects the caret's line, once the editor has taken the selection (its bar
 * shows): from its end back to its start. Home put a caret at the doc's start,
 * which ProseMirror reads, for 200 ms after the editor takes the focus, as the
 * browser's own reset on focus, and puts back: when a click below the text had
 * just taken the focus, Home was undone and Shift+End selected nothing.
 */
async function selectLine(tab: DocTab) {
  await tab.page.keyboard.press("End")
  await tab.page.keyboard.press("Shift+Home")
  await expect(selectionBar(tab.page)).toBeVisible()
}

/** Types a line into the doc, and selects its text. */
async function writeAndSelect(tab: DocTab, line: string) {
  await tab.body.click()
  await tab.page.keyboard.type(line)
  await selectLine(tab)
}

const selectionBar = (page: Page) => page.locator("[data-doc-selection-bar]")

const reviewBar = (page: Page) => page.getByRole("toolbar", { name: "Review the proposed change" })

test("a rewrite into a heading and a list is reviewed, then lands as blocks for both, and ⌘Z takes it back (P0-3)", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const applied: unknown[] = []
  const answer: Answer = () => "## Launch plan\n\n- Ship on Thursday\n- Tell sales"
  const sam = await openWithAI(browser, testInfo, relay, SAM, answer, applied)
  const priya = await openWithAI(browser, testInfo, relay, PRIYA, answer, applied)

  await writeAndSelect(sam, "Ship it on Thursday and tell sales.")
  await expect(priya.body).toContainText("Ship it on Thursday and tell sales.", { timeout: 15_000 })

  await askAI(sam)
  const bar = sam.page.getByRole("dialog", { name: "Ask AI" })
  await expect(bar).toContainText("Runs on your server · qwen3 4B")
  await sam.page.keyboard.type("make it a plan with a heading and a list")
  await sam.page.keyboard.press("Enter")

  // The change is shown in Sam's tab only; the doc itself is as it was.
  await expect(reviewBar(sam.page)).toBeVisible({ timeout: 15_000 })
  await expect(sam.body.locator(".oc-proposal-ins")).not.toHaveCount(0)
  await expect(priya.body.locator(".oc-proposal-ins, .oc-proposal-del")).toHaveCount(0)
  await expect(priya.body.locator("h2")).toHaveCount(0)

  await reviewBar(sam.page).press("Enter")
  for (const tab of [sam, priya]) {
    await expect(tab.body.locator("h2")).toHaveText("Launch plan", { timeout: 15_000 })
    await expect(tab.body.locator("ul li")).toHaveCount(2)
    await expect(tab.body).not.toContainText("##")
    // In place of the text, not below it.
    await expect(tab.body).not.toContainText("Ship it on Thursday and tell sales.")
  }
  await expect.poll(() => applied.length).toBe(1)
  expect(applied[0]).toMatchObject({ doc_uuid: DOC, action: "edit", model: "qwen3 4B", local: true })

  // Into the text: a click in the space below a doc that ends in a list adds a
  // line there (click to create), and ⌘Z would take that line back first.
  await sam.body.locator("li").last().click()
  await sam.page.keyboard.press("Control+z")
  for (const tab of [sam, priya]) {
    await expect(tab.body.locator("h2")).toHaveCount(0, { timeout: 15_000 })
    await expect(tab.body).toContainText("Ship it on Thursday and tell sales.")
  }

  await sam.close()
  await priya.close()
})

test("a rewrite's changes are struck and inserted, Discard changes nothing, and two of three can be taken (P1-1)", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const applied: unknown[] = []
  const answer: Answer = () => "We ship on Friday, tell everyone and celebrate."
  const sam = await openWithAI(browser, testInfo, relay, SAM, answer, applied)
  const priya = await openWithAI(browser, testInfo, relay, PRIYA, answer, applied)
  const line = "We ship on Thursday, tell sales and wait."

  await writeAndSelect(sam, line)
  await expect(priya.body).toContainText(line, { timeout: 15_000 })
  // Ask AI on the selection's bar this time.
  await selectionBar(sam.page).getByRole("button", { name: "Ask AI" }).click()
  await expect(sam.page.getByRole("dialog", { name: "Ask AI" }).getByRole("combobox")).toBeFocused()
  // Improve writing: the first thing a selection is offered.
  await sam.page.keyboard.press("Enter")
  await expect(reviewBar(sam.page)).toContainText("3 changes", { timeout: 15_000 })
  await expect(sam.body.locator(".oc-proposal-del")).toHaveCount(3)
  await expect(sam.body.locator(".oc-proposal-ins")).toHaveCount(3)
  await expect(priya.body.locator(".oc-proposal-ins, .oc-proposal-del")).toHaveCount(0)

  // Discard: nothing in either tab changed, nothing was recorded, and the
  // text has the focus again (it comes back on the next frame; until then a
  // click below the text takes it).
  await reviewBar(sam.page).press("Escape")
  await expect(sam.body.locator(".oc-proposal-ins, .oc-proposal-del")).toHaveCount(0)
  await expect(sam.body).toContainText(line)
  await expect(priya.body).toContainText(line)
  expect(applied).toHaveLength(0)
  await expect(sam.body).toBeFocused()

  // Again, taking the first two changes and rejecting the third.
  await sam.body.click()
  await selectLine(sam)
  await askAI(sam)
  await sam.page.keyboard.press("Enter")
  const review = reviewBar(sam.page)
  await expect(review).toContainText("3 changes", { timeout: 15_000 })
  await review.getByRole("button", { name: "Next change" }).click()
  await review.getByRole("button", { name: "Accept change" }).click()
  await review.getByRole("button", { name: "Accept change" }).click()
  await review.getByRole("button", { name: "Reject change" }).click()
  await expect(review).toHaveCount(0)
  for (const tab of [sam, priya]) await expect(tab.body).toContainText("We ship on Friday, tell everyone and wait.", { timeout: 15_000 })
  await expect.poll(() => applied.length).toBe(1)
  expect(applied[0]).toMatchObject({ action: "improve", changes: 2, of: 3, inserted: false })

  await sam.close()
  await priya.close()
})

test("space on an empty line writes as ghost text the other person doesn't see, until it is accepted", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const applied: unknown[] = []
  const answer: Answer = () => "## Rollout\n\n- Freeze on Monday\n- Ship on Tuesday"
  const sam = await openWithAI(browser, testInfo, relay, SAM, answer, applied)
  const priya = await openWithAI(browser, testInfo, relay, PRIYA, answer, applied)

  await sam.body.click()
  await sam.page.keyboard.press(" ")
  const bar = sam.page.getByRole("dialog", { name: "Ask AI" })
  await expect(bar.getByRole("combobox")).toBeFocused()
  await sam.page.keyboard.type("a rollout checklist")
  await sam.page.keyboard.press("Enter")

  await expect(sam.body.locator(".oc-proposal-ins")).toContainText("Freeze on Monday", { timeout: 15_000 })
  await expect(priya.body).not.toContainText("Freeze on Monday")
  await expect(priya.body.locator(".oc-proposal-ins")).toHaveCount(0)

  await reviewBar(sam.page).press("Enter")
  for (const tab of [sam, priya]) {
    await expect(tab.body.locator("h2")).toHaveText("Rollout", { timeout: 15_000 })
    await expect(tab.body.locator("ul li")).toHaveCount(2)
  }
  await expect.poll(() => applied.length).toBe(1)
  expect(applied[0]).toMatchObject({ action: "draft", changes: 1, of: 1 })

  await sam.close()
  await priya.close()
})
