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
import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

export const FE = "https://onecamp.onemana.dev"
export const BE = "https://onecamp-backend.onemana.dev"
const FE_HOST = new URL(FE).host
const BE_HOST = new URL(BE).host
// The storefront's API: the demo funnel and the subscribe prompt post there.
const NEVER = ["backend.onemana.dev"]

// Playwright is loaded when a browser is, so the pure helpers below can be
// held by unit tests (app/fluidityBudgets.test.ts) without one.
export async function launch() {
  const { chromium } = await import("@playwright/test")
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
    // Where a storm came from (CHAT-LEAD, 21 Oct): each subtree that mounted
    // under a parent that only updated, as "parent > child" with the
    // components it mounted, and the renders each origin started. A list
    // remounting its rows shows as one big mount root.
    mountRoots: Object.create(null),
    storms: Object.create(null),
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
  // ResizeObservers: how many are alive, and how many elements they watch now.
  // A virtual list measures each row with one; rows it never unobserves stay.
  P.ro = { made: 0, live: 0, observed: 0 }
  const RO = window.ResizeObserver
  if (RO)
    window.ResizeObserver = class extends RO {
      constructor(cb) {
        super(cb)
        this.__flu = { on: true, n: 0, seen: new WeakSet() }
        P.ro.made++
        P.ro.live++
      }
      observe(t, o) {
        if (!this.__flu.seen.has(t)) {
          this.__flu.seen.add(t)
          this.__flu.n++
          P.ro.observed++
        }
        return super.observe(t, o)
      }
      unobserve(t) {
        if (this.__flu.seen.delete(t)) {
          this.__flu.n--
          P.ro.observed--
        }
        return super.unobserve(t)
      }
      disconnect() {
        P.ro.observed -= this.__flu.n
        this.__flu.n = 0
        this.__flu.seen = new WeakSet()
        if (this.__flu.on) {
          this.__flu.on = false
          P.ro.live--
        }
        return super.disconnect()
      }
    }
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
  const owner = (f) => {
    for (let x = f; x; x = x.return) if (COMPONENT.has(x.tag)) return nameOf(x.type)
    return "root"
  }
  const update = (next, prev, parentRendered) => {
    const isComponent = COMPONENT.has(next.tag)
    const rendered = isComponent && (next.flags & 1) === 1
    let storm = null
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
        storm = { n, from: P.renders - 1 }
      }
    }
    if (next.child !== prev.child) {
      const below = isComponent ? rendered : parentRendered
      for (let c = next.child; c; c = c.sibling) {
        if (c.alternate) update(c, c.alternate, below)
        else {
          const from = P.renders
          mount(c)
          const k = `${owner(next)} > ${nameOf(c.type)}`
          if (P.renders > from) P.mountRoots[k] = (P.mountRoots[k] || 0) + (P.renders - from)
        }
      }
    }
    if (storm) P.storms[storm.n] = (P.storms[storm.n] || 0) + (P.renders - storm.from)
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
/** Adds the probe to a context of the caller's own (docs.mjs's local harness). */
export async function installProbe(context) {
  await context.addInitScript(probe)
}

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
// Sync a varUint y-protocols step. Allowed: Auth (2), QueryAwareness (3), Sync
// step 1 (0/0), which only asks the server for what it has, and Close (7),
// which only lets go of a doc: on the tab's one socket (lib/collabSocket.ts) a
// doc whose close never reached the server could not be opened on it again.
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
  if (type === 2 || type === 3 || type === 7) return true
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
    return { t: performance.now(), commits: P.commits.length, renders: P.renders, byName: { ...P.byName }, selfMs: { ...P.selfMs }, origins: { ...P.origins }, mountRoots: { ...P.mountRoots }, storms: { ...P.storms } }
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
    const diff = (now, was) => {
      const out = {}
      for (const [k, v] of Object.entries(now || {})) {
        const d = v - ((was || {})[k] || 0)
        if (d > 0) out[k] = d
      }
      return out
    }
    const mountRoots = diff(P.mountRoots, from.mountRoots)
    const storms = diff(P.storms, from.storms)
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
      ro: P.ro ? { ...P.ro } : null,
      shifts: P.shifts.filter(after),
      commits: P.commits.slice(from.commits),
      renders: P.renders - from.renders,
      byName,
      selfMs,
      origins,
      mountRoots,
      storms,
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
      const k = `${s.fn || "(anonymous)"} @ ${s.src || "?"}${s.inv ? ` via ${s.inv}` : ""}`
      cost.set(k, (cost.get(k) || 0) + s.d)
    }
  const loafTop = [...cost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, d]) => `${Math.round(d)}ms ${k}`)
  // The three longest frames whole: what ran in each, what it was called by, and its render.
  const loafWorst = [...raw.loaf]
    .sort((a, b) => b.d - a.d)
    .slice(0, 3)
    .map((f) => ({
      ms: Math.round(f.d),
      blockMs: Math.round(f.block || 0),
      renderMs: Math.round(f.render || 0),
      scripts: f.scripts
        .sort((a, b) => b.d - a.d)
        .slice(0, 4)
        .map((x) => `${x.d}ms ${x.fn || "(anonymous)"} @ ${x.src || "?"}${x.inv ? ` via ${x.inv}` : ""}${x.layout ? `, layout ${x.layout}ms` : ""}`),
    }))
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
    loafWorst,
    ro: raw.ro,
    cls: +raw.shifts.reduce((a, e) => a + e.v, 0).toFixed(4),
    shifts: raw.shifts,
    commits: raw.commits.length,
    renders: raw.renders,
    maxCommitRenders: raw.commits.reduce((a, c) => Math.max(a, c.renders), 0),
    top,
    topApp,
    origins,
    mountRoots: Object.entries(raw.mountRoots || {}).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ×${v}`),
    storms: Object.entries(raw.storms || {}).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k} ×${v}`),
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

