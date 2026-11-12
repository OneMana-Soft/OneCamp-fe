import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

// The signed-out pages say where the workspace runs (SHELL-05). "Self-hosted,
// your data stays on this server" was on every workspace's sign-in page,
// OneCamp Cloud's and the public demo's too. The public sign-in answer now
// says which it is (hosting), and the trust line and the camp's chip claim
// only that; before it answers, or from a server too old to say, they claim
// nothing.

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
import { AuthShell } from "@/components/auth/AuthShell"
import { SignInSide } from "@/components/auth/SignInSide"

let answer: Promise<unknown>
// A fetch of its own for each answer: the sign-in answer is kept per fetch, once a load.
const server = () =>
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    expect(String(input)).toMatch(/auth\/providers$/)
    return { ok: true, status: 200, json: async () => await answer } as Response
  })
beforeEach(() => {
  answer = Promise.resolve({ status: "success", providers: { email: true } })
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
  server()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete process.env.NEXT_PUBLIC_BACKEND_URL
})

const trust = () => document.querySelector("[data-trust-line]")?.textContent ?? ""
const page = () => render(<AuthShell side={<SignInSide />}>The form</AuthShell>)
const serverChip = () => document.querySelector("[data-claim='server']")?.textContent ?? null
const chipShield = () => document.querySelector("[data-claim='server'] svg")

describe("where the workspace runs, on the signed-out pages", () => {
  it("claims self-hosting only on a self-hosted server", async () => {
    answer = Promise.resolve({ status: "success", hosting: "self" })
    page()
    await waitFor(() => expect(trust()).toBe(`${location.host} · self-hosted, your data stays on this server`))
    expect(serverChip()).toContain("Your server")
    expect(chipShield()).not.toBeNull()
    cleanup()

    answer = Promise.resolve({ status: "success", hosting: "cloud" })
    server()
    page()
    await waitFor(() => expect(trust()).toBe(`${location.host} · run by OneMana for your team`))
    expect(trust()).not.toMatch(/self-hosted|stays on this server/)
    expect(serverChip()).toContain("OneMana Cloud")
    cleanup()

    answer = Promise.resolve({ status: "success", hosting: "demo" })
    server()
    page()
    // The demo's line is the two words alone: the demo button's hint already says it
    // starts over every night, and one fact is said once. Nor does its chip carry the
    // shield the trust line leaves off: the demo claims nothing of anyone's data.
    await waitFor(() => expect(trust()).toBe("Shared demo"))
    expect(serverChip()).toContain("Demo server")
    expect(chipShield()).toBeNull()
  })

  it("says nothing it can't know before the server answers", async () => {
    let tell: (v: unknown) => void = () => {}
    answer = new Promise((r) => (tell = r))
    page()
    expect(screen.getByText("The form")).toBeTruthy()
    expect(trust()).toBe(location.host)
    expect(serverChip()).toBeNull()
    tell({ status: "success", providers: { email: true } })
    // A server too old to say: still nothing claimed.
    await new Promise((r) => setTimeout(r, 0))
    // The host alone, with no dot left hanging after it.
    expect(trust()).toBe(location.host)
    expect(serverChip()).toBeNull()
  })

  // The page learns one of three words and shows only what it maps to: never
  // a word it doesn't know, so no address, name, version or setting a server
  // might send there reaches a stranger through it.
  it("shows nothing of a hosting word it doesn't know", async () => {
    answer = Promise.resolve({ status: "success", hosting: "kestrel.example v2.79 managed" })
    page()
    // The answer has come (a fetch and a render later), and still nothing of it shows.
    await new Promise((r) => setTimeout(r, 20))
    expect(trust()).not.toMatch(/kestrel|v2\.79|managed|self-hosted|OneMana|demo/i)
    expect(serverChip()).toBeNull()
  })
})
