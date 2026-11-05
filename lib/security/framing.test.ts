// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCustomRoute } from "next/dist/lib/build-custom-route"
import { modifyRouteRegex } from "next/dist/lib/redirect-status"
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match"
import nextConfig from "../../next.config"
import { EMBEDDABLE_PAGES, EMBED_FRAME_POLICY, NOT_EMBEDDABLE, embeddableHeaders } from "./framing"

// Which pages another site may frame, over the app's whole route list (miro-34; main, 3 Nov): every route of
// app/, every file in public/ and Next's own paths, put through next.config's real header rules, matched as
// `next start` matches them and as the routes manifest (Vercel) does. Only the board embed may be framed. A
// path other than the embed that becomes framable fails here. The list below is the test's own on purpose:
// a page added to EMBEDDABLE_PAGES fails until it is added here too, and so it is reviewed twice.
const FRAMABLE = ["/guest/b/[token]/embed"]

const root = join(__dirname, "..", "..")

/** The file names that are routes of their folder, and the metadata routes that are routes of their own. */
const ROUTE_FILE = /^(page|route|opengraph-image|twitter-image|icon|apple-icon|manifest|sitemap|robots)\.(tsx|ts|jsx|js|mdx)$/

/** Every route of app/, with a sample address: one value in each dynamic segment. */
function appRoutes(): { route: string; path: string }[] {
  const out: { route: string; path: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        // A private folder is no route; an intercepting one only answers a link from inside the app.
        if (!name.startsWith("_") && !/^\(\.+\)/.test(name)) walk(full)
        continue
      }
      const file = name.match(ROUTE_FILE)
      if (!file) continue
      // A group's name and a parallel slot's are not in the address.
      const segments = relative(join(root, "app"), dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"))
      if (file[1] !== "page" && file[1] !== "route") segments.push(file[1])
      const sample = (s: string) => (s.startsWith("[[...") || s.startsWith("[...") ? "a/b" : s.startsWith("[") ? "t0k3n" : s)
      out.push({ route: `/${segments.join("/")}`, path: `/${segments.map(sample).join("/")}` })
    }
  }
  walk(join(root, "app"))
  return out
}

function publicFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(`/${relative(join(root, "public"), full).split(sep).join("/")}`)
    }
  }
  walk(join(root, "public"))
  return out
}

