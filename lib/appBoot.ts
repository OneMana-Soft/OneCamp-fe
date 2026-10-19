// The app's frame and splash from the very first paint (design v3, shell §L1).
//
// WHY. The providers above every page wait for the stored state before they
// draw anything (PersistGate), so the server sends no markup for an app page.
// A cold open of /app/... was a blank white page until the code had loaded
// and run, then the graphite frame with the ring, then the shell: white,
// grey, white. On a 10 Mb/s line the white lasted about seven seconds.
//
// HOW. The root layout carries a static copy of the app's splash, hidden by
// default, and
// this script runs right after it, before anything is drawn. On an app
// address it marks the document, so the splash shows from the first paint,
// and gives the splash the stored theme colour's class, so its glow is the
// person's theme and not the house orange until the code runs. (On <html>
// the class lost to :root's own --glow, later in the cascade at the same
// specificity.)
//
// ONE SPLASH, FIRST PAINT TO APP (17 Oct 2026). The app used to take over
// with a copy of its own, which drew the ring again or snapped it shut, then
// dropped it for a skeleton on a reload, then faded the shell up from the
// page's own colour. Now this one element is the splash until the app is
// there, in states written on <html>:
//   ""        shown by the script at the first paint, nobody has it yet;
//   "held"    the app has it, while it asks who is signed in;
//   "slow"    the same, saying it is still connecting, with Try again;
//   "leaving" fading out over the app, which is drawn under it.
// The app puts it up itself when it was opened from the sign-in page (there
// was no splash at that page's first paint). Its motion is CSS on its own
// elements, so a hand-over never restarts or jumps it.
//
// The start page too, bare, in a browser a member has used: the installed
// app and the desktop app open there, and a member saw a blank page, then
// the sign-in page's placeholder, then the splash. The sign-in page takes it
// over: the app follows if somebody is signed in, and it fades if not.

import { WORKSPACE_NAME_MAX, WORKSPACE_NAME_STORE_KEY } from "@/lib/workspaceName"
import { GROUND, PHONE_MAX_PX } from "@/lib/pwa/grounds"

/** The attribute on <html> that shows the static splash; its value is the state. */
export const APP_BOOT_ATTR = "data-app-boot"

/** The colour themes a stored choice may name (activeTheme.tsx's list; app/themes.css has each). */
const THEMES = ["onecamp", "blue", "green", "amber", "rose", "violet", "teal", "orange", "slate", "zinc", "stone"]

/** The static splash's own mark, for the script to find it. */
export const APP_BOOT_SCREEN_ATTR = "data-app-boot-screen"

/** Where the static splash says the workspace's name, for the script to fill. */
export const APP_BOOT_NAME_ATTR = "data-app-boot-name"

/** The static splash's Try again, shown while it is slow; the app answers it. */
export const APP_BOOT_RETRY_ATTR = "data-app-boot-retry"

/** Set while a member uses the app in this browser; gone when the session ends (every sign-out clears storage). */
export const MEMBER_KEY = "onecamp:member"

/** How long the splash takes to fade over the app (globals.css: 220 ms), and a frame to spare. */
export const APP_BOOT_LEAVE_MS = 240

/** The start page's splash goes by itself if nothing has taken it by then. */
export const ROOT_UNCLAIMED_MS = 15_000

export type AppBootState = "" | "held" | "slow" | "leaving"

const T = JSON.stringify

/**
 * Runs right after the static splash in the body; must not throw, and must
 * not depend on anything loaded. Besides the theme, it says the workspace's
 * name as the server gave it last time in this browser
 * (hooks/useWorkspaceName keeps it), as text: the markup has only the
 * build's, and a self-hosted workspace renamed on its server would open as
 * its old name (design review PG1-01). And it gives the browser's bar the
 * splash's own ground (lib/pwa/grounds), in the mode next-themes has just set
 * on <html>: the bar showed the light frame over a dark app until the app's
 * code ran.
 */
export const APP_BOOT_SCRIPT = `(function(){try{var d=document,h=d.documentElement,l=location,p=l.pathname,t=null,n=null,m=null;try{t=localStorage.getItem("onecamp-theme-color");n=localStorage.getItem(${T(WORKSPACE_NAME_STORE_KEY)});m=localStorage.getItem(${T(MEMBER_KEY)})}catch(e){}var r=p==="/"&&!l.search&&m==="1";if(p!=="/app"&&p.indexOf("/app/")!==0&&!r)return;h.setAttribute(${T(APP_BOOT_ATTR)},"");var s=d.querySelector("[${APP_BOOT_SCREEN_ATTR}]");if(s&&${T(THEMES)}.indexOf(t)>-1)s.classList.add("theme-"+t);var e=s&&s.querySelector("[${APP_BOOT_NAME_ATTR}]");if(e&&n)e.textContent=n.slice(0,${WORKSPACE_NAME_MAX});var k=h.classList.contains("dark"),c=innerWidth<=${PHONE_MAX_PX}?(k?${T(GROUND.dark.phone)}:${T(GROUND.light.phone)}):(k?${T(GROUND.dark.wide)}:${T(GROUND.light.wide)});d.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.setAttribute("content",c)});if(r)setTimeout(function(){if(h.getAttribute(${T(APP_BOOT_ATTR)})==="")h.removeAttribute(${T(APP_BOOT_ATTR)})},${ROOT_UNCLAIMED_MS})}catch(e){}})();`

