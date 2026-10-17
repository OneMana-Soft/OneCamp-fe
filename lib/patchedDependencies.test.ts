import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

// patches/ holds what pnpm changes in a dependency as it installs it
// (package.json, pnpm.patchedDependencies; the first is Radix's toast,
// patches/@radix-ui__react-toast@1.2.15.patch). An install without the folder
// fails: `pnpm install --frozen-lockfile` stops on the missing patch. The
// public repository's Dockerfile, which a server's "web" profile builds from,
// copied package.json and pnpm-lock.yaml alone before installing: right until
// the first patch, and a broken install on every server after it. So every
// Dockerfile here that runs pnpm install copies patches/ before it, and no
// .dockerignore leaves the folder out.

const ROOT = join(__dirname, "..")
const SKIP = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "coverage"])

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

/** The sources of a COPY or ADD instruction, or none when it copies from another stage or image. */
function copySources(instruction: string): string[] {
  const args = instruction.replace(/^(COPY|ADD)\s+/i, "")
  const words = args.trim().startsWith("[") ? (JSON.parse(args.slice(args.indexOf("["))) as string[]) : args.split(/\s+/)
  if (words.some((w) => /^--from=/i.test(w))) return []
  const paths = words.filter((w) => !w.startsWith("--"))
  return paths.slice(0, -1)
}

/** Whether a COPY source brings the patches folder into the image. */
const bringsPatches = (source: string) => /^(\.\/?|\.\/patches\/?|patches\/?|patches\/\*\*?)$/.test(source)

/**
 * Whether a Dockerfile copies patches/ into the build before its first
 * `pnpm install` in the same stage; null when it runs no pnpm install. Pure,
 * for the cases below.
 */
function copiesPatchesBeforeInstall(dockerfile: string): boolean | null {
  const instructions = dockerfile
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
  let copied = false
  for (const line of instructions) {
    if (/^FROM\s/i.test(line)) copied = false
    else if (/^(COPY|ADD)\s/i.test(line) && copySources(line).some(bringsPatches)) copied = true
    else if (/^RUN\s/i.test(line) && /\bpnpm\s+(install|i)\b/.test(line)) return copied
  }
  return null
}

/** Whether a .dockerignore leaves patches/ out of the build context. */
function ignoresPatches(dockerignore: string): boolean {
  const lines = dockerignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  let ignored = false
  for (const l of lines) {
    if (/^!\/?patches(\/.*)?$/.test(l)) ignored = false
    else if (/^\/?patches(\/|\/\*\*)?$/.test(l) || l === "*" || l === "**") ignored = true
  }
  return ignored
}

const OLD_PUBLIC = `FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build`

describe("reading a Dockerfile", () => {
  it("knows a build that installs before it has the patches", () => {
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC)).toBe(false)
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC.replace("COPY package.json pnpm-lock.yaml ./", "COPY package.json pnpm-lock.yaml ./\nCOPY patches ./patches"))).toBe(true)
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC.replace("COPY package.json pnpm-lock.yaml ./", "COPY package.json pnpm-lock.yaml patches/ ./"))).toBe(true)
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC.replace("COPY package.json pnpm-lock.yaml ./", "COPY --chown=node:node . ."))).toBe(true)
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC.replace("COPY package.json pnpm-lock.yaml ./", 'COPY ["package.json", "pnpm-lock.yaml", "patches", "./"]'))).toBe(true)
    // Copied from another stage, or in a stage before this one, is not here.
    expect(copiesPatchesBeforeInstall(OLD_PUBLIC.replace("COPY package.json pnpm-lock.yaml ./", "COPY --from=deps /app/patches ./patches"))).toBe(false)
    expect(copiesPatchesBeforeInstall(`FROM node:22 AS one\nCOPY patches ./patches\n${OLD_PUBLIC}`)).toBe(false)
    expect(copiesPatchesBeforeInstall("FROM node:22\nCOPY . .\nRUN pnpm build")).toBeNull()
    // A continued line is one instruction.
    expect(copiesPatchesBeforeInstall("FROM node:22\nCOPY package.json \\\n  patches ./\nRUN corepack enable \\\n && pnpm i --frozen-lockfile")).toBe(true)
  })

  it("knows a .dockerignore that leaves the patches out", () => {
    expect(ignoresPatches("node_modules\n.next\n.git\n.env*.local\ncoverage\n*.log")).toBe(false)
    expect(ignoresPatches("node_modules\npatches/")).toBe(true)
    expect(ignoresPatches("*\n!package.json\n!pnpm-lock.yaml")).toBe(true)
    expect(ignoresPatches("*\n!package.json\n!patches")).toBe(false)
  })

  const tmp = mkdtempSync(join(tmpdir(), "dockerfiles-"))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))
  it("finds every Dockerfile, and none in dependencies", () => {
    for (const p of ["Dockerfile", "deploy/web.Dockerfile", "docker/Dockerfile.dev", "node_modules/x/Dockerfile"]) {
      mkdirSync(join(tmp, p, ".."), { recursive: true })
      writeFileSync(join(tmp, p), "FROM node:22\n")
    }
    expect(dockerfiles(tmp).map((p) => relative(tmp, p)).sort()).toEqual(["Dockerfile", "deploy/web.Dockerfile", "docker/Dockerfile.dev"])
  })
})

describe("pnpm's patched dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { pnpm?: { patchedDependencies?: Record<string, string> } }
  const patches = Object.entries(pkg.pnpm?.patchedDependencies ?? {})

  it("are in the repository", () => {
    for (const [, path] of patches) expect(readdirSync(join(ROOT, path, "..")), path).toContain(path.split("/").pop())
  })

  it("reach every Dockerfile's install", () => {
    if (patches.length === 0) return
    for (const file of dockerfiles(ROOT)) {
      const where = relative(ROOT, file)
      const copied = copiesPatchesBeforeInstall(readFileSync(file, "utf8"))
      if (copied === null) continue
      expect(copied, `${where} runs pnpm install before it copies patches/ (COPY patches ./patches)`).toBe(true)
      let ignore = ""
      try {
        ignore = readFileSync(join(file, "..", ".dockerignore"), "utf8")
      } catch {
        // No .dockerignore: the whole folder is in the build context.
      }
      expect(ignoresPatches(ignore), `${where}: .dockerignore leaves patches/ out of the build`).toBe(false)
    }
  })
})
