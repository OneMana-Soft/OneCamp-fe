import { readFileSync } from "node:fs"
import { act, cleanup, render } from "@testing-library/react"
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * One report per failure (owner's policy, 12 Oct 2026):
 *   - a read whose screen draws its own error state says it there only;
 *   - a toast is for something the person did (a write) and for a read that
 *     nothing on screen explains;
 *   - a refresh that fails under what is already shown says nothing.
 *
 * Members said a failed list in place and again in a toast, and so did every
 * card that drew ErrorState; a failed refresh in chat raised "Something went
 * wrong · internal error" over messages that were all there.
 *
 * The mechanism: lib/http/loadFailure (tellReadFailure, useSaysLoadFailure),
 * hooks/useFetch (refreshes and retries stay quiet) and the request
 * interceptor (a write at once, a read through tellReadFailure).
 */

const toasts: { title?: string; description?: string }[] = []
vi.mock("@/hooks/use-toast", () => ({
  toast: (t: { title?: string; description?: string }) => {
    toasts.push(t)
    return { id: String(toasts.length), dismiss: () => toasts.splice(toasts.indexOf(t), 1), update: () => undefined }
  },
  useToast: () => ({ toast: () => undefined, dismiss: () => undefined, toasts: [] }),
}))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { useFetch } = await import("@/hooks/useFetch")
const { READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")
const { ErrorState } = await import("@/components/ui/error-state")

/** The server, in memory: a path answers 200 with its body, or fails with a status and a message. */
let answers: Record<string, { status: number; data: unknown }> = {}
const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const path = String(config.url).replace(/^https?:\/\/[^/]+\/?/, "/").replace(/^\/?/, "/")
  const a = answers[path] ?? { status: 404, data: { msg: "nothing here" } }
  const response = { status: a.status, statusText: "", data: a.data, headers: {}, config }
  if (a.status < 400) return response
  throw new AxiosError(`Request failed with status code ${a.status}`, "ERR_BAD_RESPONSE", config, null, response)
}

const beat = () => act(() => new Promise((r) => setTimeout(r, READ_FAILURE_BEAT_MS + 150)))

function Screen({ url, drawsError }: { url: string; drawsError: boolean }) {
  const { data, isError, mutate } = useFetch<{ ok: boolean }>(url)
  ;(Screen as unknown as { retry: () => unknown }).retry = () => mutate()
  if (isError && drawsError) return <ErrorState subject="members" onRetry={() => void mutate()} />
  return <p>{data ? "loaded" : "…"}</p>
}

const show = (url: string, drawsError: boolean) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>
      <Screen url={url} drawsError={drawsError} />
    </SWRConfig>,
  )

beforeEach(() => {
  axiosInstance.defaults.adapter = adapter
  toasts.length = 0
  answers = {}
})
afterEach(cleanup)

describe("one report per failure", () => {
  it("says a failed read in place only, when the screen draws an error state", async () => {
    answers["/members"] = { status: 500, data: { msg: "members are being moved (a)" } }
    const view = show("/members", true)
    await beat()
    expect(view.getByText("Couldn't load members")).toBeTruthy()
    expect(toasts).toEqual([])
  })

  it("toasts a failed read that nothing on screen explains, once, in words written for people", async () => {
    answers["/sidebar"] = { status: 500, data: { msg: "internal error" } }
    show("/sidebar", false)
    await beat()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].description).not.toMatch(/internal error/)
    expect(toasts[0].description).toBe("The server hit a problem. Try again in a moment.")
    // SWR's retry of the same failed read stays quiet.
    await act(async () => {
      await (Screen as unknown as { retry: () => Promise<unknown> }).retry()
    })
    await beat()
    expect(toasts).toHaveLength(1)
  })

  it("says nothing when a refresh fails under what is already shown", async () => {
    answers["/channel"] = { status: 200, data: { ok: true } }
    const view = show("/channel", false)
    await beat()
    expect(view.getByText("loaded")).toBeTruthy()
    answers["/channel"] = { status: 500, data: { msg: "refresh failed (c)" } }
    await act(async () => {
      await (Screen as unknown as { retry: () => Promise<unknown> }).retry()
    })
    await beat()
    expect(view.getByText("loaded")).toBeTruthy()
    expect(toasts).toEqual([])
  })

  it("toasts a failed write at once: the person's own change must not vanish without a word", async () => {
    answers["/save"] = { status: 409, data: { msg: "Someone renamed this first (d)" } }
    await axiosInstance.post("/save", {}).catch(() => undefined)
    expect(toasts.map((t) => t.description)).toEqual(["Someone renamed this first (d)"])
  })

  // An error state says its own read, and no other: one on screen kept every
  // failed read quiet, a read made by hand for something else too, which
  // nothing on screen explained (REVIEW-FE-SHELL, 16 Oct 2026).
  it("keeps the read an error state says quiet, again when it fails again, and toasts a read made by hand for something else", async () => {
    answers["/members"] = { status: 500, data: { msg: "members are being moved (e)" } }
    const view = show("/members", true)
    await beat()
    expect(toasts).toEqual([])
    await axiosInstance.get("/members").catch(() => undefined)
    await beat()
    expect(toasts).toEqual([])
    answers["/export"] = { status: 500, data: { msg: "export is busy (e)" } }
    await axiosInstance.get("/export").catch(() => undefined)
    await beat()
    expect(toasts.map((t) => t.description)).toEqual(["export is busy (e)"])
    view.unmount()
  })
})

