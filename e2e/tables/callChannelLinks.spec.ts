import { expect, test, type Locator, type Page } from "@playwright/test"

import { reviewShot, SAM, SHOT_THEMES } from "../stubbedApp"
import { scrollClearOfLead, TableServer } from "./tableServer"

// airtable-01: a row links to OneCamp's own channels and calls, which Airtable can't link. A channel is found by the
// workspace search (lib/search/hitRef reads its hit as every picker does); a call by GET /calls/linkable, the
// reader's own readable calls, listed before anything is typed. The server names each link for its reader and sends
// one they can't open hidden, in the one "can't open" chip. A channel's chip opens the channel; a call's opens its
// huddle post (GET /calls/{id}). The call picker says a failed listing in place, with Try again, and says it's
// offline rather than spin. At 1280, and at 390 with touch, where the picker is a sheet at the screen's foot and a
// chip's × keeps V-1072's 44 px reach.

const CALL = "c0110000-0000-4000-8000-0000000000a1"
const SECRET_CALL = "c0110000-0000-4000-8000-0000000000f9"
const CHANNEL = "c4a00000-0000-4000-8000-0000000000c1"
const POST = "905f0000-0000-4000-8000-0000000000d1"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "call", name: "Call", type: "relation", config: { relation_target: "call" } },
  { id: "chan", name: "Channel", type: "relation", config: { relation_target: "channel" } },
]

const cors = (req: { headers: () => Record<string, string> }) => ({ "access-control-allow-origin": req.headers()["origin"] || "*", "access-control-allow-credentials": "true" })

/** The call routes and the workspace search, as the server answers them; registered after the table's stubs, so they answer first. */
async function serverAnswers(page: Page, state: { callsFail: boolean }) {
  await page.route(
    (url) => url.pathname.endsWith("/calls/linkable"),
    (route) => {
      const req = route.request()
      if (req.method() === "OPTIONS") return route.fallback()
      if (state.callsFail) return route.fulfill({ status: 503, headers: cors(req), json: { msg: "The server couldn't list calls just now." } })
      return route.fulfill({
        status: 200,
        headers: cors(req),
        json: { calls: [{ id: CALL, title: "Launch sync", started_at: "2026-11-16T09:00:00Z", conversation_kind: "channel" }] },
      })
    },
  )
  await page.route(
    (url) => url.pathname.endsWith(`/calls/${CALL}`),
    (route) => {
      const req = route.request()
      if (req.method() === "OPTIONS") return route.fallback()
      return route.fulfill({
        status: 200,
        headers: cors(req),
        json: { data: { live: false, session: { id: CALL, kind: "channel", resource: { kind: "channel", id: CHANNEL }, post_uuid: POST, people: [] } } },
      })
    },
  )
  await page.route(
    (url) => url.pathname.endsWith("/search/unifiedSearch"),
    (route) => {
      const req = route.request()
      if (req.method() === "OPTIONS") return route.fallback()
      return route.fulfill({
        status: 200,
        headers: cors(req),
        json: { msg: "ok", data: { page: [{ type: "channel", channel: { ch_id: CHANNEL, ch_name: "general", ch_private: false } }], has_more: false } },
      })
    },
  )
}

/** Which control a real tap at (x, y) reaches: the button or link the hit test finds there, by its name. */
const hitAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py)?.closest("a, button")
    return el ? el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName : null
  }, [x, y] as const)

