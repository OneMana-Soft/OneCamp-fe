#!/usr/bin/env node
// Any public page, measured the way the fluidity scenarios measure the app:
// for the head-to-head rows (design/WIN-ALL-ROWS.md "fluidity"), a page anyone
// can open without signing in, ours (a published doc, the booking page) beside
// a rival's (a published page, a shared view, a public calendar), over the real
// network, from the same machine, with the same probe (lib.mjs).
//
// Per load, cold (cache cleared) and warm (the second visit): first contentful
// paint, largest contentful paint, the first frame with text in view, long
// tasks and blocking time until LCP + 3 s, layout shift, and bytes on the wire
// (script and all). Then the page scrolled down and back: frame time p95 and
// the share of frames dropped.
//
// It reads; it never signs in, never posts, never fills a form. The pages are
// given on the command line (or a file of lines "label url"), so no rival's
// address lives in this repository.
//
//   node scripts/fluidity/public.mjs --pages pages.txt --runs 5 --device desktop|phone --cpu 1|4 --out result.json
import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync } from "node:fs"

import { cpuState, cpusAllowed, fingerScroll, hostLoad, installProbe, median, movedPx, p95, scrollAt, scrollGesture, since, startFrames, stopFrames } from "./lib.mjs"

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const RUNS = Number(opt("runs", 5))
const CPU = Number(opt("cpu", 1))
const DEVICE = opt("device", CPU > 1 ? "phone" : "desktop")
const PHONE = DEVICE === "phone"
const OUT = opt("out", null)
const pages = readFileSync(opt("pages", "/dev/stdin"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [label, url] = l.split(/\s+/)
    return { label, url }
  })

const phoneOpts = {
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}
const viewport = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }

