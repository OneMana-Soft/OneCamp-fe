import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"

// The one service worker (public/sw.js openPage) asks for a page once more, a moment later, when its request drops:
// the connection closed, or the network changed under it. Before, one dropped request gave the offline page though
// the network was back a moment later. An answer is never asked again, whatever its status.
// In a real browser with the worker in control and its navigation preload ON, as for every member, on a phone, by
// touch. The page's server is a small one of the test's own, serving the tree's public/sw.js and public/offline.html,
// so a request can be dropped the way a network drops it (its socket destroyed): Chromium then rejects the preload
// with a NetworkError and the worker's own fetch() with a TypeError. Playwright's route never sees the preload.

type Ask = "drop" | "page" | "down"
type Asked = { as: Ask; by: "preload" | "worker" }

const PUBLIC = join(process.cwd(), "public")
const html = (body: string) =>
  `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Page retry</title><body>${body}</body></html>`

/** The test's server: the worker, the offline page, a start page linking to /page, and /page answered in turn by `asks`. */
async function serve(asks: Ask[]) {
  const asked: Asked[] = []
  const server: Server = createServer((req, res) => {
    // Never a kept-alive socket: Chromium asks again by itself when a reused socket closes, which would hide the worker's ask.
    res.setHeader("connection", "close")
    const path = new URL(req.url ?? "/", "http://x").pathname
    if (path === "/sw.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(readFileSync(join(PUBLIC, "sw.js")))
    if (path === "/offline.html") return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(join(PUBLIC, "offline.html")))
    if (path === "/start") return res.writeHead(200, { "content-type": "text/html" }).end(html(`<a href="/page" style="display:block;padding:16px">Open the page</a>`))
    if (path !== "/page") return res.writeHead(404).end()
    const as = asks[asked.length] ?? "page"
    asked.push({ as, by: req.headers["service-worker-navigation-preload"] ? "preload" : "worker" })
    console.log(`asked ${asked.length}: ${JSON.stringify(asked.at(-1))}`)
    if (as === "drop") return req.socket.destroy()
    if (as === "down") return res.writeHead(503, { "content-type": "text/html" }).end(html("<p data-down>The server is down</p>"))
    res.writeHead(200, { "content-type": "text/html" }).end(html("<main data-page>The page</main>"))
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { asked, origin, close: () => new Promise((done) => server.close(done)) }
}

/** The start page, in control of the one worker, active with its navigation preload on. */
async function controlled(page: Page, origin: string) {
  await page.goto(`${origin}/start`)
  await page.evaluate(() => navigator.serviceWorker.register("/sw.js"))
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? "none"), { timeout: 30_000 })
    .toBe("activated")
  const preload = await page.evaluate(async () => (await navigator.serviceWorker.ready).navigationPreload.getState())
  expect(preload.enabled, "the worker's navigation preload is on, as for every member").toBe(true)
}

test.describe("a page whose request drops, on a phone, by touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" })

  test("one dropped request, then an answer, gives the page, not the offline page", async ({ page }) => {
    const server = await serve(["drop", "page"])
    try {
      await controlled(page, server.origin)
      await page.getByRole("link", { name: "Open the page" }).tap()
      await expect(page.locator("[data-page]")).toHaveText("The page", { timeout: 15_000 })
      await expect(page.locator("[data-offline-page]")).toHaveCount(0)
      expect(server.asked).toEqual([
        { as: "drop", by: "preload" },
        { as: "page", by: "worker" },
      ])
    } finally {
      await server.close()
    }
  })

  test("two dropped requests give the offline page, and the page is never asked a third time", async ({ page }) => {
    const server = await serve(["drop", "drop", "page"])
    try {
      await controlled(page, server.origin)
      await page.getByRole("link", { name: "Open the page" }).tap()
      await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(1_000)
      expect(server.asked).toEqual([
        { as: "drop", by: "preload" },
        { as: "drop", by: "worker" },
      ])
    } finally {
      await server.close()
    }
  })

  test("a server's answer is never asked again, whatever its status", async ({ page }) => {
    const server = await serve(["down", "page"])
    try {
      await controlled(page, server.origin)
      await page.getByRole("link", { name: "Open the page" }).tap()
      await expect(page.locator("[data-down]")).toHaveText("The server is down", { timeout: 15_000 })
      await page.waitForTimeout(1_000)
      expect(server.asked).toEqual([{ as: "down", by: "preload" }])
    } finally {
      await server.close()
    }
  })
})