/** The value at quantile `q` (0 to 1) of numbers, nearest rank; null when there are none. */
export const quantile = (xs, q) => {
  const s = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * q) - 1))]
}
export const p95 = (xs) => quantile(xs, 0.95)

// ----------------------------------------------------------------------------
// Frames, the host's load, and input the way a person gives it.
// ----------------------------------------------------------------------------

/**
 * Starts sampling frames in the page: the time between one animation frame
 * and the next, while a scroll or a drag runs. content.mjs and measure.mjs
 * each had a copy of this sampler.
 */
export function startFrames(page, max = 4000) {
  return page.evaluate((max) => {
    const f = (window.__fluFrames = [])
    let last = performance.now()
    // A finger held still or lifted between strokes (fingerScroll) scrolls
    // nothing: those frames aren't frames while scrolling, and aren't counted.
    window.__fluFramesHeld = false
    const tick = (t) => {
      if (!window.__fluFramesHeld) f.push(t - last)
      last = t
      if (f.length < max && window.__fluFrames === f) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, max)
}

/** One display refresh at 60 Hz, the frame every budget here is held to. */
export const VSYNC_MS = 1000 / 60

/**
 * Stops the sampler and sums the frames up: their count, frames a second,
 * the p95 and worst frame, slow frames (over two refreshes) and the share of
 * refreshes dropped. The first two frames straddle the start and are left out.
 */
export async function stopFrames(page) {
  const all = await page.evaluate(() => {
    const out = window.__fluFrames || []
    window.__fluFrames = null
    return out
  })
  const body = all.slice(2)
  const total = body.reduce((a, b) => a + b, 0)
  // A frame of d ms took round(d / refresh) refreshes; all but one were dropped.
  const refreshes = body.reduce((a, d) => a + Math.max(1, Math.round(d / VSYNC_MS)), 0)
  const dropped = refreshes - body.length
  return {
    frames: body.length,
    fps: total ? Math.round((body.length / total) * 1000 * 10) / 10 : null,
    p95: body.length ? Math.round(p95(body) * 10) / 10 : null,
    slow: body.filter((d) => d > 34).length,
    worst: body.length ? Math.round(Math.max(...body)) : null,
    droppedPct: refreshes ? Math.round((dropped / refreshes) * 1000) / 10 : null,
  }
}

/** The host's one-minute load average now: every run records it, and one above 16 is flagged. */
export function hostLoad() {
  try {
    return Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0])
  } catch {
    return null
  }
}
/** The CPUs this process may run on (a heavy slot pins its job to eight), as Linux lists them. */
export function cpusAllowed() {
  try {
    return /Cpus_allowed_list:\s*(\S+)/.exec(readFileSync("/proc/self/status", "utf8"))?.[1] ?? null
  } catch {
    return null
  }
}
/** The CPUs in a list such as "0-7,12": each number. */
const cpuList = (spec) =>
  String(spec || "")
    .split(",")
    .flatMap((part) => {
      const [a, b] = part.split("-").map(Number)
      return Number.isFinite(b) ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Number.isFinite(a) ? [a] : []
    })

