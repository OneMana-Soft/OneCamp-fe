// The fluidity harness's plumbing: a browser on this checkout with the live
// demo's data, a guard that keeps the shared demo unwritten, and the probes
// that measure a step (input to next paint, long tasks, layout shift, script
// bytes, React renders). measure.mjs drives the steps.
//
// The page is this code and the data is the demo's: the demo's web origin is
// routed to the local server, so cookies and CORS are the demo's own.
//
// THE DEMO IS SHARED AND NOTHING HERE WRITES TO IT.
//   - Every request that isn't a GET is aborted, wherever it goes, except the
//     demo sign-in (POST /demo-login) and what a step fakes on purpose
//     (fakeWrite: answered here, never sent).
//   - The analytics and funnel host is not reached at all.
//   - The realtime socket passes the broker's messages in and drops any
//     PUBLISH going out; the collaboration socket passes sign-in and the
//     first sync request out and drops edits and presence.
import { chromium } from "@playwright/test"
import { gzipSync } from "node:zlib"

export const FE = "https://onecamp.onemana.dev"
export const BE = "https://onecamp-backend.onemana.dev"
const FE_HOST = new URL(FE).host
const BE_HOST = new URL(BE).host
// The storefront's API: the demo funnel and the subscribe prompt post there.
const NEVER = ["backend.onemana.dev"]

export async function launch() {
  return chromium.launch()
}

// ----------------------------------------------------------------------------
// The probe, injected before any page script. It runs in the page.
// ----------------------------------------------------------------------------
function probe() {
  const P = (window.__flu = {
    events: [],
    long: [],
    loaf: [],
    shifts: [],
    lcp: 0,
    commits: [],
    renders: 0,
    byName: Object.create(null),
    // Only in a profiling build (next build --profile): ms spent per component.
    selfMs: Object.create(null),
    origins: Object.create(null),
  })
  const watch = (type, fn, extra) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra })
    } catch {
      /* not supported here */
    }
  }
  // Input to next paint, per event (the same entries INP is computed from).
  watch(
    "event",
    (e) =>
      P.events.push({
        n: e.name,
        id: e.interactionId || 0,
        t: e.startTime,
        d: e.duration,
        delay: e.processingStart - e.startTime,
        work: e.processingEnd - e.processingStart,
      }),
    { durationThreshold: 16 },
  )
  watch("longtask", (e) => P.long.push({ t: e.startTime, d: e.duration }))
  // Long animation frames name the scripts that made a frame late.
  watch("long-animation-frame", (e) =>
    P.loaf.push({
      t: e.startTime,
      d: e.duration,
      block: e.blockingDuration,
      render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
      scripts: (e.scripts || []).map((s) => ({
        d: Math.round(s.duration),
        fn: s.sourceFunctionName || "",
        src: (s.sourceURL || "").split("/").pop().split("?")[0],
        inv: (s.invoker || "").slice(0, 60),
        layout: Math.round(s.forcedStyleAndLayoutDuration || 0),
      })),
    }),
  )
  watch("layout-shift", (e) => {
    if (e.hadRecentInput) return
    const node = (s) => {
      const n = s.node
      if (!n) return "?"
      const cls = typeof n.className === "string" ? n.className.split(/\s+/).slice(0, 4).join(".") : ""
      return `${n.nodeName.toLowerCase()}${n.id ? "#" + n.id : ""}${cls ? "." + cls : ""}`.slice(0, 90)
    }
    P.shifts.push({ t: e.startTime, v: e.value, nodes: (e.sources || []).slice(0, 3).map(node) })
  })
  watch("largest-contentful-paint", (e) => (P.lcp = e.startTime))

  // What moves, and by which property: transform and opacity run on the
  // compositor; colours and shadows repaint; width, height, top, margins and
  // the like lay the page out again on every frame they run.
  P.motion = []
  const describe = (el) => {
    if (!el || !el.nodeName) return "?"
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : ""
    return `${el.nodeName.toLowerCase()}${cls ? "." + cls : ""}`.slice(0, 80)
  }
  const keyframeProps = (kf) => {
    const out = new Set()
    const add = (o) => Object.keys(o || {}).forEach((k) => !["offset", "easing", "composite", "computedOffset"].includes(k) && out.add(k))
    if (Array.isArray(kf)) kf.forEach(add)
    else add(kf)
    return [...out]
  }
  addEventListener("transitionrun", (e) => P.motion.push({ t: performance.now(), kind: "transition", props: [e.propertyName], el: describe(e.target) }), true)
  addEventListener(
    "animationstart",
    (e) => {
      let props = []
      try {
        const a = e.target.getAnimations().find((x) => x.animationName === e.animationName)
        props = a ? keyframeProps(a.effect.getKeyframes()) : []
      } catch {
        /* gone already */
      }
      P.motion.push({ t: performance.now(), kind: "animation", name: e.animationName, props, el: describe(e.target) })
    },
    true,
  )
  const animate = Element.prototype.animate
  Element.prototype.animate = function (kf, opts) {
    try {
      P.motion.push({ t: performance.now(), kind: "waapi", props: keyframeProps(kf), el: describe(this) })
    } catch {
      /* keep animating */
    }
    return animate.call(this, kf, opts)
  }

  // React's commits, through the hook React DevTools uses. A component that
  // rendered in a commit carries PerformedWork (flag 1); a subtree React
  // skipped keeps its child pointer, so only what changed is walked (the same
  // walk DevTools does). Production builds mangle names; counts still hold.
  const COMPONENT = new Set([0, 1, 11, 14, 15]) // function, class, forwardRef, memo, simple memo
  const nameOf = (t) =>
    !t
      ? "?"
      : typeof t === "string"
        ? t
        : t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && nameOf(t.type)) || "anonymous"
  let current = null
  const tally = (f) => {
    P.renders++
    if (current) current.renders++
    const n = nameOf(f.type)
    P.byName[n] = (P.byName[n] || 0) + 1
    if (typeof f.selfBaseDuration === "number") P.selfMs[n] = (P.selfMs[n] || 0) + f.selfBaseDuration
  }
  const mount = (f) => {
    if (COMPONENT.has(f.tag)) tally(f)
    for (let c = f.child; c; c = c.sibling) mount(c)
  }
  // An origin is a component that rendered when the component above it did
  // not: its own state, store subscription or context changed. That is where
  // a render storm starts.
  const update = (next, prev, parentRendered) => {
    const isComponent = COMPONENT.has(next.tag)
    const rendered = isComponent && (next.flags & 1) === 1
    if (rendered) {
      tally(next)
      if (!parentRendered) {
        // Which of its hooks (by position) or contexts changed: the reason.
        const why = []
        if (next.tag !== 1) {
          let a = next.memoizedState
          let b = prev.memoizedState
          // State hooks only (they carry a queue): a memo recomputing or an
          // effect re-arming is a consequence, not a cause.
          for (let i = 0; a && b && i < 80; i++, a = a.next, b = b.next) if (a.queue && a.memoizedState !== b.memoizedState) why.push(i)
        }
        for (let d = next.dependencies && next.dependencies.firstContext, e = prev.dependencies && prev.dependencies.firstContext; d; d = d.next, e = e && e.next)
          if (!e || d.memoizedValue !== e.memoizedValue) why.push("ctx:" + ((d.context && d.context.displayName) || "?"))
        const n = nameOf(next.type) + (why.length ? `#${why.slice(0, 4).join(",")}` : "")
        P.origins[n] = (P.origins[n] || 0) + 1
      }
    }
    if (next.child === prev.child) return
    const below = isComponent ? rendered : parentRendered
    for (let c = next.child; c; c = c.sibling) {
      if (c.alternate) update(c, c.alternate, below)
      else mount(c)
    }
  }
  const renderers = new Map()
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      const id = renderers.size + 1
      renderers.set(id, renderer)
      return id
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      current = { t: performance.now(), renders: 0 }
      try {
        const next = root.current
        if (next.alternate) update(next, next.alternate, false)
        else mount(next)
      } catch {
        /* a shape this walk doesn't know: the commit still counts */
      }
      P.commits.push(current)
      current = null
    },
  }
}

