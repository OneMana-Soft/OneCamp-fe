import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// Every request that carries the session goes through the API client
// (lib/axiosInstance) or backendFetch (lib/http/backendFetch). Both say the
// request comes from the web app that reads the CSRF token from the API's
// answers; for a request that doesn't, the API still writes a readable cookie
// on FE_DOMAIN, the shared zone on Cloud (kept for web builds from before
// 21 Oct 2026). A credentialed fetch written by hand would bring that cookie
// back, and would send no CSRF token.
//
// A few raw axios calls stay (the session's own refresh and sign-out, which
// must not go through the client's interceptors); each sends the same header.

const ROOT = join(__dirname, "..", "..")
const DIRS = ["app", "components", "context", "hooks", "lib", "services", "store"]
const ALLOWED: Record<string, string> = {
  "lib/axiosInstance.ts": "the API client itself, and its sign-out",
  "lib/http/backendFetch.ts": "the fetch every other credentialed request goes through",
  "lib/auth/sessionRefreshRun.ts": "the refresh, outside the client's interceptors",
  "components/protectedRoute/appProtectedRoute.tsx": "the sign-out when the session is gone",
}
const CREDENTIALED = /credentials:\s*["']include["']|withCredentials:\s*true/

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && !name.startsWith(".")) sources(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

function codeLines(text: string): string[] {
  return text.split("\n").filter((l) => {
    const t = l.trim()
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
  })
}

describe("credentialed requests", () => {
  it("go through the API client or backendFetch", () => {
    const offenders: string[] = []
    for (const d of DIRS) {
      for (const file of sources(join(ROOT, d))) {
        const rel = relative(ROOT, file)
        if (ALLOWED[rel]) continue
        if (codeLines(readFileSync(file, "utf8")).some((l) => CREDENTIALED.test(l))) offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  it("say they come from the web app, where they are made by hand", () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(readFileSync(join(ROOT, rel), "utf8"), rel).toContain("WEB_CLIENT_HEADERS")
    }
  })
})
