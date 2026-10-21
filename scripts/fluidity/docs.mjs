// The doc fluidity budgets (docs programme A2, G-PERF): how fast a doc opens
// until it is editable, what a keystroke costs, how a 2,000-block doc behaves,
// how many sockets a tab opens and how much script the doc route adds over
// Home, each held to scripts/fluidity/doc-budgets.json. The run exits non-zero
// when a budget is missed.
//
// It runs a production build (`next start`) against a fake server side
// (fakeApp.mjs): fixtures for the API and an in-memory collaboration server,
// with a round trip of --rtt ms on every request and message, and two more for
// each new socket's handshakes. Nothing reaches the demo or any other server,
// so runs are comparable from one build to the next. (perf-data/docperf.mjs in
// the programme's design folder measured the live demo; this is its port.)
//
//   node scripts/fluidity/docs.mjs --base http://localhost:3000 --cpu 4
//   options: --runs 3  --rtt 150  --device desktop|phone  --only open,type,big,scroll,paste,sockets,weight,reader
//            --budgets <file>  --out <file.json>  --label <name>  --result <file> (rows, for run.mjs)
// Under Docker network churn, run it in its own namespace:
//   ~/bin/browser-isolated --forward 3000 -- node scripts/fluidity/docs.mjs ...
import { chromium } from "@playwright/test"
import { gzipSync } from "node:zlib"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fingerScroll, installProbe, keyStats, mark, median, movedPx, scrollAt, scrollGesture, since, startFrames, stopFrames } from "./lib.mjs"
import { check } from "./budgets.mjs"
import { USERS, collabFor, fakeApp } from "./fakeApp.mjs"
import { bigDocBlocks, docFromBlocks, launchPlanBlocks } from "./fakeCollab.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const BASE = opt("base", "http://localhost:3000")
const CPU = Number(opt("cpu", 1))
const RUNS = Number(opt("runs", 3))
const RTT = Number(opt("rtt", 150))
const DEVICE = opt("device", "desktop")
const ONLY = new Set((opt("only", "open,type,big,scroll,paste,sockets,weight,reader") || "").split(","))
const BUDGETS = JSON.parse(readFileSync(opt("budgets", join(here, "doc-budgets.json")), "utf8"))
const OUT = opt("out", "")
const LABEL = opt("label", "")
const PHONE = DEVICE === "phone"
const SENTENCE = "Pilot customers get the checklist the Friday before."

// ---- the docs ----
const LEVELS = { sam: "full", vic: "view" }
const id = (n) => `d0c00000-0000-4000-8000-${String(n).padStart(12, "0")}`
const plan = docFromBlocks(launchPlanBlocks(), { epoch: "Q4" })
const big = docFromBlocks(bigDocBlocks(2000), { epoch: "BIG" })
const DOCS = [
  { id: id(1), title: "Q4 launch plan", html: plan.html, update: plan.update, levels: LEVELS },
  { id: id(2000), title: "Two thousand blocks", html: big.html, update: big.update, levels: LEVELS },
]
// Docs opened once each in-app ("first"), then again.
for (let r = 0; r < RUNS; r++) {
  const d = docFromBlocks(launchPlanBlocks(), { epoch: `R${r}` })
  DOCS.push({ id: id(100 + r), title: `Plan ${r + 1}`, html: d.html, update: d.update, levels: LEVELS })
}
const PLAN = DOCS[0].id
const BIG = DOCS[1].id

const phoneOpts = {
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}
const viewport = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }

// ---- in the page: the first frame with the doc's text, and the first editable one ----
function watcher() {
  window.__docWatch = (t0) => {
    const T = (window.__docT = { t0, body: null, via: null, edit: null })
    const vis = (el) => el && el.getClientRects().length > 0 && (el.textContent || "").trim().length > 40
    const tick = (ts) => {
      const snap = document.querySelector("[data-doc-snapshot]")
      const any = document.querySelector(".doc-editor .ProseMirror")
      const pm = document.querySelector('.doc-editor .ProseMirror[contenteditable="true"]')
      if (T.body == null) {
        if (vis(snap)) {
          T.body = ts - t0
          T.via = "snapshot"
        } else if (vis(any)) {
          T.body = ts - t0
          T.via = "editor"
        }
      }
      if (T.edit == null && vis(pm)) T.edit = ts - t0
      if (T.body == null || T.edit == null) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  if (location.pathname.startsWith("/app/doc/")) window.__docWatch(0)
}

async function waitDoc(page, ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const T = await page.evaluate(() => window.__docT).catch(() => null)
    if (T && T.edit != null && T.body != null) return T
    await page.waitForTimeout(50)
  }
  return page.evaluate(() => window.__docT).catch(() => null)
}

const collab = collabFor(DOCS)
const browser = await chromium.launch()

async function person(user) {
  const context = await browser.newContext({ viewport, ...(PHONE ? phoneOpts : {}), serviceWorkers: "block" })
  await installProbe(context)
  await context.addInitScript(watcher)
  await fakeApp(context, { app: BASE, user, docs: DOCS, collab, rtt: RTT })
  return context
}
async function newPage(context) {
  const page = await context.newPage()
  if (CPU > 1) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  }
  return page
}
const push = (page, url) => page.evaluate((u) => window.next.router.push(u), url)
async function home(page) {
  await page.goto(BASE + "/app/home", { waitUntil: "load" })
  await page.waitForTimeout(2500)
}

