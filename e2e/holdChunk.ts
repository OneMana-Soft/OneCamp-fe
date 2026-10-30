import type { BrowserContext, Page } from "@playwright/test"

/**
 * The app's script chunks. Only scripts: a mark that is also a class name would hold the page's stylesheet, and the
 * page with it. A spec that stops routing them unroutes this same pattern.
 */
export const CHUNKS = /\/_next\/static\/chunks\/.+\.js(\?.*)?$/

/** What a spec does with a chunk: lets it through (after any hold it makes), or refuses it, as a line that's down would. */
export type ChunkAnswer = "through" | "refuse"

/**
 * Sends every script chunk the page asks for (or every page of a context) through `answer`, with its text. The ONE
 * route for every spec that holds or drops the app's code, and fetch-safe: a chunk whose own fetch fails (the server
 * reset the connection, or the screen is closing) goes on as the browser would fetch it, so a hold never fails a leg by
 * itself (a board Results leg once failed on "route.fetch: read ECONNRESET", with nothing wrong on the screen).
 */
export async function routeChunks(target: Page | BrowserContext, answer: (body: string) => ChunkAnswer | Promise<ChunkAnswer>) {
  await target.route(CHUNKS, async (route) => {
    try {
      const response = await route.fetch()
      const body = await response.text()
      if ((await answer(body)) === "refuse") return await route.abort("failed")
      return await route.fulfill({ response, body })
    } catch {
      return route.continue().catch(() => {})
    }
  })
}

/**
 * Holds back the page's script chunk that carries `mark` until release(), as a slow line would: the page asks for it,
 * and it lands only when the test says, or `ms` after release(ms), as a slower line would. asked() says whether the
 * page has asked for it yet (wait for it with expect.poll). fail() drops it instead, and every fetch of it after
 * (Turbopack's runtime asks once more by itself), as a line that's down would, until release(). done() lets it through
 * and drops the route, ignoring fetches still on their way: one that a closing context cuts off would fail the test,
 * not the page.
 */
export async function holdChunk(page: Page, mark: string | RegExp) {
  let open: () => void = () => {}
  const held = new Promise<void>((resolve) => (open = resolve))
  let asked = false
  let down = false
  await routeChunks(page, async (body) => {
    if (!(typeof mark === "string" ? body.includes(mark) : mark.test(body))) return "through"
    asked = true
    await held
    return down ? "refuse" : "through"
  })
  return {
    release: (ms = 0) => {
      down = false
      if (ms) setTimeout(open, ms)
      else open()
    },
    fail: () => {
      down = true
      open()
    },
    asked: () => asked,
    done: async () => {
      open()
      await page.unrouteAll({ behavior: "ignoreErrors" })
    },
  }
}
