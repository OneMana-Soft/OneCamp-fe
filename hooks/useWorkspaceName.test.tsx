import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

import { useNamedWorkspace, useWorkspaceName, WorkspaceName } from "./useWorkspaceName"
import { WORKSPACE_NAME_STORE_KEY } from "@/lib/workspaceName"

// Design review PG1-01, coordinator, 15 Oct 2026: every page names the
// workspace from the server first (ORG_NAME), so renaming a self-hosted
// workspace needs no rebuild of the web app; then from the build; then
// "OneCamp". Never re-cased. The sign-in page and the boot screen say it too,
// so the server says it in GET /auth/providers, which needs no session.

const API = "https://api.example.test/"

/** Each test its own cache, so one test's answer is never another's. */
const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
)

/** The server's sign-in answer, as fetch gets it. */
function answers(body: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
  vi.stubGlobal("fetch", fetch)
  return fetch
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", API)
  vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "Built Name")
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.removeItem(WORKSPACE_NAME_STORE_KEY)
})

describe("the workspace's name", () => {
  it("is the server's first, as it is written, from an answer that needs no session", async () => {
    const fetch = answers({ status: "success", providers: { email: true }, workspace_name: "kestrel studio" })
    const { result } = renderHook(() => [useWorkspaceName(), useNamedWorkspace()], { wrapper: fresh })
    await waitFor(() => expect(result.current).toEqual(["kestrel studio", "kestrel studio"]))
    // One request for every reader on the page, to the sign-in answer, sent
    // without the session: a signed-out page reads it the same way.
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe(`${API}auth/providers`)
    expect(init.credentials).toBe("omit")
    // Kept for the next open and the boot screen.
    expect(localStorage.getItem(WORKSPACE_NAME_STORE_KEY)).toBe("kestrel studio")
    const { container } = render(<WorkspaceName />, { wrapper: fresh })
    await waitFor(() => expect(container.textContent).toBe("kestrel studio"))
  })

  it("is the build's when the server names none, and OneCamp when neither does", async () => {
    localStorage.setItem(WORKSPACE_NAME_STORE_KEY, "Old Name")
    answers({ status: "success", providers: {}, workspace_name: "" })
    const built = renderHook(() => useWorkspaceName(), { wrapper: fresh })
    await waitFor(() => expect(built.result.current).toBe("Built Name"))
    // Nobody has named it now, so the next open doesn't say the old name.
    expect(localStorage.getItem(WORKSPACE_NAME_STORE_KEY)).toBeNull()

    vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "")
    const neither = renderHook(() => [useWorkspaceName(), useNamedWorkspace()], { wrapper: fresh })
    await waitFor(() => expect(neither.result.current).toEqual(["OneCamp", ""]))
  })

  it("is the name the server gave last time until it answers", () => {
    localStorage.setItem(WORKSPACE_NAME_STORE_KEY, "Kestrel Studio")
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})))
    const { result } = renderHook(() => useWorkspaceName(), { wrapper: fresh })
    expect(result.current).toBe("Kestrel Studio")
  })

  it("keeps the last name when the server can't answer, or doesn't say", async () => {
    localStorage.setItem(WORKSPACE_NAME_STORE_KEY, "Kestrel Studio")
    for (const fetch of [
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
      vi.fn(async () => new Response("", { status: 502 })),
      // A server older than the field.
      vi.fn(async () => new Response(JSON.stringify({ status: "success", providers: {} }))),
    ]) {
      vi.stubGlobal("fetch", fetch)
      const { result } = renderHook(() => useWorkspaceName(), { wrapper: fresh })
      await waitFor(() => expect(fetch).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      expect(result.current).toBe("Kestrel Studio")
      expect(localStorage.getItem(WORKSPACE_NAME_STORE_KEY)).toBe("Kestrel Studio")
    }
  })

  it("asks nothing when the build names no server", () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const { result } = renderHook(() => useWorkspaceName(), { wrapper: fresh })
    expect(result.current).toBe("Built Name")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("is never re-cased by the element around it", () => {
    // The phone drawers' hidden titles wrapped it in `capitalize`, which
    // Chrome hands a screen reader re-cased: "One Camp" for "one camp".
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p)
        return p.endsWith(".tsx") && !p.includes(".test.") ? [p] : []
      })
    const uses: string[] = []
    const recased: string[] = []
    for (const f of ["app", "components"].flatMap(files)) {
      const lines = readFileSync(f, "utf8").split("\n")
      lines.forEach((line, i) => {
        if (!line.includes("<WorkspaceName />")) return
        const at = `${relative(process.cwd(), f)}:${i + 1}`
        uses.push(at)
        // The tag it sits in opens on its own line or the one above.
        if (/\b(capitalize|uppercase|lowercase)\b/.test(lines.slice(Math.max(0, i - 1), i + 1).join("\n"))) recased.push(at)
      })
    }
    expect(uses.length).toBeGreaterThan(0)
    expect(recased).toEqual([])
  })
})
