import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import { APP_BOOT_SCREEN_ATTR, appBootState, endAppBoot } from "@/lib/appBoot"
import { MEMBER_KEY } from "@/lib/memberMark"

// The splash, 17 Oct 2026. The installed app and the desktop app open the
// start page, and in a browser a member has used, its first paint is the
// app's splash (lib/appBoot). The sign-in page takes it over: somebody signed
// in goes into the app under it, and with nobody signed in it fades and the
// page is the sign-in page again. Every way into the app puts it up first.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))

import SignInPage from "./page"

let boot: HTMLElement

/** The server: the session probe and the sign-in options. */
function serve(signedIn: boolean) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0]
    const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
    if (path.endsWith("user/profile")) return signedIn ? answer(200, { msg: "ok", data: { user_uuid: "u" } }) : answer(401, { msg: "no session" })
    if (path.endsWith("refreshToken")) return answer(401, { msg: "no session" })
    if (path.endsWith("auth/providers")) return answer(200, { providers: { email: true } })
    if (path.endsWith("auth/admin-setup-required")) return answer(200, { required: false })
    throw new Error(`no route for ${path}`)
  })
}

beforeEach(() => {
  router.push.mockReset()
  // The start page's first paint in a member's browser: the splash is up.
  boot = document.createElement("div")
  boot.className = "app-boot"
  boot.setAttribute(APP_BOOT_SCREEN_ATTR, "")
  document.body.appendChild(boot)
  document.documentElement.setAttribute("data-app-boot", "")
  localStorage.setItem(MEMBER_KEY, "1")
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  endAppBoot()
  boot.remove()
  localStorage.removeItem(MEMBER_KEY)
})

describe("the start page in a member's browser", () => {
  it("fades the splash when nobody is signed in, and is the sign-in page from the next first paint", async () => {
    serve(false)
    render(<SignInPage />)
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy()
    await waitFor(() => expect(appBootState()).toBe("leaving"))
    expect(localStorage.getItem(MEMBER_KEY)).toBeNull()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("goes into the app under the splash when somebody is signed in", async () => {
    serve(true)
    render(<SignInPage />)
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/home"))
    expect(appBootState()).toBe("held")
    expect(localStorage.getItem(MEMBER_KEY)).toBe("1")
  })
})

describe("every way into the app from the sign-in page", () => {
  // A new way in that pushed by itself would show the sign-in page until the
  // app's code came, then the splash arriving cold.
  it("puts the splash up first: the only pushes are enterApp's, and the admin setup's after the splash has gone", () => {
    const page = readFileSync("app/page.tsx", "utf8")
    const pushes = [...page.matchAll(/router\.push\(([^)]*)\)/g)].map((m) => m[1])
    expect(pushes.sort()).toEqual(["'/admin-setup'", "path"])
    expect(page).toMatch(/holdAppBoot\(\{ settled \}\);\s*router\.push\(path\);/)
    expect(page).toMatch(/leaveAppBoot\(\);\s*router\.push\('\/admin-setup'\);/)
  })
})
