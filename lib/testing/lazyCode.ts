import { beforeAll, expect } from "vitest"

// V-138: the ONE place a test waits for code. Every app import() is known here while it's in flight: vitest.config.ts
// compiles app source with lib/testing/trackImports, which hands each one to trackLoad (lazyChunk's loads, and so
// lazyPiece's and lazyPart's, included). Test-only: no app build reads either, so no route carries a byte of this. A
// cold import is its module graph's first transform, which a busy machine takes seconds to bring (gates at load
// 68-92), so:
// - a wait for what code draws never races the code that draws it (waitingOnCode, Testing Library's asyncWrapper in
//   vitest.setup.ts);
// - a file's own warm-ups run before its tests, never inside one test's 5 s (warmBeforeTests).
// Neither raises a timeout: a wait still gives the drawing its usual budget, and a test keeps its 5 s.

// The clocks as they were before any test faked them: code takes real time to come.
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout
const now = performance.now.bind(performance)
const pause = (ms: number) => new Promise<void>((resolve) => void realSetTimeout(resolve, ms))

/** The longest one wait waits for code that's coming, before its last try. */
export const CODE_WAIT_MS = 3_000
/** The longest a file's warm-ups may take on a busy machine: a hook's budget, never a test's. */
export const WARM_MS = 30_000

// For proofs only: LAZY_CODE_DELAY_MS=<ms> makes a module's first arrival in a file that much slower, as a busy
// machine's cold transform is (a module that has arrived comes at once after, as a cached one does: slowWhenCold);
// LAZY_CODE_WAIT=off and LAZY_CODE_WARM=off leave waits and warm-ups as they were, the controls; LAZY_CODE_TRACE=1
// names each load and the test it ran in, to find the code a test waits on.
const delay = Number(process.env.LAZY_CODE_DELAY_MS) || 0
export const waitsOnCode = process.env.LAZY_CODE_WAIT !== "off"
const warms = process.env.LAZY_CODE_WARM !== "off"
const trace = process.env.LAZY_CODE_TRACE === "1"

const inFlight = new Set<Promise<unknown>>()
let started = 0
let arrived = 0

/**
 * A load of code (an app import(), as lib/testing/trackImports hands it over), known while it's in flight. It only
 * watches: what it returns settles as the load does, with the same value or the same rejection, and a failed load
 * that nobody handles is still reported as one (a handler on the load itself would quietly take that report away).
 */
export function trackLoad<T>(load: () => Promise<T>): Promise<T> {
  if (trace) console.info(`[lazyCode] ${expect.getState().currentTestName ?? "(no test)"}: ${String(load).replace(/\s+/g, " ").slice(0, 160)}`)
  const loading = delay ? slowWhenCold(load) : load()
  started++
  inFlight.add(loading)
  const landed = () => {
    inFlight.delete(loading)
    arrived++
  }
  return loading.then(
    (code) => {
      landed()
      return code
    },
    (failure: unknown) => {
      landed()
      throw failure
    },
  )
}

// The knob's busy machine, per module: every import() of a module hands back the same namespace, so its first arrival
// in this file waits the delay (and so does every load that comes while it does), and a module that has arrived comes
// at once. A failed load, or code that isn't a module, is charged every time.
const arrivals = new WeakMap<object, Promise<void>>()
async function slowWhenCold<T>(load: () => Promise<T>): Promise<T> {
  let code: T
  try {
    code = await load()
  } catch (failure: unknown) {
    await pause(delay)
    throw failure
  }
  if (code === null || (typeof code !== "object" && typeof code !== "function")) {
    await pause(delay)
    return code
  }
  let arrival = arrivals.get(code)
  if (!arrival) arrivals.set(code, (arrival = pause(delay)))
  await arrival
  return code
}

/** How many loads this file has started: the transform's own tests count them. */
export const loadsStarted = () => started

// Where the transformed import()s find trackLoad, in every test environment (a node file runs app import()s too).
// vitest.setup.ts imports this module before anything from the app's tree, so it's here before any app module runs.
Object.assign(globalThis, { __trackLoad: trackLoad })

/** Waits while code is in flight (and for what it starts), up to `ms`; true when some of it arrived. */
async function codeArrives(ms: number): Promise<boolean> {
  const before = arrived
  const until = now() + ms
  while (inFlight.size > 0 && now() < until) {
    let stop: () => void = () => undefined
    const timeUp = new Promise<void>((resolve) => {
      const timer = realSetTimeout(resolve, until - now())
      stop = () => realClearTimeout(timer)
    })
    await Promise.race([Promise.allSettled([...inFlight]), timeUp])
    // The code won, or time is up: either way, no timer stays behind for seconds.
    stop()
    // What came is drawn, and may start the next piece's load.
    await pause(0)
  }
  return arrived > before
}

/**
 * Testing Library's wait (findBy, waitFor), told about code: a wait that fails while code was coming (it arrived
 * during the wait, or is still in flight) waits for that code, then tries ONCE more with its usual budget, and that
 * try's verdict stands. When no code came or is coming, or what's in flight doesn't arrive, the wait's own verdict
 * stands at once. So code that keeps coming (a poll that loads) holds a wait for one more try, never to the test's
 * timeout.
 */
export async function waitingOnCode<T>(attempt: () => Promise<T>): Promise<T> {
  const arrivedBefore = arrived
  try {
    return await attempt()
  } catch (error) {
    const cameDuring = arrived !== arrivedBefore
    if (!cameDuring && inFlight.size === 0) throw error
    if (!(await codeArrives(CODE_WAIT_MS)) && !cameDuring) throw error
    return attempt()
  }
}

/**
 * A file's warm-ups (import() of the code its tests draw): run once before its tests, in a hook with a busy machine's
 * budget, with whatever code they start, never inside a test's 5 s. They load as the app's own import()s do (the
 * knob charges and remembers them alike), so what they warmed costs a test nothing.
 */
export function warmBeforeTests(...loads: Array<() => Promise<unknown>>): void {
  if (!warms) return
  beforeAll(async () => {
    // One after another: vitest's mocker can't take concurrent import()s of mocked modules (a mocked module asked
    // for while another import resolves can come back as the real one, and stay in the file's cache as that).
    for (const load of loads) await trackLoad(load)
    await codeArrives(WARM_MS)
  }, WARM_MS * 2)
}
