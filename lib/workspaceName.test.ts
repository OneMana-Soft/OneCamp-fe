import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { namedWorkspace, workspaceName } from "@/lib/workspaceName"

// Design review PG1-01 (14 Oct 2026): the workspace's name was read raw from
// the build's environment in fourteen places, each with its own fallback; on
// the demo every page said "one camp". One helper now.

afterEach(() => vi.unstubAllEnvs())

describe("the workspace's name", () => {
  it("is the server's name first, then the build's, then OneCamp", () => {
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "  Kestrel Studio ")
    expect(workspaceName()).toBe("Kestrel Studio")
    expect(workspaceName(" Acme ")).toBe("Acme")
    expect(namedWorkspace()).toBe("Kestrel Studio")
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "")
    expect(workspaceName()).toBe("OneCamp")
    expect(namedWorkspace()).toBe("")
    expect(namedWorkspace("  ")).toBe("")
    // A name is the workspace's own: never re-cased or rewritten.
    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "one camp")
    expect(workspaceName()).toBe("one camp")
  })

  it("is read from lib/workspaceName alone", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p)
        return /\.(ts|tsx)$/.test(p) && !p.includes(".test.") ? [p] : []
      })
    const readers = ["app", "components", "lib", "hooks", "services"]
      .flatMap(files)
      .filter((f) => readFileSync(f, "utf8").includes("process.env.NEXT_PUBLIC_ORG_NAME"))
      .map((f) => relative(process.cwd(), f))
    expect(readers).toEqual(["lib/workspaceName.ts"])
  })
})
