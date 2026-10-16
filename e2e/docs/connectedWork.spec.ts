import { expect, test, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs, type Person } from "./twoPeople"

// Docs C1 in two browsers (the A1 two-client harness): a day picked from the
// "@" list, a page linked with "[[" and a to-do made a task with ⌘⇧Enter reach
// the other person, each chip read as its reader may (POST /entities answers
// per person, as the server does), and a to-do's tick reaches its task once. The collaboration socket and every
// API call are answered in this process: nothing reaches a real server.

const DOC = "c1d0c000-0000-4000-8000-000000000001"
const PAGE = "c1d0c000-0000-4000-8000-000000000002"
const PROJECT = "c1d0c000-0000-4000-8000-000000000003"
const TASK = "c1d0c000-0000-4000-8000-000000000004"

test.describe.configure({ mode: "serial" })

type Ref = { kind: string; id: string }

/** What the server reads of each thing for this person: Priya may not open the linked page. */
function readFor(person: Person, ref: Ref) {
  const ok = (data: Record<string, unknown>) => ({ ...ref, access: "ok", data })
  if (ref.kind === "doc" && ref.id === DOC) return ok({ title: "Launch plan", space_kind: "project", space_id: PROJECT })
  if (ref.kind === "doc" && ref.id === PAGE) return person === PRIYA ? { ...ref, access: "none" } : ok({ title: "Launch notes", parent_id: DOC })
  if (ref.kind === "project" && ref.id === PROJECT) return ok({ name: "Launch", can_edit: person === SAM })
  if (ref.kind === "task" && ref.id === TASK) {
    return ok({ name: "Write the notes", status: "todo", status_name: "To do", done: false, can_edit: person === SAM, project_id: PROJECT, project_name: "Launch" })
  }
  return { ...ref, access: "gone" }
}

/** Answers the API calls of connected work for one person, by path, from what each sent. */
async function serveConnected(page: Page, person: Person, made: string[]) {
  const answers: Record<string, (body: Record<string, unknown>) => unknown> = {
    "/entities": (body) => ({ msg: "ok", data: (body.refs as Ref[]).map((r) => readFor(person, r)) }),
    "/search/unifiedSearch": () => ({ msg: "ok", data: { page: [{ type: "doc", doc: { doc_uuid: PAGE, doc_title: "Launch notes" } }] } }),
    "/doc/todoTask": (body) => {
      made.push(String(body.title))
      return { msg: "ok", data: { task_uuid: TASK } }
    },
    "/doc/todoTask/check": (body) => {
      made.push(`${person.user_name} ${body.done ? "ticked" : "unticked"} ${body.task_uuid}`)
      return { msg: "ok" }
    },
  }
  const paths = Object.keys(answers)
  await page.route(
    (url) => paths.some((p) => url.pathname.replace(/\/$/, "").endsWith(p)),
    (route) => {
      const request = route.request()
      const origin = request.headers()["origin"] || "*"
      const headers = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      }
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      const path = paths.find((p) => new URL(request.url()).pathname.replace(/\/$/, "").endsWith(p))!
      return route.fulfill({ status: 200, headers, json: answers[path]((request.postDataJSON() ?? {}) as Record<string, unknown>) })
    },
  )
}

async function openBoth(browser: Parameters<typeof openDocAs>[0], testInfo: Parameters<typeof openDocAs>[1], made: string[] = []) {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  await serveConnected(sam.page, SAM, made)
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })
  await serveConnected(priya.page, PRIYA, made)
  return { sam, priya }
}

