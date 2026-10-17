import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// One pnpm everywhere: the gates, the Docker image and Vercel. The lockfile
// is written by the pnpm that made it, and a patched dependency is recorded in
// a shape that pnpm's major version decides. On 17 Oct 2026 the first patch
// (patches/@radix-ui__react-toast@1.2.15.patch, written by pnpm 9.15.4)
// reached Vercel, which had no version to go by and chose "pnpm@10.x based
// on project creation date"; its frozen install stopped with
// ERR_PNPM_LOCKFILE_CONFIG_MISMATCH and the deploy failed, while every gate
// and the public Dockerfile (corepack prepare pnpm@9.15.4) installed fine.
// So package.json names the exact pnpm (packageManager, which Vercel and
// corepack both read), and a Dockerfile that prepares pnpm prepares that one.

const ROOT = join(__dirname, "..")
const SKIP = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "coverage"])

/** An exact pnpm release, as packageManager writes it: pnpm@X.Y.Z, with corepack's optional +sha hash. */
const EXACT_PNPM = /^pnpm@(\d+\.\d+\.\d+)(\+sha(224|256|384|512)\.[0-9a-f]+)?$/

/** The exact pnpm version a packageManager value pins, or null when it pins none. Pure. */
function pinnedPnpm(packageManager: unknown): string | null {
  if (typeof packageManager !== "string") return null
  return EXACT_PNPM.exec(packageManager.trim())?.[1] ?? null
}

/** The pnpm versions a Dockerfile installs (corepack prepare or use, npm i -g). Pure. */
function dockerPnpmVersions(dockerfile: string): string[] {
  const text = dockerfile.replace(/\\\r?\n/g, " ")
  const out: string[] = []
  for (const m of text.matchAll(/\bcorepack\s+(?:prepare|use)\s+pnpm@([^\s&;|]+)/g)) out.push(m[1])
  for (const m of text.matchAll(/\bnpm\s+(?:i|install)\s+(?:-g|--global)\s+pnpm(?:@([^\s&;|]+))?/g)) out.push(m[1] ?? "latest")
  return out
}

/** Every Dockerfile under `dir`, outside dependencies and build output. */
function dockerfiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...dockerfiles(path))
    else if (/^(Dockerfile|Containerfile)(\..+)?$|\.(Dockerfile|dockerfile)$/.test(entry.name)) out.push(path)
  }
  return out
}

describe("reading a pin", () => {
  it("takes an exact pnpm release, and nothing looser", () => {
    expect(pinnedPnpm("pnpm@9.15.4")).toBe("9.15.4")
    expect(pinnedPnpm("pnpm@9.15.4+sha512.abc123")).toBe("9.15.4")
    expect(pinnedPnpm(undefined)).toBeNull()
    expect(pinnedPnpm("pnpm")).toBeNull()
    expect(pinnedPnpm("pnpm@9")).toBeNull()
    expect(pinnedPnpm("pnpm@^9.15.4")).toBeNull()
    expect(pinnedPnpm("pnpm@latest")).toBeNull()
    expect(pinnedPnpm("npm@10.9.0")).toBeNull()
  })

  it("finds the pnpm a Dockerfile installs", () => {
    expect(dockerPnpmVersions("FROM node:22-alpine\nRUN corepack enable && corepack prepare pnpm@9.15.4 --activate")).toEqual(["9.15.4"])
    expect(dockerPnpmVersions("FROM node:22\nRUN corepack enable \\\n && corepack use pnpm@10.2.0")).toEqual(["10.2.0"])
    expect(dockerPnpmVersions("FROM node:22\nRUN npm install -g pnpm")).toEqual(["latest"])
    expect(dockerPnpmVersions("FROM node:22\nRUN npm i -g pnpm@9.15.4")).toEqual(["9.15.4"])
    expect(dockerPnpmVersions("FROM node:22\nRUN corepack enable\nRUN pnpm install --frozen-lockfile")).toEqual([])
  })
})

describe("the pnpm this project installs with", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { packageManager?: string }
  const pinned = pinnedPnpm(pkg.packageManager)

  it("is named exactly in package.json, so no installer picks its own", () => {
    expect(pinned, `package.json's packageManager is ${JSON.stringify(pkg.packageManager)}; it must be an exact "pnpm@X.Y.Z"`).not.toBeNull()
  })

  it("is the one every Dockerfile prepares", () => {
    for (const file of dockerfiles(ROOT)) {
      for (const v of dockerPnpmVersions(readFileSync(file, "utf8"))) {
        expect(v, `${relative(ROOT, file)} installs pnpm ${v}, package.json pins ${pinned}`).toBe(pinned)
      }
    }
  })
})
