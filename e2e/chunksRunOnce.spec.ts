import { expect, test, type Page } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Each chunk runs once, however the app gets to a page (21 Oct 2026, Next
// 16.3.8 with Turbopack). On a client navigation Turbopack's runtime loads the
// new page's chunks with plain <script src> tags, and the page's server
// payload also carries them as <script async src>, which React hoists into
// <head>. React looked for an existing copy only as script[async], never found
// Turbopack's, and added its own: every chunk of the page ran twice (the
// browser took the second from its cache, or fetched it again with the cache
// off). patches/next@16.3.8.patch makes React's lookup find any <script>
// with that src; app/chunksRunOnce.test.ts keeps the patch with the Next this
// repo runs.

test.use({ viewport: { width: 1280, height: 860 } })

/**
 * Counts every run of every Turbopack chunk: each one pushes itself onto
 * globalThis.TURBOPACK as it runs. Each chunk <script> is marked data-done
 * once it has loaded (and so run) or failed.
 */
async function countChunkRuns(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((records) => {
      for (const { addedNodes } of records)
        for (const node of addedNodes) {
          if (!(node instanceof HTMLScriptElement) || !node.src.includes("/_next/static/chunks/")) continue
          const done = () => (node.dataset.done = "")
          node.addEventListener("load", done, { once: true })
          node.addEventListener("error", done, { once: true })
        }
    }).observe(document, { childList: true, subtree: true })
    const runs: Record<string, number> = {}
    const pathOf = (head: unknown) => {
      const src = typeof head === "string" ? head : ((head as Element | null)?.getAttribute?.("src") ?? "")
      try {
        return new URL(src, location.href).pathname
      } catch {
        return src
      }
    }
    const count = (chunk: unknown) => {
      if (!Array.isArray(chunk)) return
      const path = pathOf(chunk[0])
      runs[path] = (runs[path] ?? 0) + 1
    }
    // Before the runtime: an array the chunks push onto. After it: the runtime's own push.
    const early: unknown[] = []
    early.push = (...chunks: unknown[]) => {
      chunks.forEach(count)
      return Array.prototype.push.apply(early, chunks)
    }
    let current: unknown = early
    Object.defineProperty(globalThis, "TURBOPACK", {
      configurable: true,
      get: () => current,
      set(value: unknown) {
        const push = (value as { push?: (chunk: unknown) => unknown } | null)?.push
        if (value && !Array.isArray(value) && typeof push === "function") {
          current = {
            push(chunk: unknown) {
              count(chunk)
              return push.call(value, chunk)
            },
          }
        } else current = value
      },
    })
    ;(globalThis as { __chunkRuns?: Record<string, number> }).__chunkRuns = runs
  })
}

/**
 * Every chunk <script> in the page has run or failed: a second run would have
 * been counted. The nomodule one (old browsers' polyfills) never loads in a
 * browser that runs modules, so it isn't waited for.
 */
const chunksDone = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.querySelectorAll('script[src*="/_next/static/chunks/"]:not([nomodule], [data-done])').length), {
      message: "chunk <script> tags still loading",
      timeout: 30_000,
    })
    .toBe(0)

/** Chunks that ran more than once, and chunk <script> tags in the page more than once. */
async function twice(page: Page) {
  return page.evaluate(() => {
    const runs = (globalThis as { __chunkRuns?: Record<string, number> }).__chunkRuns ?? {}
    const tags: Record<string, number> = {}
    for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/_next/static/chunks/"]'))) {
      const path = new URL(s.src).pathname
      tags[path] = (tags[path] ?? 0) + 1
    }
    return {
      counted: Object.keys(runs).length,
      ran: Object.entries(runs).filter(([, n]) => n > 1),
      tagged: Object.entries(tags).filter(([, n]) => n > 1),
    }
  })
}

test("a page reached by a client navigation runs each of its chunks once", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await countChunkRuns(page)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {})
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const inbox = page.locator('a[href="/app/inbox"]').first()
  await expect(inbox).toBeVisible({ timeout: 60_000 })
  // The first load runs each chunk once already: its tags are the server's own.
  expect((await twice(page)).counted, "chunks are counted as they run").toBeGreaterThan(0)

  // A page that writes its own address once it shows (a replaceState, which
  // Next follows) supersedes a navigation still on its way, so a click made
  // before that write can be lost to it. /app/myTask writes its address once,
  // on mount: the layout it shows (?tab=list, MyTaskDesktop). Its list writes
  // only what a person changes, never on opening (lib/navigation/addressLater;
  // e2e/myTaskKeepsClick.spec.ts). The next click waits for the layout's write.
  const settled: Record<string, () => Promise<void>> = {
    "/app/myTask": () =>
      expect
        .poll(() => page.evaluate(() => new URL(location.href).searchParams.get("tab")), {
          message: "/app/myTask's own address write",
          timeout: 30_000,
        })
        .toBe("list"),
  }
  for (const path of ["/app/inbox", "/app/myTask", "/app/later"]) {
    await page.locator(`a[href="${path}"]`).first().click()
    await page.waitForURL((url) => url.pathname === path, { timeout: 60_000 })
    await settled[path]?.()
    // The page's hoisted tags commit before the router's pushState.
    await chunksDone(page)
    const seen = await twice(page)
    expect(seen.ran, `chunks that ran twice after the client navigation to ${path}`).toEqual([])
    expect(seen.tagged, `chunk <script> tags in the page twice after ${path}`).toEqual([])
  }
})
