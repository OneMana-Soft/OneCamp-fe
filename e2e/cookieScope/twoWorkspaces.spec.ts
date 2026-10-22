import { expect, test, type BrowserContext, type Page } from "@playwright/test"

// COOKIE-SCOPE (21 Oct 2026). Two Cloud workspaces on one zone, open in one
// browser: acme.ws.test and beta.ws.test, their APIs on acme-api.ws.test and
// beta-api.ws.test, each API with its own key and database. Before, each API
// wrote the session and the CSRF token on the zone (FE_DOMAIN): every
// workspace's cookies went to every other workspace's hosts, and signing in to
// one overwrote the other's, which then signed the person out.
//
// Run by e2e/cookieScope/run.sh, which starts both workspaces. Skipped
// anywhere else.

test.skip(!process.env.COOKIE_SCOPE_E2E, "run by e2e/cookieScope/run.sh, which starts two workspaces")

const PORT = Number(process.env.PROXY_PORT || 8443)
const EMAIL = process.env.COOKIE_SCOPE_E2E_EMAIL ?? ""
const PASSWORD = process.env.COOKIE_SCOPE_E2E_PASSWORD ?? ""

type Workspace = { web: string; api: string; apiHost: string }
const workspace = (name: string): Workspace => ({
  web: `https://${name}.ws.test:${PORT}`,
  api: `https://${name}-api.ws.test:${PORT}/`,
  apiHost: `${name}-api.ws.test`,
})
const ACME = workspace("acme")
const BETA = workspace("beta")
const SESSION = ["__Host-Authorization", "__Host-RefreshToken", "__Host-DeviceId", "__Host-X-CSRF-Token"]

async function signIn(page: Page, w: Workspace) {
  await page.goto(`${w.web}/`)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 60_000 })
}

/** The page's own credentialed read of its workspace's profile. */
function profile(page: Page, w: Workspace): Promise<number> {
  return page.evaluate(
    async (api) => (await fetch(`${api}user/profile`, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } })).status,
    w.api,
  )
}

