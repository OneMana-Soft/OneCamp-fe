import { firebaseConfig, isFirebaseConfigured } from "@/lib/push/firebaseConfig"

/**
 * The app's side of its one service worker (public/sw.js, asana-12): web push
 * and the app's pages and files on this device, in one scope, so OneCamp
 * opens from a cold start with no network.
 *
 * Only chunks loaded after the page call this: lib/firebase (push) and
 * components/offline/OfflineLoader (when the Offline Store opens for the
 * member). lib/offline/wipe lets the kept pages go when a session ends.
 */

/**
 * The pages the worker keeps (public/sw.js PAGES_CACHE): one cache per member,
 * named by pagesOf, so a member's pages are never another member's.
 */
export const PAGES_CACHE = "onecamp-sw-pages-v1"
export const pagesOf = (member: string): string => `${PAGES_CACHE}:${encodeURIComponent(member)}`
const isPages = (name: string): boolean => name === PAGES_CACHE || name.startsWith(`${PAGES_CACHE}:`)

const KEEP = "onecamp-sw:keep"
const FORGET = "onecamp-sw:forget"

// Files named by their hash or their version: the same at every address that loads them.
const KEPT_FILE = /^\/(_next\/static|fonts)\//

const hasWorkers = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker

/**
 * The worker's address: ONE for push and for the app on the device, so
 * neither registration swaps the other's script. Push's config rides in it
 * when this install has push, as it did for the push worker.
 */
export function workerUrl(): string {
  if (!isFirebaseConfigured) return "/sw.js"
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || "",
    authDomain: firebaseConfig.authDomain || "",
    projectId: firebaseConfig.projectId || "",
    storageBucket: firebaseConfig.storageBucket || "",
    messagingSenderId: firebaseConfig.messagingSenderId || "",
    appId: firebaseConfig.appId || "",
  })
  return `/sw.js?${params.toString()}`
}

/**
 * Registers the one worker at the root. Its script is checked against the
 * server on every update, never a cached copy. Undefined where the browser
 * has no service workers (the desktop app's webview on some systems).
 */
export async function registerAppWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!hasWorkers()) return undefined
  return navigator.serviceWorker.register(workerUrl(), { scope: "/", updateViaCache: "none" })
}

/**
 * Tells the worker which member is signed in (their pages are kept apart, and
 * another member's go), and names what this page loaded before the worker took
 * over (the page itself and this origin's hashed files), so the next cold
 * start finds them on the device.
 */
export async function keepWhatLoaded(member: string): Promise<void> {
  if (!hasWorkers() || !member) return
  const registration = await navigator.serviceWorker.ready
  const worker = registration.active
  if (!worker) return
  const origin = window.location.origin
  const files: string[] = []
  for (const entry of performance.getEntriesByType("resource")) {
    try {
      const url = new URL(entry.name)
      if (url.origin === origin && KEPT_FILE.test(url.pathname)) files.push(entry.name)
    } catch {
      // Not an address: nothing to keep.
    }
  }
  worker.postMessage({ type: KEEP, member, urls: [window.location.href, ...files] })
}

/**
 * Lets every member's kept pages go: the session has ended. Works with or
 * without a worker running. The page's own worker hears it, and so does the
 * one running the site when that isn't this page's own (a hard reload loads a
 * page past the worker), once each, so no worker keeps a page under the
 * member who left.
 */
export async function forgetKeptPages(): Promise<void> {
  if (hasWorkers()) {
    const own = navigator.serviceWorker.controller
    sayForget(own)
    try {
      const running = (await navigator.serviceWorker.getRegistration())?.active
      if (running !== own) sayForget(running)
    } catch {
      // No registration to ask (storage blocked): the cache below still goes.
    }
  }
  const store = typeof window !== "undefined" ? window.caches : undefined
  if (!store) return
  try {
    const names = await store.keys()
    await Promise.all(names.filter(isPages).map((name) => store.delete(name)))
  } catch {
    // Storage unavailable: nothing was kept there either.
  }
}

function sayForget(worker: ServiceWorker | null | undefined): void {
  try {
    worker?.postMessage({ type: FORGET })
  } catch {
    // The worker is going away; the cache still goes.
  }
}