for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test(`at ${phone ? "390 with touch" : "1280"}, ${theme}: a row links a call and a channel, each chip opens it, and what the reader can't open stays hidden`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const server = new TableServer(fields, [{ item: "Booth", call: [{ id: SECRET_CALL, type: "call" }] }])
      server.names.set(CALL, "Launch sync")
      server.names.set(CHANNEL, "general")
      server.hidden.add(SECRET_CALL)
      const state = { callsFail: true }
      const { page, close } = await server.open(browser, testInfo, SAM, {
        colorScheme: theme,
        ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {}),
      })
      await serverAnswers(page, state)
      const press = (target: Locator) => (phone ? target.tap() : target.click())
      const row = page.locator("tbody tr[data-row]").first()
      const callCell = row.locator('td[data-field="call"]')
      const chanCell = row.locator('td[data-field="chan"]')
      /** Opens a cell's picker: a cell drawn at rest comes to life under the first press, so the press that reaches the live "+" opens it. */
      const openPicker = async (cell: Locator, find: Locator) => {
        await cell.scrollIntoViewIfNeeded()
        await expect(async () => {
          if (!phone) await cell.hover()
          if (!(await find.isVisible())) await press(cell.getByRole("button", { name: "Add a link" }))
          await expect(find).toBeVisible({ timeout: 5_000 })
        }).toPass({ timeout: 40_000 })
      }
      await expect(row).toContainText("Booth", { timeout: 60_000 })

      // The call the reader can't open is one hidden chip, unnamed and with no click.
      const hidden = callCell.locator("[data-relation-hidden]")
      await expect(hidden).toHaveText("Something you can't open", { timeout: 20_000 })
      await expect(hidden.locator("a, button")).toHaveCount(0)

      // A failed listing says so in place, with Try again, which lists the calls; nothing is linked meanwhile.
      const findCall = page.getByRole("textbox", { name: "Search calls" })
      await openPicker(callCell, findCall)
      await expect(page.getByText("Couldn't load calls")).toBeVisible({ timeout: 20_000 })
      if (phone) {
        // On a phone the picker is a sheet at the screen's foot, as wide as the screen.
        const sheet = page.locator('[data-overlay="float"]').filter({ has: findCall })
        const box = await sheet.boundingBox()
        expect(box, "the picker's sheet").not.toBeNull()
        expect(Math.round(box!.width)).toBe(390)
        expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(843)
      }
      state.callsFail = false
      await press(page.getByRole("button", { name: /Try again/ }))
      await expect(page.getByRole("option", { name: /Launch sync/ })).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, phone ? "call-links-picker-390" : "call-links-picker", theme)
      await press(page.getByRole("option", { name: /Launch sync/ }))
      await expect(findCall).toHaveCount(0, { timeout: 20_000 })
      await expect.poll(() => server.valuesOf(0).call).toEqual([
        { id: SECRET_CALL, type: "call" },
        { id: CALL, type: "call" },
      ])
      const callChip = callCell.locator("[data-relation-chip]").getByRole("button", { name: "Launch sync", exact: true })
      await expect(callChip).toBeVisible({ timeout: 20_000 })
      await expect(hidden).toHaveText("Something you can't open")

      // Offline, the picker says so instead of searching, and lists the calls once the app is back.
      await page.context().setOffline(true)
      await openPicker(callCell, findCall)
      // By its own words: the app's own "You're offline" notice shows too.
      await expect(page.getByText("You're offline. This list comes back when you're online.")).toBeVisible({ timeout: 20_000 })
      await page.context().setOffline(false)
      await expect(page.getByRole("option", { name: /Launch sync/ })).toBeVisible({ timeout: 30_000 })
      await page.keyboard.press("Escape")
      await expect(findCall).toHaveCount(0, { timeout: 20_000 })

      // A channel, found by the workspace search; its chip opens the channel.
      const findChannel = page.getByRole("textbox", { name: "Search channels" })
      await openPicker(chanCell, findChannel)
      await findChannel.fill("gen")
      await press(page.getByRole("option", { name: /general/ }))
      await expect.poll(() => server.valuesOf(0).chan).toEqual([{ id: CHANNEL, type: "channel" }])
      const chanChip = chanCell.locator("[data-relation-chip]").getByRole("link", { name: "general" })
      await expect(chanChip).toHaveAttribute("href", `/app/channel/${CHANNEL}`, { timeout: 20_000 })
      await reviewShot(page, phone ? "call-links-cells-390" : "call-links-cells", theme)

      if (phone) {
        // V-1072 holds on a call's chip: its × takes a tap across 44 px, and its name never reaches the ×.
        // The channel's picker is a drawer here: it shuts on the pick, and its scrim takes every tap until it has gone
        // (a person sees it go). It scrolled the row on, so the call's cell then comes back clear of the frozen lead.
        await expect(findChannel).toHaveCount(0, { timeout: 20_000 })
        await scrollClearOfLead(callCell)
        const label = "Unlink Launch sync"
        const x = callCell.getByRole("button", { name: label })
        await expect(x).toBeVisible()
        const b = (await x.boundingBox())!
        const cx = b.x + b.width / 2
        const cy = b.y + b.height / 2
        for (const [dx, dy] of [[-21, 0], [21, 0], [0, -21], [0, 21]]) {
          expect.soft(await hitAt(page, cx + dx, cy + dy), `a tap ${dx},${dy} px from the ×'s centre reaches it`).toBe(label)
        }
        const n = (await callChip.boundingBox())!
        for (const fx of [0.05, 0.5, 0.95]) {
          expect.soft(await hitAt(page, n.x + n.width * fx, n.y + n.height / 2), `the name at ${fx} is not the ×`).toBe("Launch sync")
        }
      }

      // The channel's chip opens the channel.
      await press(chanChip)
      await expect(page).toHaveURL(new RegExp(`/app/channel/${CHANNEL}$`), { timeout: 30_000 })
      await page.goBack({ waitUntil: "domcontentloaded" })
      await expect(callChip).toBeVisible({ timeout: 60_000 })

      // The call's chip opens its huddle post in its channel (GET /calls/{id}).
      await expect(async () => {
        if (!page.url().includes("/app/channel/")) await press(callChip)
        await expect(page).toHaveURL(new RegExp(`/app/channel/${CHANNEL}/${POST}$`), { timeout: 5_000 })
      }).toPass({ timeout: 40_000 })
      await close()
    })
  }
}