/**
 * What the CPUs are doing now, for every run's record: the mean clock of the
 * CPUs this process may use (MHz) and the package's temperature (°C), so a
 * run slowed by heat or a power limit shows in the data. The machine's P-cores
 * are CPUs 0-15 (to 5.4 GHz), its E-cores 16-31 (to 3.9 GHz).
 */
export function cpuState() {
  const cpus = cpuList(cpusAllowed())
  let sum = 0
  let n = 0
  for (const c of cpus) {
    try {
      sum += Number(readFileSync(`/sys/devices/system/cpu/cpu${c}/cpufreq/scaling_cur_freq`, "utf8")) / 1000
      n++
    } catch {
      /* not readable here */
    }
  }
  let tempC = null
  for (let z = 0; z < 8; z++) {
    try {
      if (readFileSync(`/sys/class/thermal/thermal_zone${z}/type`, "utf8").trim() === "x86_pkg_temp") {
        tempC = Number(readFileSync(`/sys/class/thermal/thermal_zone${z}/temp`, "utf8")) / 1000
        break
      }
    } catch {
      break
    }
  }
  return { mhz: n ? Math.round(sum / n) : null, tempC, pcore: cpus.length > 0 && cpus.every((c) => c < 16) }
}
/** Load above this marks a run as taken on a busy machine (the brief's hygiene rule). */
export const BUSY_LOAD = 16

/**
 * A wheel's scroll, through the browser's own gesture (DevTools'
 * Input.synthesizeScrollGesture): wheel steps, as a computer gives them.
 * Negative dy scrolls down. A finger is fingerScroll's: with a touch source
 * this gesture moves nothing in headless Chromium (21 Oct 2026: 0 px on the
 * phone's task list in every run, so the phone's scroll rows had been read
 * from a wheel), so it is refused here.
 */
export async function scrollGesture(cdp, { x, y, dx = 0, dy = 0, speed = 1500, touch = false, repeat = 0 }) {
  if (touch) throw new Error("synthesizeScrollGesture's touch moves nothing headless: a finger's scroll is fingerScroll()")
  await cdp.send("Input.synthesizeScrollGesture", {
    x: Math.round(x),
    y: Math.round(y),
    xDistance: Math.round(dx),
    yDistance: Math.round(dy),
    speed,
    gestureSourceType: "mouse",
    repeatCount: repeat,
    repeatDelayMs: 50,
    preventFling: true,
  })
}

/**
 * Where the box that scrolls under the point (x, y) stands: its nearest
 * scrolling ancestor's, or the page's, { x: scrollLeft, y: scrollTop }. A step
 * reads it before and after a gesture: a scroll that moved nothing measured
 * an idle page (21 Oct 2026: the phone's had, under a touch gesture).
 */
export function scrollAt(page, { x, y }) {
  return page.evaluate(
    ({ x, y }) => {
      const scrolls = (el) => {
        const cs = getComputedStyle(el)
        return (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(cs.overflowY)) || (el.scrollWidth > el.clientWidth + 4 && /(auto|scroll)/.test(cs.overflowX))
      }
      let el = document.elementFromPoint(x, y)
      while (el && el !== document.documentElement && el !== document.body && !scrolls(el)) el = el.parentElement
      const box = !el || el === document.documentElement || el === document.body ? document.scrollingElement : el
      return { x: Math.round(box.scrollLeft), y: Math.round(box.scrollTop) }
    },
    { x: Math.round(x), y: Math.round(y) },
  )
}

/** The px a scroll moved, from two scrollAt readings. */
export const movedPx = (a, b) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y)