/** Shows the static splash only when the document is marked. A rule of its own, so it needs nothing else to have loaded. */
export const APP_BOOT_CSS = `.app-boot{display:none}html[${APP_BOOT_ATTR}] .app-boot{display:flex}`

const root = (): HTMLElement | null => (typeof document === "undefined" ? null : document.documentElement)
const bootScreen = (): HTMLElement | null =>
  typeof document === "undefined" ? null : document.querySelector<HTMLElement>(`.app-boot[${APP_BOOT_SCREEN_ATTR}]`)

/** The static splash's state, or null when it is not on screen. */
export function appBootState(): AppBootState | null {
  try {
    const value = root()?.getAttribute(APP_BOOT_ATTR)
    return value === null || value === undefined ? null : (value as AppBootState)
  } catch {
    return null
  }
}

/** Whether the static splash is on screen and not on its way out. */
export function appBootShowing(): boolean {
  const state = appBootState()
  return state !== null && state !== "leaving"
}

/** Whether the layout has a static splash to hold (the root layout always draws one). */
export function hasAppBoot(): boolean {
  return !!bootScreen()
}

let leaveTimer: ReturnType<typeof setTimeout> | undefined

/**
 * The app has the splash while it asks who is signed in. If it is not on
 * screen (the app was opened from the sign-in page), it is put up, in the
 * theme and with the name the first paint's script would have given it; it
 * plays its arrival, or comes in `settled` over a screen that already showed
 * the scene (the demo's start). False when the layout has no static splash:
 * the caller draws its own.
 */
export function holdAppBoot({ settled = false }: { settled?: boolean } = {}): boolean {
  try {
    const screen = bootScreen()
    const html = root()
    if (!screen || !html) return false
    clearTimeout(leaveTimer)
    if (!html.hasAttribute(APP_BOOT_ATTR)) {
      screen.removeAttribute("hidden")
      screen.setAttribute("role", "status")
      screen.setAttribute("aria-live", "polite")
      screen.toggleAttribute("data-settled", settled)
      try {
        const name = localStorage.getItem(WORKSPACE_NAME_STORE_KEY)
        const slot = screen.querySelector(`[${APP_BOOT_NAME_ATTR}]`)
        if (slot && name) slot.textContent = name.slice(0, WORKSPACE_NAME_MAX)
      } catch {
        /* the build's name stays */
      }
    }
    if (appBootState() !== "slow") html.setAttribute(APP_BOOT_ATTR, "held")
    return true
  } catch {
    return false
  }
}

/** The held splash says it is still connecting (with Try again), or stops saying so. */
export function slowAppBoot(slow: boolean): void {
  const state = appBootState()
  if (state === "held" || state === "slow") root()?.setAttribute(APP_BOOT_ATTR, slow ? "slow" : "held")
}

/**
 * The page under the splash is ready: it fades out over it (globals.css),
 * wherever its motion has got to, and goes. Nothing waits for it.
 */
export function leaveAppBoot(): void {
  const html = root()
  const state = appBootState()
  if (!html || state === null || state === "leaving") return
  html.setAttribute(APP_BOOT_ATTR, "leaving")
  clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => {
    if (appBootState() === "leaving") endAppBoot()
  }, APP_BOOT_LEAVE_MS)
}

/**
 * The static splash goes at once, and is no longer a live region (QA DSA-33:
 * its role=status "Opening …" stayed in the app's page). It stays in the
 * document, hidden: React drew it, and a node taken out from under React
 * breaks the next change it makes there.
 */
export function endAppBoot(): void {
  try {
    clearTimeout(leaveTimer)
    root()?.removeAttribute(APP_BOOT_ATTR)
    const screen = bootScreen() ?? document.querySelector(`[${APP_BOOT_SCREEN_ATTR}]`)
    screen?.removeAttribute("data-settled")
    retireStaticScreen(screen)
  } catch {
    /* nothing to remove */
  }
}

/** A first-paint screen that has handed over: hidden, and saying nothing more. */
export function retireStaticScreen(el: Element | null): void {
  if (!el) return
  el.removeAttribute("role")
  el.removeAttribute("aria-live")
  el.setAttribute("hidden", "")
}

/** A member uses the app in this browser: its start page opens on the splash from now on. */
export function rememberMember(): void {
  try {
    localStorage.setItem(MEMBER_KEY, "1")
  } catch {
    /* private mode: the start page opens as a stranger's */
  }
}

/** Nobody is signed in here after all: the start page is the sign-in page again. */
export function forgetMember(): void {
  try {
    localStorage.removeItem(MEMBER_KEY)
  } catch {
    /* nothing kept */
  }
}