async function typeSentence(page) {
  const before = await mark(page)
  await page.keyboard.type(" " + SENTENCE, { delay: 45 })
  await page.waitForTimeout(600)
  const m = await since(page, before)
  const k = keyStats(m, SENTENCE.length + 1)
  return { rendersPerKey: Math.round((m.renders / k.typed) * 10) / 10, keyP50: k.p50, keyP95: k.p95, keyMax: k.max, longMs: m.longMs, inp: m.inp }
}

const result = { label: LABEL, base: BASE, cpu: CPU, rtt: RTT, device: DEVICE, at: new Date().toISOString(), open: [], typing: [], big: [], measured: {} }
const M = result.measured

// ---- opens ----
if (ONLY.has("open") || ONLY.has("sockets") || ONLY.has("type")) {
  // A cold tab straight to the doc: the browser's cache is warm, the app's isn't.
  const coldContext = await person(USERS.sam)
  if (ONLY.has("open")) {
    for (let r = 0; r < RUNS; r++) {
      const p = await newPage(coldContext)
      await p.goto(BASE + `/app/doc/${PLAN}`, { waitUntil: "commit" })
      const T = await waitDoc(p)
      await p.waitForTimeout(800)
      const m = await since(p, { t: 0, commits: 0, renders: 0, byName: {}, selfMs: {}, origins: {} })
      const fcp = await p.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null)
      result.open.push({ kind: "cold", run: r, body: Math.round(T?.body), edit: Math.round(T?.edit), via: T?.via, fcp: Math.round(fcp), longMs: m.longMs })
      await p.close()
    }
  }
  await coldContext.close()

  // In-app, in one tab: from Home to a doc it hasn't opened, Home, then the same doc again.
  const appContext = await person(USERS.sam)
  const page = await newPage(appContext)
  await home(page)
  for (let r = 0; r < RUNS; r++) {
    const doc = DOCS[2 + r].id
    for (const kind of ["first", "again"]) {
      const before = await mark(page)
      await page.evaluate((url) => {
        window.__docWatch(performance.now())
        window.next.router.push(url)
      }, `/app/doc/${doc}`)
      const T = await waitDoc(page)
      await page.waitForTimeout(800)
      const m = await since(page, before)
      result.open.push({ kind, run: r, body: Math.round(T?.body), edit: Math.round(T?.edit), via: T?.via, longMs: m.longMs, renders: m.renders })
      await push(page, "/app/home")
      await page.waitForTimeout(2500)
    }
  }
  M.socketsPerTab = appContext.__collabSockets.length

  // Typing in a 12-block doc, 2 s after it is editable.
  if (ONLY.has("type")) {
    for (let r = 0; r < RUNS; r++) {
      await push(page, `/app/doc/${PLAN}`)
      await page.locator('.doc-editor .ProseMirror[contenteditable="true"]').waitFor({ timeout: 30000 })
      await page.waitForTimeout(2000)
      const para = page.locator('.doc-editor .ProseMirror[contenteditable="true"] p').filter({ hasText: "Anything else goes" }).first()
      if (PHONE) await para.tap()
      else await para.click()
      await page.keyboard.press("End")
      await page.waitForTimeout(400)
      result.typing.push(await typeSentence(page))
      await push(page, "/app/home")
      await page.waitForTimeout(1500)
    }
  }
  await appContext.close()
}