// The first frame with a block of text in view: the page is readable.
function firstText() {
  window.__fluText = null
  const tick = () => {
    if (window.__fluText != null) return
    for (const el of document.querySelectorAll("p, h1, h2, li, td, [role=gridcell], [role=heading], span, div")) {
      if (el.childElementCount > 2) continue
      const t = (el.textContent || "").trim()
      if (t.length < 24) continue
      const r = el.getBoundingClientRect()
      if (r.height > 0 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth) {
        window.__fluText = performance.now()
        return
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const browser = await chromium.launch()
const result = { at: new Date().toISOString(), cpu: CPU, device: DEVICE, cpus: cpusAllowed(), pages: [] }
for (const { label, url } of pages) {
  const runs = []
  for (let r = 0; r < RUNS; r++) {
    const load = hostLoad()
    const cpu = cpuState()
    const context = await browser.newContext({ viewport, ...(PHONE ? phoneOpts : {}), serviceWorkers: "block" })
    await installProbe(context)
    await context.addInitScript(firstText)
    // Our own pages are read, never written: on onemana.dev nothing but a
    // read leaves (no funnel event, no sign-in), and the storefront's API,
    // which keeps the demo's funnel, is never reached (as lib.mjs's guard).
    await context.route(
      (u) => /(^|\.)onemana\.dev$/.test(u.hostname),
      (route) => {
        const req = route.request()
        const host = new URL(req.url()).hostname
        if (host === "backend.onemana.dev" || !["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.abort("blockedbyclient")
        return route.continue()
      },
    )
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    await cdp.send("Network.enable")
    const types = new Map()
    let bytes = { script: 0, all: 0 }
    cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type))
    cdp.on("Network.loadingFinished", (e) => {
      bytes.all += e.encodedDataLength
      if (types.get(e.requestId) === "Script") bytes.script += e.encodedDataLength
    })
    const row = { run: r, load, cpu }
    for (const kind of ["cold", "warm"]) {
      bytes = { script: 0, all: 0 }
      try {
        await page.goto(url, { waitUntil: "load", timeout: 90000 })
        await page.waitForTimeout(3000)
        const t = await page.evaluate(() => ({
          fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
          text: window.__fluText,
          lcp: window.__flu?.lcp ?? null,
        }))
        const m = await since(page, { t: 0, commits: 0, renders: 0, byName: {}, selfMs: {}, origins: {} })
        // What loaded, so a challenge or an error page is never counted as the page.
        row.title = await page.title().catch(() => "")
        row[kind] = { fcpMs: Math.round(t.fcp ?? 0) || null, textMs: t.text != null ? Math.round(t.text) : null, lcpMs: Math.round(t.lcp ?? 0) || null, longMs: m.longMs, tbt: m.tbt, cls: m.cls, scriptKB: Math.round(bytes.script / 1024), allKB: Math.round(bytes.all / 1024) }
      } catch (e) {
        row[kind] = { error: String(e?.message || e).split("\n")[0].slice(0, 160) }
      }
    }
    // Reading it: down a long way and back up.
    try {
      const vp = page.viewportSize()
      const mid = { x: vp.width / 2, y: vp.height / 2 }
      const screen = { left: 0, top: 0, right: vp.width, bottom: vp.height }
      const s0 = await scrollAt(page, mid)
      await startFrames(page)
      // A phone's is a finger's (fingerScroll), a computer's a wheel's.
      if (PHONE) await fingerScroll(cdp, { box: screen, dy: 6000, speed: 1200 })
      else await scrollGesture(cdp, { ...mid, dy: -6000, speed: 2000 })
      const s1 = await scrollAt(page, mid)
      if (PHONE) await fingerScroll(cdp, { box: screen, dy: -4000, speed: 1200 })
      else await scrollGesture(cdp, { ...mid, dy: 4000, speed: 2000 })
      const f = await stopFrames(page)
      const moved = movedPx(s0, s1) + movedPx(s1, await scrollAt(page, mid))
      row.scroll = moved ? { frameP95Ms: f.p95, droppedPct: f.droppedPct, worst: f.worst, frames: f.frames, input: PHONE ? "touch" : "wheel", movedPx: moved } : { error: `the ${PHONE ? "finger's" : "wheel's"} scroll moved nothing` }
    } catch (e) {
      row.scroll = { error: String(e?.message || e).split("\n")[0].slice(0, 160) }
    }
    await context.close()
    runs.push(row)
    console.log(`${label} run ${r} load ${load} "${(row.title || "").slice(0, 40)}": cold text ${row.cold?.textMs ?? "-"} ms (lcp ${row.cold?.lcpMs ?? "-"}, ${row.cold?.scriptKB ?? "-"} KB script), warm text ${row.warm?.textMs ?? "-"} ms, scroll p95 ${row.scroll?.frameP95Ms ?? "-"} ms${row.cold?.error ? ` ERR ${row.cold.error}` : ""}`)
    await new Promise((res) => setTimeout(res, 3000))
  }
  const pick = (f) => runs.map(f).filter((x) => typeof x === "number")
  const summary = {}
  for (const kind of ["cold", "warm"])
    for (const k of ["fcpMs", "textMs", "lcpMs", "longMs", "tbt", "cls", "scriptKB", "allKB"]) {
      summary[`${kind}.${k}`] = { median: median(pick((r) => r[kind]?.[k])), p95: p95(pick((r) => r[kind]?.[k])) }
    }
  for (const k of ["frameP95Ms", "droppedPct"]) summary[`scroll.${k}`] = { median: median(pick((r) => r.scroll?.[k])), p95: p95(pick((r) => r.scroll?.[k])) }
  result.pages.push({ label, url, runs, summary })
}
await browser.close()
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2))
console.log("\npage".padEnd(28), "cold text".padStart(10), "cold lcp".padStart(9), "warm text".padStart(10), "script KB".padStart(10), "all KB".padStart(8), "scroll p95".padStart(11))
for (const p of result.pages) {
  const s = p.summary
  console.log(p.label.padEnd(28), String(s["cold.textMs"].median ?? "-").padStart(10), String(s["cold.lcpMs"].median ?? "-").padStart(9), String(s["warm.textMs"].median ?? "-").padStart(10), String(s["cold.scriptKB"].median ?? "-").padStart(10), String(s["cold.allKB"].median ?? "-").padStart(8), String(s["scroll.frameP95Ms"].median ?? "-").padStart(11))
}