/** A write as this release's web app makes one: the token from an answer's header. */
function write(page: Page, w: Workspace): Promise<{ status: number; named: boolean }> {
  return page.evaluate(async (api) => {
    const client = { "X-Requested-With": "XMLHttpRequest" }
    const read = await fetch(`${api}user/profile`, { credentials: "include", headers: client })
    const token = read.headers.get("X-CSRF-Token") ?? ""
    const res = await fetch(`${api}updateUserTheme`, {
      method: "POST",
      credentials: "include",
      headers: { ...client, "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ user_theme_mode: "dark" }),
    })
    return { status: res.status, named: token !== "" }
  }, w.api)
}

/**
 * Every request the context makes, with the cookies it carried, and every
 * cookie each host set (Set-Cookie), so a cookie seen on a request is traced to
 * the host that made it. Kept in memory, never printed.
 */
function recordTraffic(context: BrowserContext) {
  const pending: Promise<{ host: string; path: string; method: string; cookies: [string, string][] }>[] = []
  const minted = new Map<string, Set<string>>()
  const setBy: Promise<void>[] = []
  context.on("response", (res) => {
    setBy.push(
      res.headersArray().then((headers) => {
        const host = new URL(res.url()).hostname
        for (const h of headers) {
          if (h.name.toLowerCase() !== "set-cookie") continue
          const pair = h.value.split(";")[0]
          if (!pair.includes("=") || pair.endsWith("=")) continue
          if (!minted.has(host)) minted.set(host, new Set())
          minted.get(host)!.add(pair)
        }
      }),
    )
  })
  context.on("request", (req) => {
    pending.push(
      req.allHeaders().then((h) => {
        const url = new URL(req.url())
        const cookies = (h.cookie ?? "")
          .split(/;\s*/)
          .filter(Boolean)
          .map((pair): [string, string] => {
            const i = pair.indexOf("=")
            return [pair.slice(0, i), pair.slice(i + 1)]
          })
        return { host: url.hostname, path: url.pathname, method: req.method(), cookies }
      }),
    )
  })
  return async () => {
    await Promise.all(setBy)
    return { sent: await Promise.all(pending), minted }
  }
}

test("two workspaces on one zone stay signed in side by side, and neither's cookies reach the other's hosts", async ({ context }) => {
  const traffic = recordTraffic(context)

  const acme = await context.newPage()
  await signIn(acme, ACME)
  expect(await profile(acme, ACME)).toBe(200)

  const beta = await context.newPage()
  await signIn(beta, BETA)
  expect(await profile(beta, BETA)).toBe(200)

  // Signing in to beta left acme signed in, and the other way round.
  for (const [page, w] of [[acme, ACME], [beta, BETA]] as const) {
    await page.reload()
    await page.waitForURL(/\/app(\/|$|\?)/)
    expect(await profile(page, w)).toBe(200)
    const written = await write(page, w)
    expect(written.named).toBe(true)
    expect(written.status).toBe(200)
  }
  expect(acme.url()).toContain("acme.ws.test")
  expect(new URL(acme.url()).pathname).toMatch(/^\/app/)

  const { sent, minted } = await traffic()
  // Nobody was signed out along the way.
  expect(sent.filter((r) => r.path.endsWith("/logout")).map((r) => `${r.method} ${r.host}${r.path}`)).toEqual([])

  const jar = await context.cookies()
  // Every cookie is one host's own: none on the zone.
  expect(jar.filter((c) => c.domain.startsWith(".")).map((c) => `${c.name} on ${c.domain}`)).toEqual([])
  // The session and the CSRF token are each API host's own.
  for (const w of [ACME, BETA]) {
    const own = jar.filter((c) => c.domain === w.apiHost).map((c) => c.name)
    for (const name of SESSION) expect(own, `${name} on ${w.apiHost}`).toContain(name)
  }
  for (const c of jar.filter((c) => SESSION.includes(c.name))) {
    expect(c.httpOnly && c.secure && c.path === "/" && c.sameSite === "Lax", `${c.name} on ${c.domain}`).toBe(true)
  }
  // And no request carried a cookie another host set.
  const strays: string[] = []
  for (const r of sent) {
    for (const [name, value] of r.cookies) {
      const pair = `${name}=${value}`
      if (minted.get(r.host)?.has(pair)) continue
      for (const [host, pairs] of minted) if (host !== r.host && pairs.has(pair)) strays.push(`${name} set by ${host} sent to ${r.host}`)
    }
  }
  expect(strays).toEqual([])
  // The session was set by both APIs, so the check above had something to find.
  for (const w of [ACME, BETA]) expect([...(minted.get(w.apiHost) ?? [])].some((p) => p.startsWith("__Host-Authorization="))).toBe(true)
  // Both workspaces' APIs were reached, so the check above saw their traffic.
  expect(sent.some((r) => r.host === ACME.apiHost)).toBe(true)
  expect(sent.some((r) => r.host === BETA.apiHost)).toBe(true)
})

test("a web build from before this release (no X-Requested-With) still writes, through the readable cookie on the zone", async ({ context }) => {
  const page = await context.newPage()
  await signIn(page, ACME)
  const result = await page.evaluate(async (api) => {
    // What an older build's API client does: no X-Requested-With, and the
    // token read from document.cookie.
    await fetch(`${api}user/profile`, { credentials: "include" })
    const token = decodeURIComponent((document.cookie.match(/(?:^|;\s*)X-CSRF-Token=([^;]*)/) || [])[1] || "")
    const res = await fetch(`${api}updateUserTheme`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ user_theme_mode: "dark" }),
    })
    return { status: res.status, readable: token !== "" }
  }, ACME.api)
  expect(result.readable).toBe(true)
  expect(result.status).toBe(200)
  // The zone holds that one readable cookie, and no session.
  const zone = (await context.cookies()).filter((c) => c.domain.startsWith("."))
  expect(zone.map((c) => `${c.name} httpOnly=${c.httpOnly}`)).toEqual(["X-CSRF-Token httpOnly=false"])
})
