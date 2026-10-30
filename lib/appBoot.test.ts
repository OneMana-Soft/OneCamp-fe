import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  APP_BOOT_ATTR,
  APP_BOOT_CSS,
  APP_BOOT_LEAVE_MS,
  APP_BOOT_SCREEN_ATTR,
  APP_BOOT_SCRIPT,
  ROOT_UNCLAIMED_MS,
  appBootShowing,
  appBootState,
  endAppBoot,
  holdAppBoot,
  leaveAppBoot,
  slowAppBoot,
} from "./appBoot"
import { MEMBER_KEY, forgetMember, rememberMember } from "./memberMark"
import { VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme"
import { GROUND } from "@/lib/pwa/grounds"

// A cold open of an app page was blank white for seconds (about seven on a
// 10 Mb/s line): the providers draw nothing until the stored state is read, so
// the server sends no markup. The layout now carries the app's splash, shown
// from the first paint by a script right after it on an app address, in the
// person's theme.
//
// 17 Oct 2026 (the splash): one splash from the first paint to the app. It is
// also the first paint of the bare start page for a browser a member has used
// (the installed app and the desktop app open there), the app holds it while
// it asks who is signed in, and it cross-fades into the shell; the browser's
// bar takes its ground before any code runs.

let screenEl: HTMLElement

/** The script, run as the browser runs it, at the given address. */
function openAt(url: string, stored?: string, { member = false } = {}): boolean {
  window.history.replaceState({}, "", url)
  endAppBoot()
  screenEl.className = "app-boot"
  if (stored === undefined) localStorage.removeItem("onecamp-theme-color")
  else localStorage.setItem("onecamp-theme-color", stored)
  if (member) localStorage.setItem(MEMBER_KEY, "1")
  else localStorage.removeItem(MEMBER_KEY)
  new Function(APP_BOOT_SCRIPT)()
  return document.documentElement.hasAttribute(APP_BOOT_ATTR)
}

const metas = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]

