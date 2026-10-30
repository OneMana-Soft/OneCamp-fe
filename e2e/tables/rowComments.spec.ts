import { expect, test, type Page, type Route } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// Comments on a row (tables A8, business/TableComments): a row's record shows
// the threads on the row and on its cells, each saying where it is; a field's
// comment button starts one on its cell; a link that names a thread opens the
// record at it. With TABLE_SHOTS set to a folder, it also saves the record at
// 1280 and 390, light and dark, for the design review.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
]
const rows = [
  { item: "Booth for the launch", owner: "Priya", stage: "To do", cost: 1200 },
  { item: "Printed banners", owner: "Sam", stage: "Done", cost: 340 },
]

type Thread = Record<string, unknown> & { id: string; resource_uuid: string; comments: Record<string, unknown>[] }

/** The threads routes for one table's rows, answered as the API does. */
class ThreadsFake {
  threads: Thread[] = []
  made: { anchor: unknown; body: string }[] = []
  private n = 0

  thread(row: string, by: typeof SAM, html: string, extra: Record<string, unknown> = {}): Thread {
    this.n++
    const id = `7a1d1c2e-0000-4000-8000-${String(this.n).padStart(12, "0")}`
    const at = new Date(Date.UTC(2026, 9, 17, 9, this.n)).toISOString()
    const t: Thread = {
      id,
      resource_kind: "table_row",
      resource_uuid: row,
      anchor: { kind: "none" },
      status: "open",
      created_by: by.user_uuid,
      created_at: at,
      updated_at: at,
      comments: [this.comment(id, by, html, at)],
      participants: [],
      unread: false,
      can_reply: true,
      can_resolve: true,
      can_moderate: true,
      ...extra,
    }
    this.threads.push(t)
    return t
  }

  comment(thread: string, by: typeof SAM, html: string, at: string) {
    this.n++
    return {
      comment_uuid: `c0mment0-0000-4000-8000-${String(this.n).padStart(12, "0")}`,
      thread_id: thread,
      comment_text: html,
      comment_by: { user_uuid: by.user_uuid, user_name: by.user_full_name },
      comment_created_at: at,
    }
  }

  async attach(page: Page) {
    await page.route(
      (url) => url.pathname.includes("/threads"),
      (route: Route) => {
        const req = route.request()
        const origin = req.headers()["origin"] || "*"
        const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" }
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
        const url = new URL(req.url())
        if (req.method() === "GET" && url.pathname.endsWith("/threads")) {
          const row = url.searchParams.get("resource_uuid")
          return route.fulfill({ status: 200, headers, json: { data: { threads: this.threads.filter((t) => t.resource_uuid === row) } } })
        }
        if (req.method() === "POST" && url.pathname.endsWith("/threads")) {
          const body = req.postDataJSON() as { resource_uuid: string; anchor: Record<string, unknown>; body: string }
          this.made.push({ anchor: body.anchor, body: body.body })
          const t = this.thread(body.resource_uuid, SAM, body.body, { anchor: body.anchor })
          return route.fulfill({ status: 200, headers, json: { data: t } })
        }
        return route.fulfill({ status: 200, headers, json: { msg: "ok" } })
      },
    )
  }
}

async function openRecord(server: TableServer, threads: ThreadsFake, options: { width: number; height: number; scheme: "light" | "dark" }) {
  return async (browser: Parameters<TableServer["open"]>[0], testInfo: Parameters<TableServer["open"]>[1]) => {
    const sam = await server.open(browser, testInfo, SAM, { viewport: { width: options.width, height: options.height }, colorScheme: options.scheme })
    await threads.attach(sam.page)
    await sam.page.goto(`/app/tables/${server.id}?row=${server.rows[0].id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(sam.page.locator("[data-record-panel]")).toBeVisible({ timeout: 60_000 })
    await expect(sam.page.locator("[data-row-comments]")).toBeVisible({ timeout: 30_000 })
    return sam
  }
}

function seed(server: TableServer) {
  const threads = new ThreadsFake()
  const row = server.rows[0].id
  const first = threads.thread(row, PRIYA, "<p>Can we get the booth two days early? The venue opens at nine.</p>")
  first.comments.push(threads.comment(first.id, SAM, "<p>Asked them this morning. Waiting on a yes.</p>", new Date(Date.UTC(2026, 9, 17, 10, 5)).toISOString()))
  threads.thread(row, SAM, "<p>Is this the final quote, or the estimate?</p>", { anchor: { kind: "cell", meta: { field: "cost" } } })
  threads.thread(row, PRIYA, "<p>Owner confirmed.</p>", { status: "resolved", resolved_at: new Date(Date.UTC(2026, 9, 17, 11)).toISOString(), anchor: { kind: "cell", meta: { field: "owner" } } })
  return threads
}

test("a row's record shows its threads where they are, and starts one on a cell", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  const threads = seed(server)
  const sam = await (await openRecord(server, threads, { width: 1280, height: 900, scheme: "light" }))(browser, testInfo)
  const comments = sam.page.locator("[data-row-comments]")
  await expect(comments.getByText("Can we get the booth two days early?")).toBeVisible()
  await expect(comments.getByText("On this row")).toBeVisible()
  await expect(comments.getByText("On Cost")).toBeVisible()
  await expect(comments.getByText("Owner confirmed.")).toHaveCount(0)
  await expect(sam.page.getByRole("button", { name: "Comment on Cost, 1 comment" })).toBeVisible()

  await sam.page.getByRole("button", { name: /^Comment on Stage/ }).click()
  const box = sam.page.getByRole("textbox", { name: "Comment on Stage" })
  await expect(box).toBeFocused()
  await box.pressSequentially("Is this blocked on the venue?")
  await sam.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
  await expect.poll(() => threads.made.length).toBe(1)
  expect(threads.made[0].anchor).toEqual({ kind: "cell", meta: { field: "stage" } })
  await expect(comments.getByText("Is this blocked on the venue?")).toBeVisible()
  await sam.close()
})

const shots = process.env.TABLE_SHOTS
for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the record with its comments, ${width} ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const server = new TableServer(fields, rows)
      const threads = seed(server)
      const sam = await (await openRecord(server, threads, { width, height, scheme }))(browser, testInfo)
      await sam.page.locator("[data-row-comments]").scrollIntoViewIfNeeded()
      await sam.page.screenshot({ path: `${shots}/row-comments-${width}-${scheme}.png`, animations: "disabled" })
      await sam.close()
    })
  }
}
