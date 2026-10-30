import { expect, test, type BrowserContextOptions, type Request } from "@playwright/test"
import { stubBackend, withStatus } from "./stubbedApp"

// A guest waiting in a personal room's lobby (calls CALLS-2) keeps Leave on
// the screen. The wait covered the page under it, so it took that page's
// height, and once HU13's "Join as yourself" line made the green room taller
// than a phone's screen, Leave sat partly below it (DESIGN-BUILD-12 M1,
// 24 Oct 2026). The wait now fills the screen, whatever the page under it.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
})

const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const ROOM = "/public/r/maya"

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a guest waiting to be let in has the whole screen and Leave on it, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const phone = device === "phone"
    const context = await browser.newContext({ ...use, permissions: ["camera", "microphone"] })
    const page = await context.newPage()
    const left: string[] = []
    await stubBackend(page, testInfo, {
      [ROOM]: { data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
      [`${ROOM}/join`]: withStatus(202, { data: { waiting: true, ticket: "t-1" } }),
      // The server holds a knock until someone running the call answers it, and nobody does.
      [`${ROOM}/knock/`]: (url: URL, request: Request) => {
        if (request.method() !== "DELETE") return new Promise(() => {})
        left.push(url.pathname)
        return { data: { left: true } }
      },
    })
    await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByLabel("Your name").fill("Gia Russo")
    const join = page.getByRole("button", { name: "Join now" })
    if (phone) await join.tap({ timeout: 60_000 })
    else await join.click({ timeout: 60_000 })

    const wait = page.locator("[data-guest-lobby]")
    await expect(wait.getByRole("heading", { name: "Waiting to be let in" })).toBeVisible({ timeout: 30_000 })
    // The case: on a phone the green room under the wait is taller than the screen.
    if (phone) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(use.viewport.height)
    const leave = wait.getByRole("button", { name: "Leave" })
    await expect(leave).toBeInViewport({ ratio: 1 })
    expect(await wait.boundingBox()).toEqual({ x: 0, y: 0, ...use.viewport })

    // Leave gives the knock up, and the guest is back in the green room.
    if (phone) await leave.tap()
    else await leave.click()
    await expect(wait).toHaveCount(0)
    await expect(join).toBeVisible()
    expect(left).toEqual([`${ROOM}/knock/t-1`])
    await context.close()
  })
}