// ----------------------------------------------------------------------------
// A context on this checkout, with the demo's data and the write guard.
// ----------------------------------------------------------------------------

/**
 * @param browser from launch()
 * @param opts.base the local server (http://localhost:3171)
 * @param opts.viewport { width, height }
 * @param opts.storageState a signed-in state to start from
 */
export async function demoContext(browser, { base, viewport = { width: 1440, height: 900 }, storageState } = {}) {
  const ctx = await browser.newContext({ viewport, storageState, serviceWorkers: "block" })
  const guard = { blocked: [], faked: [], fakes: [], droppedFrames: 0, scriptBytes: 0, scriptGzip: 0, scripts: [] }
  ctx.__guard = guard
  await ctx.addInitScript(probe)
  const cors = { "access-control-allow-origin": FE, "access-control-allow-credentials": "true" }

  // The web origin, served by this checkout.
  await ctx.route(
    (u) => u.host === FE_HOST,
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      let resp
      try {
        resp = await route.fetch({ url: base + url.pathname + url.search, maxRedirects: 0, timeout: 60000 })
      } catch (e) {
        return route.abort("failed").catch(() => {})
      }
      try {
        const headers = { ...resp.headers() }
        if (headers.location) headers.location = headers.location.replace(base, FE)
        const body = await resp.body()
        if (/javascript/.test(headers["content-type"] || "") || url.pathname.endsWith(".js")) {
          const gz = gzipSync(body, { level: 6 }).length
          guard.scriptBytes += body.length
          guard.scriptGzip += gz
          guard.scripts.push({ path: url.pathname, bytes: body.length, gzip: gz, at: Date.now() })
        }
        delete headers["content-encoding"]
        delete headers["content-length"]
        await route.fulfill({ status: resp.status(), headers, body })
      } catch {
        // The page or its context went away while this was in flight.
      }
    },
  )

  // Everything else: reads pass, writes don't.
  await ctx.route(
    (u) => u.host !== FE_HOST,
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      const method = req.method()
      if (NEVER.includes(url.host)) {
        guard.blocked.push(`${method} ${url.host}${url.pathname}`)
        return route.abort("blockedbyclient")
      }
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue()
      if (url.host === BE_HOST && method === "POST" && /\/demo-login$/.test(url.pathname)) return route.continue()
      if (url.host === BE_HOST) {
        const fake = guard.fakes.find((f) => f.method === method && f.path.test(url.pathname))
        if (fake) {
          guard.faked.push(`${method} ${url.pathname}`)
          let payload = null
          try {
            payload = req.postDataJSON()
          } catch {
            /* not JSON */
          }
          const body = typeof fake.body === "function" ? fake.body(payload, url) : fake.body
          return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body ?? {}) })
        }
      }
      guard.blocked.push(`${method} ${url.host}${url.pathname}`)
      return route.abort("blockedbyclient")
    },
  )

  // The realtime broker: subscriptions and pings go out, a PUBLISH never does.
  await ctx.routeWebSocket(/onecamp-emqx\.onemana\.dev/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((m) => {
      const first = typeof m === "string" ? m.charCodeAt(0) : m[0]
      if (first >> 4 === 3) {
        guard.droppedFrames++
        return
      }
      server.send(m)
    })
    server.onMessage((m) => ws.send(m))
    ws.onClose((code, reason) => server.close({ code, reason }))
    server.onClose((code, reason) => ws.close({ code, reason }))
  })

  // The collaboration server: sign-in and "send me the document" go out;
  // edits, a client's sync answer and presence don't.
  await ctx.routeWebSocket(/onecamp-collab\.onemana\.dev/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((m) => {
      if (typeof m === "string" || !collabAllowed(m)) {
        guard.droppedFrames++
        return
      }
      server.send(m)
    })
    server.onMessage((m) => ws.send(m))
    ws.onClose((code, reason) => server.close({ code, reason }))
    server.onClose((code, reason) => ws.close({ code, reason }))
  })
  return ctx
}