beforeEach(() => {
  screenEl = document.createElement("div")
  screenEl.setAttribute(APP_BOOT_SCREEN_ATTR, "")
  document.body.appendChild(screenEl)
  for (const media of ["(max-width: 639px) and (prefers-color-scheme: dark)", "(max-width: 639px)", "(prefers-color-scheme: dark)", ""]) {
    const m = document.createElement("meta")
    m.name = "theme-color"
    if (media) m.media = media
    m.content = "#000000"
    document.head.appendChild(m)
  }
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, "", "/")
  endAppBoot()
  screenEl.remove()
  for (const m of metas()) m.remove()
  document.documentElement.classList.remove("dark")
  localStorage.removeItem("onecamp-theme-color")
  localStorage.removeItem(MEMBER_KEY)
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

  // The installed app and the desktop app open the start page, which a
  // member saw as a blank page, then the sign-in page's placeholder, then the
  // splash, then the app. In a browser a member has used, the start page's
  // first paint is the splash, until the sign-in page knows.
  it("shows it on the bare start page too, in a browser a member has used, and only there", () => {
    expect(openAt("/", undefined, { member: true })).toBe(true)
    expect(openAt("/", undefined, { member: false })).toBe(false)
    // A demo link, a sign-in error or a form to pick: the sign-in page's own business.
    expect(openAt("/?start_demo=1", undefined, { member: true })).toBe(false)
    expect(openAt("/?error=oidc_invalid_state", undefined, { member: true })).toBe(false)
    expect(openAt("/?tab=directory", undefined, { member: true })).toBe(false)
    expect(openAt("/signup", undefined, { member: true })).toBe(false)
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

  // The browser's bar showed the light frame over a dark app until the app's
  // code ran: a light band at the top of every dark start on a phone. It is
  // the splash's own ground from the first paint, in the mode the person
  // chose (next-themes has set it on <html> by now), whatever the system's is.
  it("gives the browser's bar the splash's ground before any code runs", () => {
    const at = (width: number, dark: boolean) => {
      vi.stubGlobal("innerWidth", width)
      document.documentElement.classList.toggle("dark", dark)
      openAt("/app/home")
      vi.unstubAllGlobals()
      return [...new Set(metas().map((m) => m.content))]
    }
    expect(at(390, true)).toEqual([GROUND.dark.phone])
    expect(at(390, false)).toEqual([GROUND.light.phone])
    expect(at(1440, true)).toEqual([GROUND.dark.wide])
    expect(at(1440, false)).toEqual([GROUND.light.wide])
  })

  it("leaves the browser's bar alone where it shows no splash", () => {
    openAt("/signup")
    expect([...new Set(metas().map((m) => m.content))]).toEqual(["#000000"])
  })

  it("is hidden unless the document is marked", () => {
    expect(APP_BOOT_CSS).toContain(".app-boot{display:none}")
    expect(APP_BOOT_CSS).toContain(`html[${APP_BOOT_ATTR}] .app-boot{display:flex}`)
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

describe("the splash from the first paint to the app", () => {
  it("is held by the app while it asks who is signed in, then cross-fades out and goes", () => {
    vi.useFakeTimers()
    openAt("/app/home")
    expect(appBootState()).toBe("")
    expect(holdAppBoot()).toBe(true)
    expect(appBootState()).toBe("held")
    expect(appBootShowing()).toBe(true)
    leaveAppBoot()
    // Still on screen while it fades over the app, and no longer "showing".
    expect(appBootState()).toBe("leaving")
    expect(appBootShowing()).toBe(false)
    vi.advanceTimersByTime(APP_BOOT_LEAVE_MS)
    expect(appBootState()).toBeNull()
    expect(screenEl.hidden).toBe(true)
  })

  // An app opened from the sign-in page (signed in there, or the demo
  // starting): there was no splash at its first paint, so the app puts the
  // same one up, playing; from the demo's own screen it comes in settled, so
  // the orbit and the ring stay as they were.
  it("is put up again for an app opened from the sign-in page", () => {
    openAt("/")
    expect(appBootState()).toBeNull()
    screenEl.setAttribute("hidden", "")
    expect(holdAppBoot()).toBe(true)
    expect(appBootState()).toBe("held")
    expect(screenEl.hidden).toBe(false)
    expect(screenEl.getAttribute("role")).toBe("status")
    expect(screenEl.hasAttribute("data-settled")).toBe(false)
    endAppBoot()
    expect(holdAppBoot({ settled: true })).toBe(true)
    expect(screenEl.hasAttribute("data-settled")).toBe(true)
  })

  it("can't be held where the layout has no static splash: the caller draws its own", () => {
    screenEl.remove()
    expect(holdAppBoot()).toBe(false)
    expect(appBootState()).toBeNull()
  })

  it("says it is slow, and stops saying so", () => {
    openAt("/app/home")
    holdAppBoot()
    slowAppBoot(true)
    expect(appBootState()).toBe("slow")
    slowAppBoot(false)
    expect(appBootState()).toBe("held")
  })

  it("comes back if it is held again while it fades", () => {
    vi.useFakeTimers()
    openAt("/app/home")
    holdAppBoot()
    leaveAppBoot()
    holdAppBoot()
    vi.advanceTimersByTime(APP_BOOT_LEAVE_MS * 2)
    expect(appBootState()).toBe("held")
  })

  // The start page's splash is the sign-in page's to take over. If nothing
  // does (its code failed), it goes by itself rather than covering the page.
  it("goes by itself from the start page if nothing takes it, and never from under the app", () => {
    vi.useFakeTimers()
    openAt("/", undefined, { member: true })
    vi.advanceTimersByTime(ROOT_UNCLAIMED_MS)
    expect(appBootState()).toBeNull()
    openAt("/", undefined, { member: true })
    holdAppBoot()
    vi.advanceTimersByTime(ROOT_UNCLAIMED_MS)
    expect(appBootState()).toBe("held")
  })

  // QA DSA-33 (14 Oct 2026): the static screen's role=status "Opening …"
  // stayed in the app's page after it took over.
  it("stops being a live region once it has gone", () => {
    screenEl.setAttribute("role", "status")
    screenEl.setAttribute("aria-live", "polite")
    openAt("/app/home")
    endAppBoot()
    expect(screenEl.hasAttribute("role")).toBe(false)
    expect(screenEl.hasAttribute("aria-live")).toBe(false)
    expect(screenEl.hidden).toBe(true)
    expect(document.querySelector("[role=status]")).toBeNull()
  })
})

describe("a browser a member has used", () => {
  it("is remembered when the app has a member, and forgotten when the session ends", () => {
    rememberMember()
    expect(localStorage.getItem(MEMBER_KEY)).toBe("1")
    forgetMember()
    expect(localStorage.getItem(MEMBER_KEY)).toBeNull()
  })
})
