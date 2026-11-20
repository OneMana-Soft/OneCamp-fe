import { expect, test, type Request } from "@playwright/test"

import { SHOT_THEMES, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { CHUNKS } from "./holdChunk"
import { SCREENS, press, screenUse } from "./screens"

// ADMIN-17: Void posted at once, though it can't be undone. A sent invoice
// now asks first, naming its number; Esc keeps it; once voided the number
// shows as void. One paid meanwhile is refused in the server's words, and the
// page shows it paid. At 1280 and on a phone by touch, light and dark.

const PROJECT = "7c1e2d3f-4a5b-4c55-9a0b-2f6b6c3a1d8e"
const ID = "3a1d8e7c-1e2d-4f4a-8b5c-559a0b2f6b6c"

function invoice(status: string) {
  return {
    id: ID, project_id: PROJECT, number: "INV-7", status, issued_on: "2026-10-01", due_on: "2099-10-16", currency: "USD",
    seller: { name: "Kestrel Studio", address: "1 High Street" }, client: { name: "Acme", address: "2 Low Road" },
    lines: [{ description: "Design", hours: 2, rate_cents: 10000, amount_cents: 20000 }],
    subtotal_cents: 20000, tax_percent: 0, tax_cents: 0, total_cents: 20000, notes: "",
    sent_at: "2026-10-01T09:00:00Z", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  }
}

for (const scheme of SHOT_THEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("void a sent invoice through the confirm; Esc keeps it; the number shows void", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const state = { status: "sent", posts: [] as string[] }
        await stubBackend(page, testInfo, {
          [`/project/${PROJECT}/invoices/${ID}/status`]: (_: URL, r: Request) => {
            const { status } = r.postDataJSON() as { status: string }
            state.posts.push(status)
            state.status = status
            return { msg: "ok", data: invoice(state.status) }
          },
          [`/project/${PROJECT}/invoices/${ID}`]: () => ({ msg: "ok", data: invoice(state.status) }),
          [`/project/info/${PROJECT}`]: { msg: "ok", data: { project_name: "Acme relaunch" } },
        })
        await page.goto(`/invoice/${PROJECT}?id=${ID}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const voidButton = page.getByRole("button", { name: "Void", exact: true })
        await expect(voidButton).toBeVisible({ timeout: 90_000 })
        await voidButton.scrollIntoViewIfNeeded()
        if (scheme === "light") await reviewShot(page, "invoice-sent", scheme)

        await press(screen, voidButton)
        const ask = page.getByRole("alertdialog")
        await expect(ask).toContainText("Void invoice INV-7?")
        await reviewShot(page, "invoice-void-ask", scheme)
        await page.keyboard.press("Escape")
        await expect(ask).toBeHidden()
        expect(state.posts).toEqual([])

        await press(screen, voidButton)
        await press(screen, page.getByRole("button", { name: "Void invoice" }))
        await expect(page.getByRole("alertdialog")).toBeHidden()
        expect(state.posts).toEqual(["void"])
        const voided = page.getByText("Void: kept so its number is never used again.")
        await expect(voided).toBeVisible()
        await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0)
        await voided.scrollIntoViewIfNeeded()
        if (scheme === "dark") await reviewShot(page, "invoice-voided", scheme)
        await expectEveryCallAnswered(page)
      })

      test("a void refused (paid in another tab) says why in the confirm, and the page shows it paid", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const state = { status: "sent", posts: [] as string[] }
        await stubBackend(page, testInfo, {
          [`/project/${PROJECT}/invoices/${ID}/status`]: (_: URL, r: Request) => {
            state.posts.push((r.postDataJSON() as { status: string }).status)
            state.status = "paid"
            return withStatus(400, { msg: "A paid invoice is marked unpaid before it is voided." })
          },
          [`/project/${PROJECT}/invoices/${ID}`]: () => ({ msg: "ok", data: invoice(state.status) }),
          [`/project/info/${PROJECT}`]: { msg: "ok", data: { project_name: "Acme relaunch" } },
        })
        await page.goto(`/invoice/${PROJECT}?id=${ID}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const voidButton = page.getByRole("button", { name: "Void", exact: true })
        await expect(voidButton).toBeVisible({ timeout: 90_000 })

        await press(screen, voidButton)
        await press(screen, page.getByRole("button", { name: "Void invoice" }))
        const ask = page.getByRole("alertdialog")
        await expect(ask).toContainText("A paid invoice is marked unpaid before it is voided.")
        expect(state.posts).toEqual(["void"])
        await reviewShot(page, "invoice-void-refused", scheme)

        await press(screen, page.getByRole("button", { name: "Keep it" }))
        await expect(ask).toBeHidden()
        await expect(page.getByRole("button", { name: "Mark unpaid" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })

      // V-978: the confirm is a chunk of its own, fetched as Void is pointed at, focused or pressed. With the
      // line down after the page settled (every script chunk refused), the press said nothing and the failure
      // took the page to global-error. Now it says so in a toast, the invoice stays, and once the line is back
      // the next press asks.
      test("with the line down, Void says the confirm couldn't open and the invoice stays; back up, it asks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await stubBackend(page, testInfo, {
          [`/project/${PROJECT}/invoices/${ID}`]: () => ({ msg: "ok", data: invoice("sent") }),
          [`/project/info/${PROJECT}`]: { msg: "ok", data: { project_name: "Acme relaunch" } },
        })
        await page.goto(`/invoice/${PROJECT}?id=${ID}`, { waitUntil: "load", timeout: 120_000 })
        const voidButton = page.getByRole("button", { name: "Void", exact: true })
        await expect(voidButton).toBeVisible({ timeout: 90_000 })
        await voidButton.scrollIntoViewIfNeeded()

        await page.route(CHUNKS, (route) => route.abort("internetdisconnected"))
        await press(screen, voidButton)
        const said = page.locator(".toast-card").filter({ hasText: "Couldn't open the void confirmation" })
        await expect(said).toBeVisible()
        await expect(said).toContainText("Check your connection, then try again.")
        await expect(page.getByRole("alertdialog")).toHaveCount(0)
        await expect(page.getByText("Something went wrong")).toHaveCount(0)
        await expect(page.locator("[data-invoice-page]")).toBeVisible()
        await expect(voidButton).toBeVisible()
        await reviewShot(page, "invoice-void-offline", scheme)

        await page.unroute(CHUNKS)
        await press(screen, voidButton)
        await expect(page.getByRole("alertdialog")).toContainText("Void invoice INV-7?")
        // The failure toast went as the code came (DB-151 F1). Sooner than its own 6 s, so it can't just have timed out.
        await expect(said).toHaveCount(0, { timeout: 2_000 })
        await reviewShot(page, "invoice-void-back-online", scheme)
        await press(screen, page.getByRole("button", { name: "Keep it" }))
        await expect(page.getByRole("alertdialog")).toBeHidden()
        await expect(voidButton).toBeVisible()
        await expectEveryCallAnswered(page)
      })

      // DESIGN-BUILD-147: by keyboard, the confirm opens on Keep it with its ring, and Esc gives focus back
      // to Void. Once Void is gone (voided, or paid meanwhile), focus goes to Print or to Mark unpaid, not the page.
      test("by keyboard, focus moves through the confirm and has a home once Void is gone", async ({ page }, testInfo) => {
        test.skip(screen.width !== 1280, "one keyboard leg, at 1280")
        test.setTimeout(180_000)
        const state = { status: "sent", refuse: false }
        await stubBackend(page, testInfo, {
          [`/project/${PROJECT}/invoices/${ID}/status`]: () => {
            if (!state.refuse) return { msg: "ok", data: invoice((state.status = "void")) }
            state.status = "paid"
            return withStatus(400, { msg: "A paid invoice is marked unpaid before it is voided." })
          },
          [`/project/${PROJECT}/invoices/${ID}`]: () => ({ msg: "ok", data: invoice(state.status) }),
          [`/project/info/${PROJECT}`]: { msg: "ok", data: { project_name: "Acme relaunch" } },
        })
        await page.goto(`/invoice/${PROJECT}?id=${ID}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const voidButton = page.getByRole("button", { name: "Void", exact: true })
        await expect(voidButton).toBeVisible({ timeout: 90_000 })
        await page.getByRole("button", { name: "Back to draft" }).focus()
        await page.keyboard.press("Tab")
        await expect(voidButton).toBeFocused()

        await page.keyboard.press("Enter")
        const keep = page.getByRole("button", { name: "Keep it" })
        await expect(keep).toBeFocused()
        expect(await keep.evaluate((b) => b.matches(":focus-visible"))).toBe(true)
        await page.keyboard.press("Escape")
        await expect(page.getByRole("alertdialog")).toBeHidden()
        await expect(voidButton).toBeFocused()

        await page.keyboard.press("Enter")
        await expect(keep).toBeFocused()
        await page.keyboard.press("Tab")
        await expect(page.getByRole("button", { name: "Void invoice" })).toBeFocused()
        await page.keyboard.press("Enter")
        await expect(page.getByRole("alertdialog")).toBeHidden()
        await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeFocused()
        await reviewShot(page, "invoice-voided-focus", scheme)

        Object.assign(state, { status: "sent", refuse: true })
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(voidButton).toBeVisible({ timeout: 90_000 })
        await voidButton.focus()
        await page.keyboard.press("Enter")
        await expect(keep).toBeFocused()
        await page.keyboard.press("Tab")
        await page.keyboard.press("Enter")
        await expect(page.getByRole("alertdialog")).toContainText("A paid invoice is marked unpaid before it is voided.")
        await expect(page.getByRole("button", { name: "Mark unpaid", includeHidden: true })).toHaveCount(1)
        await keep.focus()
        await page.keyboard.press("Enter")
        await expect(page.getByRole("alertdialog")).toBeHidden()
        await expect(page.getByRole("button", { name: "Mark unpaid" })).toBeFocused()
        await expectEveryCallAnswered(page)
      })
    })
  }
}
