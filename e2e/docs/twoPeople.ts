import { expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, docInfo, stubBackend, type Answers } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"

/** A second person, for the doc to have two. */
export const PRIYA = {
  user_uuid: "8a1d4e2b-6c3f-4b7a-9e5d-1f2a3b4c5d6e",
  user_name: "priya",
  user_full_name: "Priya Shah",
  user_email_id: "priya@example.com",
  user_is_admin: false,
}

export type Person = typeof SAM

export interface DocTab {
  page: Page
  /** The doc's editable body, once the live copy has arrived. */
  body: Locator
  close(): Promise<void>
}

/** How a doc is opened: on a phone (a touch screen 390 px wide), with what the browser keeps (a theme, a tip seen), with more of the API answered. */
export interface OpenAs {
  phone?: boolean
  storage?: Record<string, string>
  answers?: Answers
}

/**
 * Opens a doc as a person, in a browser context of their own, on the relay:
 * signed in with no backend (stubbedApp), the doc theirs to edit, and its
 * collaboration socket answered by the relay.
 */
export async function openDocAs(
  browser: Browser,
  testInfo: TestInfo,
  relay: CollabRelay,
  person: Person,
  doc: { id: string; title?: string; body?: string },
  { phone = false, storage = {}, answers = {} }: OpenAs = {},
): Promise<DocTab> {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
    ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } }),
  })
  const page = await context.newPage()
  await page.addInitScript((kept) => Object.entries(kept).forEach(([key, value]) => localStorage.setItem(key, value)), storage)
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

/** The ids of a tab's blocks, in order, as its editor draws them. */
export function blockIds(tab: DocTab): Promise<string[]> {
  return tab.body.evaluate((el) => Array.from(el.querySelectorAll("[data-block-id]")).map((b) => b.getAttribute("data-block-id") ?? ""))
}