/**
 * The strokes a finger makes to scroll (dx, dy) — down and right positive —
 * inside `box` ({ left, top, right, bottom }: the part of the scroller on
 * screen). A finger can't leave the screen, so a long scroll is several
 * strokes, each across most of the box, the last one the rest; the finger
 * moves against the scroll (up to go down). Whole pixels, the strokes adding
 * up to the scroll exactly. One axis at a time: dy's strokes, then dx's.
 * @param {{ box: { left: number, top: number, right: number, bottom: number }, dx?: number, dy?: number }} o
 * @returns {Array<{ from: { x: number, y: number }, to: { x: number, y: number } }>}
 */
export function touchStrokes({ box, dx = 0, dy = 0 }) {
  const out = []
  const cx = Math.round((box.left + box.right) / 2)
  const cy = Math.round((box.top + box.bottom) / 2)
  const axis = (d, lo, hi, at) => {
    const size = hi - lo
    const margin = Math.max(8, Math.round(size * 0.08))
    const reach = Math.max(1, Math.floor(size - 2 * margin))
    let left = Math.abs(Math.round(d))
    while (left > 0) {
      const len = Math.min(reach, left)
      // Going forward (down or right), the finger starts near the far edge and moves back.
      const from = d > 0 ? Math.round(hi - margin) : Math.round(lo + margin)
      const to = d > 0 ? from - len : from + len
      out.push(at(from, to))
      left -= len
    }
  }
  if (dy) axis(dy, box.top, box.bottom, (from, to) => ({ from: { x: cx, y: from }, to: { x: cx, y: to } }))
  if (dx) axis(dx, box.left, box.right, (from, to) => ({ from: { x: from, y: cy }, to: { x: to, y: cy } }))
  return out
}

/**
 * A finger's scroll of (dx, dy) — down and right positive — inside `box`,
 * through Input.dispatchTouchEvent, as a phone gets it: each stroke
 * (touchStrokes) is a press, moves `stepMs` apart at `speed` px a second, a
 * hold of `holdMs` with the finger still (so no fling follows, as
 * preventFling did for the gesture) and a lift, then `gapMs` before the next.
 * @returns {Promise<number>} the strokes made
 */
export async function fingerScroll(cdp, { box, dx = 0, dy = 0, speed = 1200, stepMs = 16, holdMs = 120, gapMs = 60 }) {
  const at = (p) => [{ x: p.x, y: p.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  // The frame sampler (startFrames) leaves out the frames of a still finger.
  const held = (on) => cdp.send("Runtime.evaluate", { expression: `window.__fluFramesHeld = ${on}` }).catch(() => {})
  const strokes = touchStrokes({ box, dx, dy })
  try {
    for (const { from, to } of strokes) {
      const len = Math.hypot(to.x - from.x, to.y - from.y)
      const moves = Math.max(2, Math.ceil(len / Math.max(1, (speed * stepMs) / 1000)))
      await held(false)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from) })
      for (let i = 1; i <= moves; i++) {
        await wait(stepMs)
        const p = { x: Math.round(from.x + ((to.x - from.x) * i) / moves), y: Math.round(from.y + ((to.y - from.y) * i) / moves) }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(p) })
      }
      await held(true)
      await wait(holdMs)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(to) })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await wait(gapMs)
    }
  } finally {
    await held(false)
  }
  return strokes.length
}

/**
 * A finger pressed on `from`, held `holdMs` (what a touch drag waits for
 * before it lifts the card), moved to `to` in `steps` and lifted.
 */
export async function touchDrag(cdp, from, to, { steps = 12, holdMs = 300, stepMs = 16 } = {}) {
  const at = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), radiusX: 4, radiusY: 4, force: 1, id: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from) })
  await new Promise((r) => setTimeout(r, holdMs))
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(p) })
    await new Promise((r) => setTimeout(r, stepMs))
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

/**
 * CSS selector stats over `fn` (DevTools' "selector stats"): Chromium's
 * SelectorStats trace events (category disabled-by-default-blink.debug), one
 * per style recalculation, summed by selector: ms spent matching, attempts,
 * matches and fast rejects. The trace slows style work, so a step that asks
 * for them is a diagnosis: its times don't count (FLUIDITY-LEAD-2, 21 Oct
 * 2026, for the phone list's ~50 µs of style an element).
 * @returns {Promise<{ recalcs: number, totalMs: number, top: Array<{ selector: string, sheet: string, us: number, attempts: number, matches: number, fastRejects: number }> }>}
 */