// --- The source: every error state says it is there, and nothing says a failure twice.

const sources = sourceFiles(["app", "components", "hooks", "lib", "services"], /\.tsx?$/)
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const read = (f: string) => code(readFileSync(f, "utf8"))

// The error states drawn in place of what failed to load.
const ERROR_STATES: Record<string, string> = {
  "components/ui/error-state.tsx": "ErrorState",
  "components/error/errorState.tsx": "ErrorState",
  "components/ui/settingsSection.tsx": "SettingsCardError",
  "components/activity/hubEmpty.tsx": "HubError",
  "components/ui/load-failure-state.tsx": "LoadFailureState",
  // A part that failed beside what loaded (calendar F2): one row, in the page's flow.
  "components/ui/load-failed-row.tsx": "LoadFailedRow",
}

// A load's failure in a screen's own words.
const SAYS_A_LOAD_FAILED = /Couldn(?:'|&apos;|’)t load|Could not load|Failed to load|Unable to load|(?:isn|aren)(?:'|&apos;|’)t loading/

// Files whose words say something else failed, not a read the app made.
const NOT_A_READ = new Map<string, string>([
  // An <img> that failed in the browser: no request of the app's raised a toast.
  ["components/minimal-tiptap/extensions/image/components/image-view-block.tsx", "an image element's own failure"],
  // Find a time: the server's answer names the Google calendars it couldn't read; the app's own read succeeded.
  ["components/calendar/findTimeSuggestions.tsx", "the server's own read of a Google calendar"],
  // A part whose code couldn't come (lib/lazy/lazyPart): a chunk the browser fetched, which raises no toast. Marked
  // as saying a read, it would take back a toast for a read that failed beside it, so that read went unsaid.
  ["components/ui/part-retry.tsx", "a part's code that couldn't come, not a read"],
])

// Files whose reads go through a service that makes them with OWN_ERRORS.
const QUIET_SERVICE = new Map<string, string>([["components/inbox/InboxPage.tsx", "services/inboxService.ts"]])

describe("every error state says it is there", () => {
  it("scans the whole app", () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("has each shared error state register itself while it is on screen", () => {
    for (const [f, name] of Object.entries(ERROR_STATES)) {
      const src = read(f)
      const body = src.slice(src.search(new RegExp(`export (function|const) ${name}\\b`)))
      expect(body.slice(0, 1600), `${f} ${name}`).toMatch(/useSaysLoadFailure\(/)
    }
  })

  it("draws a failed load through a shared error state, or says it there with useSaysLoadFailure or OWN_ERRORS", () => {
    const offenders: string[] = []
    for (const f of sources.filter((f) => f.endsWith(".tsx"))) {
      if (f in ERROR_STATES || NOT_A_READ.has(f)) continue
      const src = read(f)
      // The words a shared error state draws: ErrorState's subject, SettingsCardError's what, HubError's text, LoadFailedRow's words.
      const own = src.replace(/<(ErrorState|SettingsCardError|HubError|ConversationLoadError)\b[\s\S]*?\/>/g, "").replace(/<LoadFailedRow\b[\s\S]*?<\/LoadFailedRow>/g, "")
      if (!SAYS_A_LOAD_FAILED.test(own)) continue
      if (/useSaysLoadFailure\(|<SaysLoadFailure\b|OWN_ERRORS|suppressErrorToast/.test(src)) continue
      offenders.push(`${f}: says a load failed in its own words; draw ErrorState, or put <SaysLoadFailure /> beside the words, or make the read with OWN_ERRORS`)
    }
    expect(offenders).toEqual([])
  })

  it("never toasts a failed load over the read's own toast", () => {
    const offenders: string[] = []
    for (const f of sources) {
      const src = read(f)
      for (const m of src.matchAll(/toast\(\{[^}]*?title:\s*(["'`])((?:(?!\1).)*)\1/g)) {
        if (!SAYS_A_LOAD_FAILED.test(m[2])) continue
        const quiet = /OWN_ERRORS|suppressErrorToast/.test(QUIET_SERVICE.has(f) ? read(QUIET_SERVICE.get(f)!) : src)
        if (!quiet) offenders.push(`${f}: toasts "${m[2]}" for a read that raises its own; make that read with OWN_ERRORS`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("sends a failed read in the interceptor through the policy, and useFetch's reads through the hook", () => {
    const interceptor = read("lib/axiosInstance.ts")
    expect(interceptor).toMatch(/method === "get" \|\| method === "head"\) \{\s*tellReadFailure\(error\)/)
    const hook = read("hooks/useFetch.ts")
    expect(hook).toMatch(/suppressErrorToast: true/)
    expect(hook.match(/failure\.run\(/g)?.length).toBe(3)
  })
})
