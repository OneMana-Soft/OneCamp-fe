#!/usr/bin/env node
// The content area's fluidity (design v3, content wave): the four things in
// docs, tables, the calendar and boards that must never get slower.
//
//   pnpm next build && pnpm next start -p 3171
//   node scripts/fluidity/content.mjs --base http://localhost:3171 --label after --out /tmp/flu-content
//
// Options: --runs 3 (medians), --cpu 4 (CPU slowdown), --only doc,table,calendar,board
//
//   doc       type a sentence into the Q4 launch plan: React renders per key
//             and per-key latency (wave 2: 17 renders per key).
//   table     the Launch budget grown to 1,000 rows in the page (its bundle
//             answered locally with copies of its rows), scrolled down and
//             across: frames per second and slow frames (wave 2: 59 fps).
//   calendar  switch Week, Month, Day, Week: input to next paint, long tasks
//             and renders per switch.
//   board     pan a board with the wheel: frames per second. The demo has no
//             boards, so a board's metadata is answered locally (it is never
//             created); the canvas is empty but its chrome is the real one.
//
// NOTHING IS WRITTEN TO THE SHARED DEMO: lib.mjs aborts every write except
// the demo sign-in, and the collab socket never carries an edit.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { launch, demoContext, enterDemo, mark, since, keyStats, median, FE, BE } from "./lib.mjs"

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return dflt
  const v = args[i + 1]
  return v === undefined || v.startsWith("--") ? true : v
}
const BASE = opt("base", "http://localhost:3171")
const LABEL = opt("label", "run")
const OUT = opt("out", "/tmp/fluidity-content")
const RUNS = Number(opt("runs", 3))
const CPU = Number(opt("cpu", 4))
const ONLY = opt("only", "") ? String(opt("only")).split(",") : ["doc", "table", "calendar", "board"]
mkdirSync(OUT, { recursive: true })

const SENTENCE = "Pilot customers get the checklist the Friday before."
const FAKE_BOARD = "0b0a7d00-0000-4000-8000-00000000b0a7"

function startFrames(page) {
  return page.evaluate(() => {
    const f = (window.__fluFrames = [])
    let last = performance.now()
    const tick = (t) => {
      f.push(t - last)
      last = t
      if (f.length < 4000 && window.__fluFrames === f) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
async function stopFrames(page) {
  const f = await page.evaluate(() => {
    const out = window.__fluFrames || []
    window.__fluFrames = null
    return out
  })
  const body = f.slice(2) // the first frames straddle the start
  const total = body.reduce((a, b) => a + b, 0)
  return {
    frames: body.length,
    fps: total ? Math.round((body.length / total) * 1000 * 10) / 10 : null,
    slow: body.filter((d) => d > 34).length,
    worst: body.length ? Math.round(Math.max(...body)) : null,
  }
}

// A navigation can be cut off by the app's own redirect just after sign-in:
// try again, then let the page settle.
async function go(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "load" })
      await page.waitForTimeout(500)
      if (page.url().startsWith(url.split("?")[0])) return
    } catch {
      await page.waitForTimeout(1000)
    }
  }
  await page.goto(url)
}

async function measureStep(page, act) {
  const before = await mark(page)
  const t0 = Date.now()
  let error
  try {
    await act()
  } catch (e) {
    error = String(e?.message || e).split("\n")[0].slice(0, 160)
  }
  const wall = Date.now() - t0
  await page.waitForTimeout(600)
  const m = await since(page, before)
  return { m, wall, error }
}

async function fail(page, name, e, rows) {
  const error = String(e?.message || e).split("\n")[0].slice(0, 160)
  rows.push({ step: `${name}: failed`, error })
  await page.screenshot({ path: join(OUT, `${LABEL}-${name}-failed.png`) }).catch(() => {})
}

