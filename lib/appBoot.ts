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
// specificity.) The app's own splash takes over with the ring already drawn
// (no second draw), and removes the mark.

import { WORKSPACE_NAME_MAX, WORKSPACE_NAME_STORE_KEY } from "@/lib/workspaceName"

/** The attribute on <html> that shows the static splash. */
export const APP_BOOT_ATTR = "data-app-boot"

/** The colour themes a stored choice may name (activeTheme.tsx's list; app/themes.css has each). */
const THEMES = ["onecamp", "blue", "green", "amber", "rose", "violet", "teal", "orange", "slate", "zinc", "stone"]

/** The static splash's own mark, for the script to find it. */
export const APP_BOOT_SCREEN_ATTR = "data-app-boot-screen"

/** Where the static splash says the workspace's name, for the script to fill. */
export const APP_BOOT_NAME_ATTR = "data-app-boot-name"

/**
 * Runs right after the static splash in the body; must not throw, and must
 * not depend on anything loaded. Besides the theme, it says the workspace's
 * name as the server gave it last time in this browser
 * (hooks/useWorkspaceName keeps it), as text: the markup has only the
 * build's, and a self-hosted workspace renamed on its server would open as
 * its old name (design review PG1-01).
 */
export const APP_BOOT_SCRIPT = `(function(){try{var p=location.pathname;if(p!=="/app"&&p.indexOf("/app/")!==0)return;document.documentElement.setAttribute(${JSON.stringify(APP_BOOT_ATTR)},"");var t=null,n=null;try{t=localStorage.getItem("onecamp-theme-color");n=localStorage.getItem(${JSON.stringify(WORKSPACE_NAME_STORE_KEY)})}catch(e){}var s=document.querySelector("[${APP_BOOT_SCREEN_ATTR}]");if(s&&${JSON.stringify(THEMES)}.indexOf(t)>-1)s.classList.add("theme-"+t);var m=s&&s.querySelector("[${APP_BOOT_NAME_ATTR}]");if(m&&n)m.textContent=n.slice(0,${WORKSPACE_NAME_MAX})}catch(e){}})();`

/** Shows the static splash only when the document is marked. A rule of its own, so it needs nothing else to have loaded. */
export const APP_BOOT_CSS = `.app-boot{display:none}html[${APP_BOOT_ATTR}] .app-boot{display:flex}`

/** Whether the static splash is on screen: read once, as the app first draws. */
export function appBootShowing(): boolean {
  try {
    return document.documentElement.hasAttribute(APP_BOOT_ATTR)
  } catch {
    return false
  }
}

/**
 * The app has drawn its own splash, skeleton or shell: the static one goes,
 * and is no longer a live region (QA DSA-33: its role=status "Opening …"
 * stayed in the app's page). It stays in the document, hidden: React drew it,
 * and a node taken out from under React breaks the next change it makes there.
 */
export function endAppBoot(): void {
  try {
    document.documentElement.removeAttribute(APP_BOOT_ATTR)
    retireStaticScreen(document.querySelector(`.app-boot[${APP_BOOT_SCREEN_ATTR}]`))
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