test("a day picked from the @ list reads as a day for both", async ({ browser }, testInfo) => {
  const { sam, priya } = await openBoth(browser, testInfo)

  await sam.body.click()
  await sam.page.keyboard.type("Ship it @tom")
  const list = sam.page.getByRole("listbox", { name: "Mention someone or a date" })
  await expect(list.getByRole("option", { name: "Tomorrow" })).toBeVisible({ timeout: 15_000 })
  await expect(list.getByRole("option", { name: "Remind me" })).toBeVisible()
  await sam.page.keyboard.press("Enter")

  // The day, not the words typed: both read "Tomorrow", the full date beside it.
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const full = tomorrow.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "")
  await expect(sam.body.locator("[data-date-chip]")).toHaveText("Tomorrow")
  await expect(priya.body.locator("[data-date-chip]")).toHaveText("Tomorrow", { timeout: 15_000 })
  await expect(priya.body.locator("[data-date-chip]")).toHaveAttribute("aria-label", full)
  await expect(sam.body).not.toContainText("@tom")

  await sam.close()
  await priya.close()
})

test("[[ links a page; its reader sees its title, someone who can't open it never does", async ({ browser }, testInfo) => {
  const { sam, priya } = await openBoth(browser, testInfo)

  await sam.body.click()
  await sam.page.keyboard.type("See [[Launch")
  const list = sam.page.getByRole("listbox", { name: "Link a page" })
  await expect(list.getByRole("option", { name: "Launch notes" })).toBeVisible({ timeout: 15_000 })
  await sam.page.keyboard.press("Enter")

  await expect(sam.body.locator('[data-entity-chip="doc"]')).toHaveAttribute("aria-label", "Page: Launch notes", { timeout: 15_000 })
  // Priya may not open it: her chip says so, and the page's name never reaches her screen.
  const hers = priya.body.locator('[data-entity-chip="doc"]')
  await expect(hers).toHaveAttribute("data-state", "none", { timeout: 15_000 })
  await expect(hers).toHaveText("No access")
  await expect(priya.body).not.toContainText("Launch notes")

  await sam.close()
  await priya.close()
})

test("⌘⇧Enter makes a to-do a task in the doc's project; its tick reaches the task once, from the tab that made it", async ({ browser }, testInfo) => {
  const made: string[] = []
  const { sam, priya } = await openBoth(browser, testInfo, made)

  await sam.body.click()
  await sam.page.keyboard.type("[] Write the notes")
  await expect(sam.body.locator("li.task-item")).toHaveCount(1)
  await sam.page.keyboard.press("Control+Shift+Enter")

  await expect(sam.page.getByText("Made the task in Launch").first()).toBeVisible({ timeout: 15_000 })
  expect(made).toEqual(["Write the notes"])
  const chip = (tab: typeof sam) => tab.body.locator('li.task-item [data-entity-chip="task"]')
  await expect(chip(sam)).toHaveAttribute("aria-label", /^Task: Write the notes/, { timeout: 15_000 })
  await expect(chip(priya)).toHaveAttribute("aria-label", /^Task: Write the notes/, { timeout: 15_000 })

  // Sam ticks it: the task is done once, from his tab; Priya's box follows and her tab sends nothing.
  await sam.body.locator("li.task-item input[type=checkbox]").check()
  await expect(priya.body.locator("li.task-item")).toHaveAttribute("data-checked", "true", { timeout: 15_000 })
  await expect.poll(() => made.filter((m) => m.includes("ticked"))).toEqual([`sam ticked ${TASK}`])
  await priya.page.waitForTimeout(500)
  expect(made.filter((m) => m.includes("ticked"))).toEqual([`sam ticked ${TASK}`])

  // Priya isn't one of the project's admins: her untick is refused before it lands.
  await priya.body.locator("li.task-item input[type=checkbox]").uncheck({ force: true }).catch(() => undefined)
  await expect(priya.page.getByText("Only the project's admins can change this task").first()).toBeVisible({ timeout: 15_000 })
  await expect(priya.body.locator("li.task-item")).toHaveAttribute("data-checked", "true")
  expect(made.filter((m) => m.includes("ticked"))).toEqual([`sam ticked ${TASK}`])

  await sam.close()
  await priya.close()
})
