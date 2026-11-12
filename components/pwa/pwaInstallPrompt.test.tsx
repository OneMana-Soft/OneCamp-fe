import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// A customer's build: the demo never asks (lib/utils/pwaPrompt), and the prompt reads that as it loads.
vi.hoisted(() => vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false"))

import { PwaInstallPrompt } from "./PwaInstallPrompt"
import { loadsStarted } from "@/lib/testing/lazyCode"

// The card that suggests adding OneCamp to the home screen (FLUIDITY-13,
// 5 Nov 2026). The prompt listens on every page, from the root layout's
// providers; the card is a chunk of its own (./pwaInstallCard), fetched only
// once there is something to suggest. What a person sees and does is as it
// was: the browser's install offer brings the card, Install hands over to the
// browser's own dialog, once, and Not now puts it away for a fortnight.

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const TITLE = "Add OneCamp to your home screen"

let ua = ANDROID
const realMatchMedia = window.matchMedia

beforeEach(() => {
  vi.spyOn(window.navigator, "userAgent", "get").mockImplementation(() => ua)
  // Not opened from the home screen.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia
  window.localStorage.clear()
  window.sessionStorage.clear()
  // A returning visitor: this browser session is the second visit.
  window.localStorage.setItem("onecamp:pwa:visits", "1")
})

afterEach(() => {
  cleanup()
  document.querySelectorAll("[data-corner-stack]").forEach((n) => n.remove())
  vi.restoreAllMocks()
  window.matchMedia = realMatchMedia
  ua = ANDROID
})

afterAll(() => vi.unstubAllEnvs())

/** The browser's install offer, with prompt() counted. */
function offer() {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => void; userChoice: Promise<unknown> }
  const prompt = vi.fn()
  e.prompt = prompt
  e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" })
  act(() => void window.dispatchEvent(e))
  return { event: e, prompt }
}

const card = () => document.querySelector("[data-corner-stack='left'] [data-corner-card]")

// The card's code comes with the first card, not with every page: the prompt's
// root-layout part only listens. A computer, a first visit or a dismissed card
// fetch nothing. First in the file: once fetched, the code stays, as in a tab.
describe("the card's code", () => {
  it("is not fetched while there is nothing to suggest, offer or not", async () => {
    ua = DESKTOP
    const before = loadsStarted()
    render(<PwaInstallPrompt />)
    offer()
    await act(async () => {})
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(loadsStarted() - before).toBe(0)
  })

  it("is fetched once the browser offers, and the card is drawn from it", async () => {
    const before = loadsStarted()
    render(<PwaInstallPrompt />)
    await act(async () => {})
    expect(loadsStarted() - before, "nothing fetched before the offer").toBe(0)
    offer()
    expect(await screen.findByText(TITLE)).toBeTruthy()
    expect(loadsStarted() - before, "the card's chunk, fetched for it").toBeGreaterThanOrEqual(1)
  })
})

describe("the install card", () => {
  it("comes when the browser offers to install, with Install and Not now, in the left corner stack", async () => {
    render(<PwaInstallPrompt />)
    await act(async () => {})
    expect(screen.queryByText(TITLE)).toBeNull()

    const { event } = offer()
    expect(event.defaultPrevented, "the browser's own mini-infobar is kept away").toBe(true)
    expect(await screen.findByText(TITLE)).toBeTruthy()
    expect(screen.getByText("Opens like an app, with notifications.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy()
    // Placed by the corner stack, as every corner card is (components/ui/cornerStack.test.tsx).
    expect(card()?.contains(screen.getByText(TITLE))).toBe(true)
    expect(card()?.className).toContain("md:w-[400px]")
  })

  it("hands Install to the browser's own dialog once, and goes", async () => {
    render(<PwaInstallPrompt />)
    const { prompt } = offer()
    fireEvent.click(await screen.findByRole("button", { name: "Install" }))
    expect(prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull())
    expect(card()).toBeNull()
  })

  it("goes on Not now, and stays away for a fortnight, offer or not", async () => {
    render(<PwaInstallPrompt />)
    offer()
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }))
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull())
    const at = Number(window.localStorage.getItem("onecamp:pwa:dismissedAt"))
    expect(Date.now() - at).toBeLessThan(60_000)

    cleanup()
    render(<PwaInstallPrompt />)
    offer()
    await act(async () => {})
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it("goes when the app is installed some other way", async () => {
    render(<PwaInstallPrompt />)
    offer()
    expect(await screen.findByText(TITLE)).toBeTruthy()
    act(() => void window.dispatchEvent(new Event("appinstalled")))
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull())
  })

  it("gives the Share steps on iOS, which never offers, with no Install", async () => {
    ua = IPHONE
    render(<PwaInstallPrompt />)
    expect(await screen.findByText(TITLE)).toBeTruthy()
    expect(screen.getByText("Add to Home Screen").tagName).toBe("STRONG")
    expect(card()?.textContent).toMatch(/Tap\s*Share, then Add to Home Screen\./)
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull())
  })
})
