import { expect, type Browser, type TestInfo } from "@playwright/test"

import { docInfo, stubBackend, type Answers } from "../stubbedApp"
import type { CollabRelay } from "./collabRelay"
import type { DocTab, Person } from "./twoPeople"

/**
 * A doc opened as a person on the relay, as A1's openDocAs opens it, with more
 * of the API answered (B8's version history) and a screen size of the test's
 * choosing.
 */
export async function openDocWith(
  browser: Browser,
  testInfo: TestInfo,
  relay: CollabRelay,
  person: Person,
  doc: { id: string; title?: string; body?: string },
  answers: Answers = {},
  viewport = { width: 1280, height: 900 },
): Promise<DocTab> {
  const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"), viewport })
  const page = await context.newPage()
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${doc.id}`]: docInfo({ doc_uuid: doc.id, doc_title: doc.title ?? "Launch plan", doc_body: doc.body ?? "<p></p>", edit: true }),
    "/user/profile": { msg: "ok", data: person },
    "/auth/token": { data: { token: `e2e-${person.user_name}` } },
    ...answers,
  })
  await relay.attach(page, person.user_full_name)
  await page.goto(`/app/doc/${doc.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const body = page.locator('.doc-editor .ProseMirror[contenteditable="true"]')
  await expect(body).toBeVisible({ timeout: 60_000 })
  return { page, body, close: () => context.close() }
}