// ---- the doc route's script over Home's ----
if (ONLY.has("weight")) {
  const context = await person(USERS.sam)
  const page = await newPage(context)
  const scripts = new Map()
  page.on("response", async (resp) => {
    const url = resp.url()
    if (!/\/_next\/static\/.+\.js(\?|$)/.test(url) || scripts.has(url)) return
    scripts.set(url, null)
    try {
      scripts.set(url, gzipSync(await resp.body(), { level: 6 }).length)
    } catch {
      scripts.delete(url)
    }
  })
  await home(page)
  await page.waitForTimeout(2000)
  const atHome = new Set(scripts.keys())
  await push(page, `/app/doc/${PLAN}`)
  await page.locator('.doc-editor .ProseMirror[contenteditable="true"]').waitFor({ timeout: 30000 })
  await page.waitForTimeout(3000)
  const added = [...scripts.entries()].filter(([u, n]) => !atHome.has(u) && n != null)
  M.routeKbOverHome = Math.round(added.reduce((a, [, n]) => a + n, 0) / 1024)
  result.weight = { files: added.length, top: added.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u, n]) => `${u.split("/").pop()} ${Math.round(n / 1024)}KB`) }
  await context.close()
}

// ---- the 2,000-block doc ----
if (ONLY.has("big")) {
  const context = await person(USERS.sam)
  for (let r = 0; r < Math.min(RUNS, 2); r++) {
    const p = await newPage(context)
    await p.goto(BASE + `/app/doc/${BIG}`, { waitUntil: "commit" })
    const T = await waitDoc(p, 180000)
    await p.waitForTimeout(1500)
    const m = await since(p, { t: 0, commits: 0, renders: 0, byName: {}, selfMs: {}, origins: {} })
    const row = { run: r, body: Math.round(T?.body), edit: Math.round(T?.edit), longMs: m.longMs }
    const target = p.locator(".doc-editor .ProseMirror p").filter({ hasText: "Block 1002 " }).first()
    await target.scrollIntoViewIfNeeded()
    await p.waitForTimeout(500)
    if (PHONE) await target.tap()
    else await target.click()
    await p.keyboard.press("End")
    await p.waitForTimeout(400)
    // Per key: ProseMirror's dispatch (plugins, decorations, the view's update).
    await p.evaluate(() => {
      const view = document.querySelector(".doc-editor .ProseMirror").editor.view
      const T = (window.__keyCost = { dispatchMs: 0, each: [] })
      const dispatch = view.dispatch.bind(view)
      view.dispatch = (tr) => {
        const t0 = performance.now()
        try {
          return dispatch(tr)
        } finally {
          const d = performance.now() - t0
          T.dispatchMs += d
          if (tr.docChanged) T.each.push(d)
        }
      }
    })
    const ty = await typeSentence(p)
    const cost = await p.evaluate(() => window.__keyCost)
    const keys = SENTENCE.length + 1
    // Then, in a burst of its own (counting costs time): the layout reads a
    // keystroke makes outside ProseMirror's own scroll of the caret into
    // view, which every typed character asks for (I20: no plugin reads
    // layout per key). Each is named by the code that made it.
    await p.evaluate(() => {
      const L = (window.__layout = { reads: 0, by: {} })
      for (const name of ["getBoundingClientRect", "getClientRects"]) {
        const orig = Element.prototype[name]
        Element.prototype[name] = function (...a) {
          const stack = new Error().stack || ""
          if (!/scrollToSelection|scrollRectIntoView/.test(stack)) {
            L.reads++
            const at = (stack.split("\n")[2] || "").trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/_next\/static\/chunks\//, "").replace(/\)$/, "")
            L.by[at] = (L.by[at] || 0) + 1
          }
          return orig.apply(this, a)
        }
      }
    })
    const BURST = "layout probe"
    await p.keyboard.type(" " + BURST, { delay: 45 })
    await p.waitForTimeout(300)
    const layout = await p.evaluate(() => window.__layout)
    row.type = {
      ...ty,
      // The median keystroke's dispatch: a machine busy with other work
      // inflates some keys many times over, and the mean with them.
      dispatchMsPerKey: Math.round((median(cost.each) ?? 0) * 10) / 10,
      dispatchMsMean: Math.round((cost.dispatchMs / keys) * 10) / 10,
      layoutReadsPerKey: Math.round((layout.reads / (BURST.length + 1)) * 10) / 10,
      layoutReadsBy: Object.entries(layout.by).sort((a, b) => b[1] - a[1]).slice(0, 4),
    }
    row.blocks = await p.evaluate(() => document.querySelector(".doc-editor .ProseMirror")?.childElementCount)
    // Reading the 2,000-block doc: a long scroll down and back, as a wheel or
    // a finger gives it (fluid-05: frame time while it scrolls).
    if (ONLY.has("scroll")) {
      const cdp = await context.newCDPSession(p)
      await p.keyboard.press("Escape").catch(() => {})
      const box = await p.locator(".doc-editor .ProseMirror").first().boundingBox()
      const from = { x: (box?.x ?? 400) + Math.min(300, (box?.width ?? 600) / 2), y: 450 }
      // A phone's is a finger's, inside the part of the doc on screen; a computer's a wheel's.
      const vp = p.viewportSize()
      const view = { left: Math.max(0, box?.x ?? 0), top: Math.max(0, box?.y ?? 0), right: Math.min(vp.width, (box?.x ?? 0) + (box?.width ?? vp.width)), bottom: Math.min(vp.height, (box?.y ?? 0) + (box?.height ?? vp.height)) }
      const s0 = await scrollAt(p, from)
      const b0 = await mark(p)
      await startFrames(p)
      if (PHONE) await fingerScroll(cdp, { box: view, dy: 12000, speed: 1200 })
      else await scrollGesture(cdp, { ...from, dy: -12000, speed: 2400 })
      const s1 = await scrollAt(p, from)
      if (PHONE) await fingerScroll(cdp, { box: view, dy: -8000, speed: 1200 })
      else await scrollGesture(cdp, { ...from, dy: 8000, speed: 2400 })
      const f = await stopFrames(p)
      const sm = await since(p, b0)
      const moved = movedPx(s0, s1) + movedPx(s1, await scrollAt(p, from))
      row.scroll = { frameP95: f.p95, droppedPct: f.droppedPct, worst: f.worst, longMs: sm.longMs, input: PHONE ? "touch" : "wheel", movedPx: moved }
      // A scroll that moved nothing measured an idle page: no frame numbers from it.
      if (!moved) row.scroll = { error: `the ${PHONE ? "finger's" : "wheel's"} scroll moved nothing`, input: row.scroll.input }
    }
    result.big.push(row)
    await p.close()
  }
  await context.close()
}