/** Whether a route answers a path, as the app router routes: case and all. */
function answers(route: string, path: string): boolean {
  const pattern = route
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith("[[...") ? "(?:/.+)?" : s.startsWith("[...") ? "/.+" : s.startsWith("[") ? "/[^/]+" : `/${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
    .join("")
  return new RegExp(`^${pattern || "/"}$`).test(path)
}

const NEXT_OWN = ["/_next/static/chunks/app.js", "/_next/static/css/app.css", "/_next/image", "/_next/data/build/index.json", "/favicon.ico"]

// Addresses that look like the embed and are not it.
const NEAR = [
  "/guest/b/t0k3n/embed/x",
  "/guest/b/t0k3n/embedx",
  "/guest/b/t0k3n/x/embed",
  "/guest/b/t0k3n/embed.html",
  "/guest/b/embed",
  "/guest/b/t0k3n",
  "/guest/d/t0k3n/embed",
  "/guest/t/t0k3n/embed",
  "/guest/p/t0k3n/embed",
  "/guest/c/t0k3n/embed",
  "/guest/m/t0k3n/embed",
  "/app/guest/b/t0k3n/embed",
  "/x/guest/b/t0k3n/embed",
  "/guest/b/t0k3n/embed/../../../app",
]
// Two that are framable and still not another page: the same page with a trailing slash (Next sends it on to the
// embed), and the embed's address in other letter cases, which next.config's rules match without case while no
// route answers it (the router keeps case), so it is the 404, a page with nothing to press.
const SAME_OR_NONE = ["/guest/b/t0k3n/embed/", "/GUEST/B/t0k3n/EMBED", "/Guest/b/t0k3n/Embed"]

type Rule = { source: string; headers: { key: string; value: string }[]; has?: unknown; missing?: unknown }

async function rules() {
  const all = (await nextConfig.headers!()) as Rule[]
  const sensitive = !!nextConfig.experimental?.caseSensitiveRoutes
  return all.map((r) => {
    expect(r.has ?? r.missing, `${r.source}: a rule with has or missing needs this test to read it`).toBeUndefined()
    return {
      ...r,
      // As next start matches (next/dist/server/lib/router-utils/filesystem.js) ...
      server: getPathMatch(r.source, { strict: true, removeUnnamedParams: true, regexModifier: (re: string) => modifyRouteRegex(re), sensitive }),
      // ... and as the routes manifest, which a host such as Vercel reads, writes it.
      manifest: new RegExp(buildCustomRoute("header", r as never).regex, sensitive ? "" : "i"),
    }
  })
}

async function headersOf() {
  const all = await rules()
  return (path: string) => {
    const out = new Map<string, string>()
    for (const r of all) {
      const hit = r.server(path) !== false
      expect(hit, `${r.source} on ${path}: next start and the routes manifest agree`).toBe(r.manifest.test(path))
      if (hit) for (const h of r.headers) out.set(h.key.toLowerCase(), h.value)
    }
    return out
  }
}

/** Whether another site may frame a response with these headers: CSP frame-ancestors overrules X-Frame-Options. */
function framable(h: Map<string, string>): boolean {
  const ancestors = h.get("content-security-policy")?.match(/frame-ancestors([^;]*)/)?.[1]?.trim()
  if (ancestors !== undefined) return !/^('self'|'none')$/.test(ancestors)
  return !/^(sameorigin|deny)$/i.test(h.get("x-frame-options") ?? "")
}

describe("which pages another site may frame, over every route", () => {
  it("finds the app's routes, the embed among them", () => {
    const routes = appRoutes().map((r) => r.route)
    expect(routes.length).toBeGreaterThan(80)
    expect(routes).toContain("/guest/b/[token]/embed")
    expect(routes).toContain("/guest/b/[token]")
    expect(publicFiles().length).toBeGreaterThan(10)
  })

  it("lets another site frame the board embed and no other route", async () => {
    const headersFor = await headersOf()
    const framed = appRoutes().filter((r) => framable(headersFor(r.path))).map((r) => r.route)
    expect(framed).toEqual(FRAMABLE)
    // The test's list and the rules' list name the same pages.
    expect(EMBEDDABLE_PAGES.map((p) => p.replace(/:([^/]+)/g, "[$1]"))).toEqual(FRAMABLE)
  })

  it("wraps every embeddable page in EmbeddedPage, so the shell's corner cards stay off another site's page", () => {
    for (const page of FRAMABLE) {
      const layout = join(root, "app", ...page.split("/").filter(Boolean), "layout.tsx")
      const wraps = existsSync(layout) && /<EmbeddedPage>/.test(readFileSync(layout, "utf8"))
      expect(wraps, `app${page}/layout.tsx wraps the page in EmbeddedPage (components/public/EmbeddedPage)`).toBe(true)
    }
  })

  it("keeps every file in public/ and Next's own paths unframable", async () => {
    const headersFor = await headersOf()
    for (const path of [...publicFiles(), ...NEXT_OWN]) expect(framable(headersFor(path)), path).toBe(false)
  })

  it("keeps the addresses that look like the embed unframable", async () => {
    const headersFor = await headersOf()
    for (const path of NEAR) expect(framable(headersFor(path)), path).toBe(false)
  })

  it("frames nothing but the embed: a framable address is the embed's own, or one no route answers", async () => {
    const headersFor = await headersOf()
    const routes = appRoutes()
    const paths = [...routes.map((r) => r.path), ...publicFiles(), ...NEXT_OWN, ...NEAR, ...SAME_OR_NONE]
    for (const path of paths) {
      if (!framable(headersFor(path))) continue
      const by = routes.filter((r) => answers(r.route, path.length > 1 ? path.replace(/\/$/, "") : path)).map((r) => r.route)
      expect(by.every((r) => FRAMABLE.includes(r)), `${path} may be framed, and ${by.join(", ")} answer it`).toBe(true)
    }
    for (const path of SAME_OR_NONE) expect(framable(headersFor(path)), path).toBe(true)
  })

  it("sends the embed no X-Frame-Options, an enforced frame-ancestors *, and otherwise what every page gets", async () => {
    const headersFor = await headersOf()
    const embed = headersFor("/guest/b/t0k3n/embed")
    const link = headersFor("/guest/b/t0k3n")
    expect(embed.has("x-frame-options")).toBe(false)
    expect(embed.get("content-security-policy")).toBe(EMBED_FRAME_POLICY)
    expect(embed.get("content-security-policy-report-only")).toBeTruthy()
    expect(embed.get("content-security-policy-report-only")).not.toContain("frame-ancestors")
    // Everything else as the link's own page: the policy (but its frame-ancestors), nosniff, the referrer, permissions, the opener.
    expect(embed.get("content-security-policy-report-only")).toBe(link.get("content-security-policy-report-only")!.replace(/; frame-ancestors 'self'/, ""))
    const rest = (h: Map<string, string>) => [...h].filter(([k]) => !/^(x-frame-options|content-security-policy(-report-only)?)$/.test(k)).sort()
    expect(rest(embed)).toEqual(rest(link))
  })

  it("keeps X-Frame-Options SAMEORIGIN and the report-only frame-ancestors 'self' on every other route", async () => {
    const headersFor = await headersOf()
    for (const { route, path } of appRoutes()) {
      if (FRAMABLE.includes(route)) continue
      const h = headersFor(path)
      expect(h.get("x-frame-options"), route).toBe("SAMEORIGIN")
      expect(h.has("content-security-policy"), route).toBe(false)
      expect(h.get("content-security-policy-report-only"), route).toContain("frame-ancestors 'self'")
    }
  })

  it("splits every path between the rule with X-Frame-Options and the embed's rule", () => {
    const sensitive = !!nextConfig.experimental?.caseSensitiveRoutes
    const match = (source: string) => getPathMatch(source, { strict: true, removeUnnamedParams: true, regexModifier: (re: string) => modifyRouteRegex(re), sensitive })
    const rest = match(NOT_EMBEDDABLE)
    const embeds = EMBEDDABLE_PAGES.map(match)
    const paths = [...appRoutes().map((r) => r.path), ...publicFiles(), ...NEXT_OWN, ...NEAR, ...SAME_OR_NONE]
    for (const path of paths) expect([rest, ...embeds].filter((m) => m(path) !== false).length, path).toBe(1)
  })
})

describe("an embeddable page's headers (embeddableHeaders)", () => {
  const base = [
    { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; frame-ancestors 'self'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
  ]

  it("drops X-Frame-Options, swaps in the policy without frame-ancestors, and enforces frame-ancestors *", () => {
    expect(embeddableHeaders(base, "default-src 'self'")).toEqual([
      { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Content-Security-Policy", value: "frame-ancestors *" },
    ])
  })

  it("once the policy is enforced, adds frame-ancestors * to it instead of a second header that would replace it", () => {
    const enforced = base.map((h) => (h.key === "Content-Security-Policy-Report-Only" ? { ...h, key: "Content-Security-Policy" } : h))
    const out = embeddableHeaders(enforced, "default-src 'self'")
    expect(out.filter((h) => h.key.toLowerCase() === "content-security-policy")).toEqual([{ key: "Content-Security-Policy", value: "default-src 'self'; frame-ancestors *" }])
    expect(out.some((h) => h.key === "X-Frame-Options")).toBe(false)
  })
})