// A Hocuspocus frame: varString document name, varUint message type, then for
// Sync a varUint y-protocols step. Allowed: Auth (2), QueryAwareness (3) and
// Sync step 1 (0/0), which only asks the server for what it has.
function collabAllowed(buf) {
  let i = 0
  const varUint = () => {
    let n = 0
    let shift = 0
    while (i < buf.length) {
      const b = buf[i++]
      n += (b & 0x7f) * 2 ** shift
      if (b < 0x80) return n
      shift += 7
    }
    return -1
  }
  const nameLength = varUint()
  if (nameLength < 0) return false
  i += nameLength
  const type = varUint()
  if (type === 2 || type === 3) return true
  if (type === 0) return varUint() === 0
  return false
}

/** Answers one kind of write here, with a fake success, instead of sending it. */
export function fakeWrite(ctx, method, path, body) {
  ctx.__guard.fakes.push({ method, path, body })
}

/** Signs into the shared demo as its visitor (a read, plus the one sign-in POST). */
export async function enterDemo(page) {
  await page.goto(FE + "/?start_demo=1")
  await page.waitForURL(/\/app\//, { timeout: 90000 })
}

// ----------------------------------------------------------------------------
// Measuring a step.
// ----------------------------------------------------------------------------

/** Where the page's buffers stand now; a step reads what came after. */
export async function mark(page) {
  return page.evaluate(() => {
    const P = window.__flu
    return { t: performance.now(), commits: P.commits.length, renders: P.renders, byName: { ...P.byName }, selfMs: { ...P.selfMs }, origins: { ...P.origins } }
  })
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0)

/** What happened in the page since `from` (a mark). */
export async function since(page, from) {
  const raw = await page.evaluate((from) => {
    const P = window.__flu
    const after = (e) => e.t >= from.t
    const byName = {}
    for (const [k, v] of Object.entries(P.byName)) {
      const d = v - (from.byName[k] || 0)
      if (d > 0) byName[k] = d
    }
    const origins = {}
    for (const [k, v] of Object.entries(P.origins)) {
      const d = v - ((from.origins || {})[k] || 0)
      if (d > 0) origins[k] = d
    }
    const selfMs = {}
    for (const [k, v] of Object.entries(P.selfMs)) {
      const d = v - ((from.selfMs || {})[k] || 0)
      if (d > 0.05) selfMs[k] = d
    }
    return {
      motion: (P.motion || []).filter(after),
      events: P.events.filter(after),
      long: P.long.filter(after),
      loaf: P.loaf.filter(after),
      shifts: P.shifts.filter(after),
      commits: P.commits.slice(from.commits),
      renders: P.renders - from.renders,
      byName,
      selfMs,
      origins,
      lcp: P.lcp,
    }
  }, from)
  // Interactions: an interaction's entries share an id; it lasted as long as
  // its slowest entry (the INP definition).
  const inter = new Map()
  for (const e of raw.events) {
    if (!e.id) continue
    const cur = inter.get(e.id)
    if (!cur || e.d > cur.d) inter.set(e.id, e)
  }
  const interactions = [...inter.values()].sort((a, b) => a.t - b.t)
  const worst = interactions.reduce((a, e) => (e.d > a.d ? e : a), { d: 0, n: "", delay: 0, work: 0 })
  const longMs = raw.long.reduce((a, e) => a + e.d, 0)
  const tbt = raw.long.reduce((a, e) => a + Math.max(0, e.d - 50), 0)
  // The scripts that cost the most across the step's long frames.
  const cost = new Map()
  for (const f of raw.loaf)
    for (const s of f.scripts) {
      const k = `${s.fn || "(anonymous)"} @ ${s.src || s.inv}`
      cost.set(k, (cost.get(k) || 0) + s.d)
    }
  const loafTop = [...cost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, d]) => `${Math.round(d)}ms ${k}`)
  const top = Object.entries(raw.byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k}×${v}`)
  // The app's own components, without the library internals they render.
  const LIB = /^(Primitive\.|Slot|SlotClone|Presence|Popper|PopperProvider|PopperAnchor|Portal|DismissableLayer|FocusScope|RemoveScroll|Collection|Tooltip(Trigger|Provider|Portal|PortalProvider|ContentImpl)?\d*$|Toggle$|anonymous$|Link(Component)?$|Icon$|Root$|Anchor$)/
  const topApp = Object.entries(raw.byName)
    .filter(([k]) => !LIB.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([k, v]) => `${k}×${v}`)
  // Motion by cost: what lays out each frame is the one that must not happen.
  const COMPOSITED = new Set(["transform", "opacity", "translate", "scale", "rotate", "offset-distance"])
  const PAINT = /color$|^fill$|^stroke$|shadow|^visibility$|^outline|^text-decoration|^background-position$|^filter$|^backdrop-filter$|^clip-path$/
  const layout = new Map()
  let composited = 0
  let painted = 0
  for (const m of raw.motion) {
    for (const prop of m.props) {
      if (COMPOSITED.has(prop)) composited++
      else if (PAINT.test(prop)) painted++
      else {
        const k = `${prop} (${m.kind}${m.name ? " " + m.name : ""}) on ${m.el}`
        layout.set(k, (layout.get(k) || 0) + 1)
      }
    }
  }
  const origins = Object.entries(raw.origins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([k, v]) => `${k}×${v}`)
  const slowest = Object.entries(raw.selfMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${k} ${v.toFixed(1)}ms`)
  return {
    interactions,
    inp: Math.round(worst.d),
    inpName: worst.n,
    inpDelay: Math.round(worst.delay),
    inpWork: Math.round(worst.work),
    longTasks: raw.long.length,
    longMs: Math.round(longMs),
    tbt: Math.round(tbt),
    loafCount: raw.loaf.length,
    loafTop,
    cls: +raw.shifts.reduce((a, e) => a + e.v, 0).toFixed(4),
    shifts: raw.shifts,
    commits: raw.commits.length,
    renders: raw.renders,
    maxCommitRenders: raw.commits.reduce((a, c) => Math.max(a, c.renders), 0),
    top,
    topApp,
    origins,
    slowest,
    motion: { composited, painted, layout: [...layout.entries()].map(([k, n]) => `${n}× ${k}`) },
    lcp: Math.round(raw.lcp),
  }
}

/** Per-keystroke latency from a typing step's interactions. */
export function keyStats(m, typed) {
  // A keystroke under 16 ms reports no entry at all, so count it at 16 (an
  // upper bound) rather than dropping it and inflating the percentiles.
  const keys = m.interactions.filter((e) => e.n === "keydown" || e.n === "keypress" || e.n === "keyup").map((e) => e.d)
  const all = [...keys, ...Array(Math.max(0, typed - keys.length)).fill(16)].sort((a, b) => a - b)
  return { typed, slow: keys.filter((d) => d > 16).length, p50: Math.round(pct(all, 0.5)), p95: Math.round(pct(all, 0.95)), max: Math.round(all.at(-1) || 0) }
}

export const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b)
  if (!s.length) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 1000) / 1000
}