// ---- a paste: sixty paragraphs and a list into the plan (fluid-05) ----
// A synthetic paste event carrying HTML, as a browser fires one; timed until
// the last pasted paragraph is in the editor.
if (ONLY.has("paste")) {
  const context = await person(USERS.sam)
  for (let r = 0; r < RUNS; r++) {
    const p = await newPage(context)
    await p.goto(BASE + `/app/doc/${PLAN}`, { waitUntil: "commit" })
    await waitDoc(p)
    await p.waitForTimeout(1500)
    const para = p.locator('.doc-editor .ProseMirror[contenteditable="true"] p').filter({ hasText: "Anything else goes" }).first()
    if (PHONE) await para.tap()
    else await para.click()
    await p.keyboard.press("End")
    await p.waitForTimeout(400)
    const b0 = await mark(p)
    const ms = await p.evaluate(async () => {
      const html = Array.from({ length: 60 }, (_, i) => `<p>Pasted paragraph ${i + 1}: the launch checklist, the rollback steps and who signs off.</p>`).join("") + "<ul>" + Array.from({ length: 20 }, (_, i) => `<li>Pasted item ${i + 1}</li>`).join("") + "</ul><p>Pasted end marker.</p>"
      const el = document.querySelector('.doc-editor .ProseMirror[contenteditable="true"]')
      const dt = new DataTransfer()
      dt.setData("text/html", html)
      dt.setData("text/plain", "Pasted end marker.")
      const t0 = performance.now()
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
      return new Promise((resolve) => {
        const tick = () => {
          if ((el.textContent || "").includes("Pasted end marker.")) resolve(Math.round(performance.now() - t0))
          else if (performance.now() - t0 > 15000) resolve(null)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    })
    await p.waitForTimeout(800)
    const m = await since(p, b0)
    result.paste = [...(result.paste ?? []), { run: r, ms, longMs: m.longMs, renders: m.renders }]
    await p.close()
  }
  await context.close()
}

// ---- a reader watching someone type ----
if (ONLY.has("reader")) {
  const samContext = await person(USERS.sam)
  const vicContext = await person(USERS.vic)
  const sam = await newPage(samContext)
  const vic = await newPage(vicContext)
  await sam.goto(BASE + `/app/doc/${PLAN}`)
  await vic.goto(BASE + `/app/doc/${PLAN}`)
  await sam.locator('.doc-editor .ProseMirror[contenteditable="true"]').waitFor({ timeout: 30000 })
  await vic.locator(".doc-editor .ProseMirror").first().waitFor({ timeout: 30000 })
  await vic.waitForTimeout(1500)
  if (vicContext.__collabSockets.length === 0) {
    M.readerSeesTypingMs = null
    result.reader = "n/a: this build's doc page gives a reader the saved body (DocView is not on useDocSession yet)"
  } else {
    const para = sam.locator('.doc-editor .ProseMirror[contenteditable="true"] p').last()
    await para.click()
    await sam.keyboard.press("End")
    const t0 = Date.now()
    await sam.keyboard.type(" Live for Vic.", { delay: 10 })
    let seen = null
    while (Date.now() - t0 < 5000) {
      if ((await vic.locator(".doc-editor .ProseMirror").first().innerText()).includes("Live for Vic.")) {
        seen = Date.now() - t0
        break
      }
      await vic.waitForTimeout(20)
    }
    M.readerSeesTypingMs = seen
    M.readerCanEdit = (await vic.locator('.doc-editor .ProseMirror[contenteditable="true"]').count()) > 0
  }
  await samContext.close()
  await vicContext.close()
}

await browser.close()

// ---- the summary, and the budgets ----
const med = (xs, k) => median(xs.map((x) => x[k]))
for (const kind of ["cold", "first", "again"]) {
  const xs = result.open.filter((o) => o.kind === kind)
  if (!xs.length) continue
  M[`${kind}BodyMs`] = med(xs, "body")
  M[`${kind}EditableMs`] = med(xs, "edit")
  M[`${kind}LongMs`] = med(xs, "longMs")
}
if (result.open.some((o) => o.kind === "first")) {
  const xs = result.open.filter((o) => o.kind === "first")
  M.firstEditableAfterBodyMs = median(xs.map((x) => x.edit - x.body))
}
if (result.typing.length) {
  M.keyP50Ms = med(result.typing, "keyP50")
  M.keyP95Ms = med(result.typing, "keyP95")
  M.rendersPerKey = med(result.typing, "rendersPerKey")
}
if (result.paste?.length) {
  M.pasteMs = median(result.paste.map((x) => x.ms))
  M.pasteLongMs = median(result.paste.map((x) => x.longMs))
  M.pasteRenders = median(result.paste.map((x) => x.renders))
}
if (result.big.some((b) => b.scroll)) {
  M.bigScrollFrameP95Ms = median(result.big.map((b) => b.scroll?.frameP95))
  M.bigScrollDroppedPct = median(result.big.map((b) => b.scroll?.droppedPct))
}
if (result.big.length) {
  M.bigBodyMs = med(result.big, "body")
  M.bigEditableMs = med(result.big, "edit")
  M.bigLongMs = med(result.big, "longMs")
  M.bigKeyP95Ms = median(result.big.map((b) => b.type.keyP95))
  M.bigDispatchMsPerKey = median(result.big.map((b) => b.type.dispatchMsPerKey))
  M.bigLayoutReadsPerKey = median(result.big.map((b) => b.type.layoutReadsPerKey))
}

// The one checker (budgets.mjs). A report-only budget is printed against its
// target and never fails the run: a metric too noisy on a shared machine to
// hold yet (doc-budgets.json). A part not asked for (--only) has no row, and
// a value the build can't give (null) is printed, never failing.
const rows = check(BUDGETS, M, { cpu: CPU, skipMissing: true })
const failed = rows.filter((r) => r.ok === false && r.enforced).length
result.budgets = rows
console.log(`docs.mjs ${LABEL} cpu ${CPU}× rtt ${RTT} ms ${DEVICE} ${BASE}`)
console.log("metric".padEnd(28), "value".padStart(8), "max".padStart(8), "target".padStart(8), " owner ok")
for (const r of rows) {
  const verdict = r.ok === null ? "n/a" : r.ok ? "ok" : r.enforced ? "MISSED" : "over (report only)"
  console.log(r.metric.padEnd(28), String(r.value).padStart(8), String(r.max).padStart(8), String(r.target ?? "").padStart(8), ` ${r.owner.padEnd(5)} ${verdict}`)
}
if (result.reader && typeof result.reader === "string") console.log(result.reader)
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2))
// The rows as run.mjs reads them (scenarios.json).
if (opt("result", null)) writeFileSync(opt("result"), JSON.stringify({ scenario: "docs", cpu: CPU, metrics: M, checks: rows }, null, 2))
if (failed) {
  console.log(`${failed} budget(s) missed`)
  process.exit(1)
}