async function runOnce(browser) {
  const ctx = await demoContext(browser, { base: BASE })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  const rows = []
  await enterDemo(page)
  await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor({ timeout: 60000 }).catch(() => {})
  const json = (path) =>
    page.evaluate(async ({ BE, path }) => (await fetch(BE + path, { credentials: "include" })).json().catch(() => null), { BE, path })
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })

  if (ONLY.includes("doc")) try {
    const nav = await json("/user/sidebarNav")
    const find = (n, k, nk, name) => {
      const out = []
      const walk = (x) => {
        if (Array.isArray(x)) x.forEach(walk)
        else if (x && typeof x === "object") {
          if (k in x && String(x[nk] || "").trim() === name) out.push(x[k])
          Object.values(x).forEach(walk)
        }
      }
      walk(n)
      return out[0]
    }
    const doc = find(nav, "doc_uuid", "doc_title", "Q4 launch plan")
    await go(page, FE + `/app/doc/${doc}`)
    const body = page.getByText("We launch on the last Tuesday").first()
    await body.waitFor({ timeout: 60000 })
    await page.waitForTimeout(2000)
    await body.click()
    await page.keyboard.press("End")
    const { m, error } = await measureStep(page, () => page.keyboard.type(" " + SENTENCE, { delay: 45 }))
    const k = keyStats(m, SENTENCE.length + 1)
    rows.push({ step: "doc: type a sentence", error, rendersPerKey: Math.round((m.renders / k.typed) * 10) / 10, keyP50: k.p50, keyP95: k.p95, keyMax: k.max, longMs: m.longMs, inp: m.inp })
  } catch (e) {
    await fail(page, "doc", e, rows)
  }

  if (ONLY.includes("table")) try {
    const list = await json("/tables")
    const budget = (list?.data || []).find((t) => t.name === "Launch budget")
    // The bundle, answered here with its rows copied to 1,000.
    await page.route((u) => u.host === new URL(BE).host && u.pathname === `/tables/${budget.id}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback()
      const resp = await route.fetch()
      const j = await resp.json()
      const b = j.data || j
      const src = b.rows || []
      const many = []
      for (let i = 0; i < 1000; i++) {
        const r = src[i % src.length]
        many.push({ ...r, id: `${r.id.slice(0, 24)}${String(i).padStart(12, "0")}`, position: i })
      }
      b.rows = many
      b.rows_truncated = false
      await route.fulfill({ response: resp, json: j })
    })
    await go(page, FE + `/app/tables/${budget.id}`)
    // Cells (and the name) are inputs, so the grid is found by its element
    // and the pointer put over the middle of it.
    await page.locator("table, [role=grid]").first().waitFor({ timeout: 60000 })
    await page.waitForTimeout(3000)
    await page.mouse.move(860, 560)
    await startFrames(page)
    const { m, error } = await measureStep(page, async () => {
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, 300)
        await page.waitForTimeout(40)
      }
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(i < 10 ? 220 : -220, 0)
        await page.waitForTimeout(40)
      }
    })
    const f = await stopFrames(page)
    rows.push({ step: "table: scroll 1,000 rows", error, fps: f.fps, slowFrames: f.slow, worstFrame: f.worst, longMs: m.longMs, renders: m.renders, top: m.topApp ?? m.top, loafTop: m.loafTop, slowest: m.slowest })
  } catch (e) {
    await fail(page, "table", e, rows)
  }

  if (ONLY.includes("calendar")) try {
    await go(page, FE + "/app/calendar")
    await page.waitForTimeout(4000)
    // Whatever the switcher is made of (buttons, radios or tabs), by its label.
    const view = (name) => page.locator("button, [role=radio], [role=tab]").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, "i") }).first()
    for (const name of ["Week", "Month", "Day", "Week"]) {
      const { m, error } = await measureStep(page, () => view(name).click({ timeout: 10000 }))
      rows.push({ step: `calendar: switch to ${name}`, error, inp: m.inp, longMs: m.longMs, renders: m.renders, commits: m.commits, top: m.topApp ?? m.top, loafTop: m.loafTop })
    }
  } catch (e) {
    await fail(page, "calendar", e, rows)
  }

  if (ONLY.includes("board")) try {
    const me = await json("/user/profile")
    const user = me?.data || {}
    await page.route((u) => u.host === new URL(BE).host && u.pathname.endsWith(`/board/getBoardInfo/${FAKE_BOARD}`), (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": FE, "access-control-allow-credentials": "true" },
        json: {
          msg: "ok",
          data: {
            board_uuid: FAKE_BOARD,
            board_title: "Launch retro",
            board_edit_access: 1,
            board_read_access: 1,
            board_comment_access: 1,
            board_private: false,
            board_created_by: user,
            board_created_at: new Date().toISOString(),
            board_updated_at: new Date().toISOString(),
            board_mqtt_topic: "",
          },
        },
      }),
    )
    await go(page, FE + `/app/board/${FAKE_BOARD}`)
    await page.locator(".excalidraw").first().waitFor({ timeout: 60000 })
    await page.waitForTimeout(2500)
    const box = await page.locator(".excalidraw canvas").last().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await startFrames(page)
    const { m, error } = await measureStep(page, async () => {
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(i % 20 < 10 ? 120 : -120, i < 20 ? 160 : -160)
        await page.waitForTimeout(40)
      }
    })
    const f = await stopFrames(page)
    rows.push({ step: "board: pan the canvas", error, fps: f.fps, slowFrames: f.slow, worstFrame: f.worst, longMs: m.longMs, renders: m.renders })
  } catch (e) {
    await fail(page, "board", e, rows)
  }

  await ctx.close()
  return rows
}

const browser = await launch()
console.log(`content fluidity: ${LABEL}, ${BASE}, cpu ${CPU}x, ${RUNS} run(s)`)
const runs = []
for (let r = 1; r <= RUNS; r++) {
  try {
    runs.push(await runOnce(browser))
  } catch (e) {
    console.log(`run ${r} failed: ${String(e?.message || e).split("\n")[0]}`)
  }
}
await browser.close()

const steps = [...new Set(runs.flatMap((r) => r.map((s) => s.step)))]
const cols = ["rendersPerKey", "keyP50", "keyP95", "fps", "slowFrames", "worstFrame", "inp", "longMs", "renders"]
const table = steps.map((step) => {
  const got = runs.map((r) => r.find((s) => s.step === step)).filter(Boolean)
  const row = { step, ok: `${got.filter((s) => !s.error).length}/${got.length}` }
  for (const c of cols) row[c] = median(got.map((s) => s[c]))
  const errs = got.map((s) => s.error).filter(Boolean)
  if (errs.length) row.error = errs[0]
  return row
})
writeFileSync(join(OUT, `content-${LABEL}.json`), JSON.stringify({ label: LABEL, base: BASE, cpu: CPU, runs, table }, null, 2))
console.log(`\n| step | ok | renders/key | key p50/p95 | fps | slow frames | worst ms | INP ms | long ms | renders |`)
console.log(`|---|---|---|---|---|---|---|---|---|---|`)
for (const r of table) {
  const keys = r.keyP50 != null ? `${r.keyP50}/${r.keyP95}` : "-"
  console.log(`| ${r.step} | ${r.ok} | ${r.rendersPerKey ?? "-"} | ${keys} | ${r.fps ?? "-"} | ${r.slowFrames ?? "-"} | ${r.worstFrame ?? "-"} | ${r.inp ?? "-"} | ${r.longMs ?? "-"} | ${r.renders ?? "-"} |${r.error ? ` ${r.error}` : ""}`)
}
