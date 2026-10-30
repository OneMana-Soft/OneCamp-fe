/**
 * ONE list (V-100): the code each surface that promises to work offline needs, fetched while the browser is online,
 * when the page is idle. A surface joins from its own chunk with warmAhead(job): the task sheet (TaskInPlace) is the
 * first. Each job runs once a page's life. One that fails runs again after a growing wait (5 s, 30 s, 2 min: a weak
 * signal keeps the browser "online" and never says it is back), and whenever the browser is online again. The list says when
 * all it holds is on the device, as html[data-offline-ready]: "warm", or "warming" while any is still to come.
 *
 * Why: a phone that goes offline before its first press never fetched the sheet's code, so a task made offline
 * couldn't be opened ("Couldn't load the task"; the live walk, 30 Oct). A preload that waits for a press, or for a
 * quiet spell after one, comes too late for a phone that loses the network on the way.
 *
 * A leaf: it imports nothing, so no chunk that joins it reaches the shared core (LEAD-RULES, 30 Oct 00:13).
 */
export type WarmJob = () => Promise<unknown>

type State = "waiting" | "running" | "done"
const jobs = new Map<WarmJob, State>()
/** The waits before a job that failed while online runs again; after the last, only an online event runs it. */
const AGAIN_MS = [5_000, 30_000, 120_000]
const failures = new Map<WarmJob, number>()
const timers = new Set<number>()
let scheduled = false
let listening = false

function say() {
  const states = [...jobs.values()]
  document.documentElement.dataset.offlineReady = states.length > 0 && states.every((s) => s === "done") ? "warm" : "warming"
}

function run() {
  scheduled = false
  if (!navigator.onLine) return
  for (const [job, state] of jobs) {
    if (state !== "waiting") continue
    jobs.set(job, "running")
    job().then(
      () => jobs.set(job, "done"),
      () => {
        jobs.set(job, "waiting")
        const n = failures.get(job) ?? 0
        failures.set(job, n + 1)
        if (n < AGAIN_MS.length) {
          const t = window.setTimeout(() => {
            timers.delete(t)
            schedule()
          }, AGAIN_MS[n])
          timers.add(t)
        }
      },
    ).finally(say)
  }
  say()
}

/** The next idle moment while online: then every job still waiting runs. */
function schedule() {
  if (scheduled) return
  scheduled = true
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2_000 })
  else window.setTimeout(run, 200)
}

/** Joins the list: `job` fetches what a surface needs offline (its chunks, and the parts they fetch once in). */
export function warmAhead(job: WarmJob): void {
  if (typeof window === "undefined" || jobs.has(job)) return
  if (!listening) {
    listening = true
    window.addEventListener("online", schedule)
  }
  jobs.set(job, "waiting")
  say()
  schedule()
}

/** For tests: forget every job and what the page was told. */
export function resetWarmAhead() {
  jobs.clear()
  failures.clear()
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  scheduled = false
  delete document.documentElement.dataset.offlineReady
}