export async function selectorStats(cdp, fn, { top = 15 } = {}) {
  const events = []
  const onData = (e) => {
    for (const x of e.value) if (x.name === "SelectorStats") events.push(x)
  }
  cdp.on("Tracing.dataCollected", onData)
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r))
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["disabled-by-default-blink.debug"], recordMode: "recordAsMuchAsPossible" }, transferMode: "ReportEvents" })
  try {
    await fn()
  } finally {
    await cdp.send("Tracing.end")
    await done
    cdp.off("Tracing.dataCollected", onData)
  }
  return sumSelectors(events, top)
}

/** SelectorStats events summed by selector, slowest first (selectorStats). */
export function sumSelectors(events, top = 15) {
  const by = new Map()
  for (const e of events) {
    for (const t of e.args?.selector_stats?.selector_timings ?? []) {
      const k = `${t.selector}\u0000${t.style_sheet_id ?? ""}`
      const a = by.get(k) ?? { selector: t.selector, sheet: t.style_sheet_id ?? "", us: 0, attempts: 0, matches: 0, fastRejects: 0 }
      a.us += t["elapsed (us)"] ?? 0
      a.attempts += t.match_attempts ?? 0
      a.matches += t.match_count ?? 0
      a.fastRejects += t.fast_reject_count ?? 0
      by.set(k, a)
    }
  }
  const all = [...by.values()].sort((a, b) => b.us - a.us)
  const totalUs = all.reduce((n, a) => n + a.us, 0)
  return { recalcs: events.length, totalMs: Math.round(totalUs / 100) / 10, top: all.slice(0, top).map((a) => ({ ...a, us: Math.round(a.us) })) }
}

/**
 * Counts what the page downloads, by kind, from the network's own numbers
 * (bytes on the wire, compressed as served). `take()` returns the totals since
 * the last take and starts again.
 */
export async function netBytes(cdp) {
  await cdp.send("Network.enable")
  const kinds = new Map()
  const urls = new Map()
  const fresh = () => ({ script: 0, other: 0, scripts: 0, requests: 0, files: [] })
  let seen = fresh()
  cdp.on("Network.responseReceived", (e) => {
    kinds.set(e.requestId, e.type)
    urls.set(e.requestId, e.response?.url ?? "")
  })
  cdp.on("Network.loadingFinished", (e) => {
    const kind = kinds.get(e.requestId)
    seen.requests++
    if (kind === "Script") {
      seen.script += e.encodedDataLength
      seen.scripts++
      seen.files.push({ file: scriptName(urls.get(e.requestId) ?? ""), kb: Math.round(e.encodedDataLength / 102.4) / 10 })
    } else seen.other += e.encodedDataLength
    kinds.delete(e.requestId)
    urls.delete(e.requestId)
  })
  return {
    take() {
      const out = { scriptKB: Math.round(seen.script / 1024), otherKB: Math.round(seen.other / 1024), scripts: seen.scripts, requests: seen.requests, topScripts: topScripts(seen.files) }
      seen = fresh()
      return out
    },
  }
}

/** A script's name as the build has it: its path under /_next/static/, or its address. */
const scriptName = (url) => {
  try {
    return new URL(url).pathname.replace(/^\/_next\/static\//, "")
  } catch {
    return url
  }
}

/** The biggest scripts of a take, by KB on the wire. */
const topScripts = (files, n = 12) => [...files].sort((a, b) => b.kb - a.kb).slice(0, n)

/** Two of netBytes' takes as one (a step's bytes until useful, and in its settle). */
export function addNet(a, b) {
  return {
    scriptKB: a.scriptKB + b.scriptKB,
    otherKB: a.otherKB + b.otherKB,
    scripts: a.scripts + b.scripts,
    requests: a.requests + b.requests,
    topScripts: topScripts([...(a.topScripts ?? []), ...(b.topScripts ?? [])]),
  }
}
