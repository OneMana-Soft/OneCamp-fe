import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { APP_BOOT_ATTR, APP_BOOT_CSS, APP_BOOT_SCREEN_ATTR, APP_BOOT_SCRIPT, appBootShowing, endAppBoot } from "./appBoot"
import { VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme"

// A cold open of an app page was blank white for seconds (about seven on a
// 10 Mb/s line): the providers draw nothing until the stored state is read, so
// the server sends no markup. The layout now carries the app's splash, shown
// from the first paint by a script right after it on an app address, in the
// person's theme.

let screenEl: HTMLElement

/** The script, run as the browser runs it, at the given address. */
function openAt(url: string, stored?: string): boolean {
  window.history.replaceState({}, "", url)
  endAppBoot()
  screenEl.className = "app-boot"
  if (stored === undefined) localStorage.removeItem("onecamp-theme-color")
  else localStorage.setItem("onecamp-theme-color", stored)
  new Function(APP_BOOT_SCRIPT)()
  return document.documentElement.hasAttribute(APP_BOOT_ATTR)
}

beforeEach(() => {
  screenEl = document.createElement("div")
  screenEl.setAttribute(APP_BOOT_SCREEN_ATTR, "")
  document.body.appendChild(screenEl)
})
afterEach(() => {
  window.history.replaceState({}, "", "/")
  endAppBoot()
  screenEl.remove()
  localStorage.removeItem("onecamp-theme-color")
})

const themeOf = () => [...screenEl.classList].filter((c) => c.startsWith("theme-"))

describe("the first paint of an app page", () => {
  it("shows the splash on an app address, and nowhere else", () => {
    expect(openAt("/app/home")).toBe(true)
    expect(openAt("/app/channel/abc?x=1")).toBe(true)
    expect(openAt("/app")).toBe(true)
    expect(openAt("/")).toBe(false)
    expect(openAt("/signup")).toBe(false)
    expect(openAt("/book/sam-rivera")).toBe(false)
    expect(openAt("/apple")).toBe(false)
  })

  // On <html> the class lost to :root's own --glow, later in the cascade at
  // the same specificity, so a blue theme opened on the house orange.
  it("gives the splash itself the stored theme's class, and only a real theme's", () => {
    openAt("/app/home", "blue")
    expect(themeOf()).toEqual(["theme-blue"])
    expect([...document.documentElement.classList].some((c) => c.startsWith("theme-"))).toBe(false)
    openAt("/app/home", "<img src=x>")
    expect(themeOf()).toEqual([])
    openAt("/app/home")
    expect(themeOf()).toEqual([])
  })

  it("knows every colour theme the app offers", () => {
    for (const t of VALID_COLOR_THEMES) {
      openAt("/app/home", t)
      expect(themeOf(), t).toEqual([`theme-${t}`])
    }
  })

  it("is hidden unless the document is marked", () => {
    expect(APP_BOOT_CSS).toContain(".app-boot{display:none}")
    expect(APP_BOOT_CSS).toContain(`html[${APP_BOOT_ATTR}] .app-boot{display:flex}`)
  })

  it("goes when the app takes over", () => {
    openAt("/app/home", "green")
    expect(appBootShowing()).toBe(true)
    endAppBoot()
    expect(appBootShowing()).toBe(false)
  })

  // QA DSA-33 (14 Oct 2026): the static screen's role=status "Opening …"
  // stayed in the app's page after it took over.
  it("stops being a live region once the app has taken over", () => {
    screenEl.setAttribute("role", "status")
    screenEl.setAttribute("aria-live", "polite")
    openAt("/app/home")
    screenEl.setAttribute("role", "status")
    screenEl.setAttribute("aria-live", "polite")
    endAppBoot()
    expect(screenEl.hasAttribute("role")).toBe(false)
    expect(screenEl.hasAttribute("aria-live")).toBe(false)
    expect(screenEl.hidden).toBe(true)
    expect(document.querySelector("[role=status]")).toBeNull()
  })

  it("is in every build's layout: the screen after the providers, the script right after it", () => {
    const layout = readFileSync("app/layout.tsx", "utf8")
    const body = layout.slice(layout.indexOf("<body"))
    const screen = body.indexOf('<AppBootScreen className="app-boot')
    expect(screen, "the app's first-paint splash is not in the layout").toBeGreaterThan(-1)
    // After the providers: next-themes' mode script runs before it is parsed.
    expect(screen).toBeGreaterThan(body.indexOf("<ClientProviders>"))
    const script = body.indexOf("<script dangerouslySetInnerHTML={{ __html: APP_BOOT_SCRIPT }} />")
    expect(script).toBeGreaterThan(screen)
    expect(body).toContain("<style>{APP_BOOT_CSS}</style>")
    const splash = readFileSync("components/protectedRoute/Splash.tsx", "utf8")
    expect(splash).toMatch(/data-app-boot-screen=""/)
  })
})
