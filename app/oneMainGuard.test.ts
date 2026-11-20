import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * One main landmark on every page, and the skip link's target (V-941).
 *
 * The app's shell holds the page: on a computer or a tablet beside the
 * sidebar, on a phone between its bars. Each frame draws the page's one
 * <main id="main-content">, so landmark navigation and the root layout's
 * "Skip to content" (href #main-content) find the page wherever it is, an
 * admins-only guard or a 404 too. A page inside the shell draws no <main> of
 * its own: it would be a second one, inside the first. Only what is drawn
 * without the shell draws its own.
 */
const ROOT = join(__dirname, "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

/** Screens drawn instead of the shell, each with the page's one main. */
const NO_SHELL = [
  "components/protectedRoute/appProtectedRoute.tsx",
  "components/error/GlobalErrorBoundary.tsx",
  "components/split/MeetingSplit.tsx",
]

/** The frames, and what is drawn before or instead of them. */
const FRAMES = new Set([
  "components/navigationBar/desktop/desktopNavigationBar.tsx",
  "components/navigationBar/mobile/mobileNavigationBar.tsx",
  // Signed out, and the public and guest pages: no shell.
  "components/auth/AuthShell.tsx",
  "components/guest/PublicFrame.tsx",
  "components/guest/guestUi.tsx",
  // Drawn instead of the shell (V-1013): the workspace that can't open, the
  // crash the app can't recover from, and a call's own page on a computer
  // (the frame around the call and its conversation).
  ...NO_SHELL,
  // The pages outside /app that draw their own frame (V-1045), and the page
  // drawn when the root layout itself fails.
  "app/f/[token]/page.tsx",
  "app/guest/b/[token]/embed/page.tsx",
  "app/guest/p/[token]/page.tsx",
  "app/invoice/[project]/page.tsx",
  "app/global-error.tsx",
])

/** A main that isn't the skip link's target. */
const BARE_MAIN = /<main\b(?![^>]*\bid="main-content")/

function sources(dir: string): string[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
    .map((f) => relative(ROOT, join(ROOT, dir, f)))
}

describe("one main landmark on every page", () => {
  it("is the computer's frame around the page, with the skip link's target", () => {
    expect(read("components/navigationBar/desktop/desktopNavigationBar.tsx")).toMatch(/<main id="main-content" className="[^"]*flex-1/)
  })

  it("is the phone's scroller, with the skip link's target", () => {
    expect(read("components/navigationBar/mobile/mobileNavigationBar.tsx")).toMatch(/<main id="main-content" ref=\{scrollerRef\} data-app-scroller=""/)
  })

  // V-1013: these three drew no main, so the skip link and landmark
  // navigation found nothing on them.
  it.each(NO_SHELL)("is drawn once by %s, with the skip link's target", (file) => {
    const mains = read(file).match(/<main[\s>][^>]*/g) ?? []
    expect(mains).toHaveLength(1)
    expect(mains[0]).toMatch(/^<main id="main-content"/)
  })

  // CODE-REVIEWER-325: a call's own page is framed as the shell is. Its main
  // is around the call and the conversation beside it, so focusing the
  // conversation, which hides the call's panel, never hides the main.
  it("is the call page's frame around the call and its conversation", () => {
    expect(read("components/split/MeetingSplit.tsx")).toMatch(/<main id="main-content"[^>]*>\s*<ResizablePanelGroup id="meet-panels"/)
  })

  it("is drawn by no page or part inside the shell", () => {
    const drawn = [...sources("app/app"), ...sources("components")].filter((f) => !FRAMES.has(f) && /<main[\s>]/.test(read(f)))
    expect(drawn).toEqual([])
  })

  it("is drawn outside the shell by a frame only", () => {
    const drawn = sources("app").filter((f) => !FRAMES.has(f) && /<main[\s>]/.test(read(f)))
    expect(drawn).toEqual([])
  })

  it("is the skip link's target in every frame", () => {
    const bare = [...FRAMES].filter((f) => !/<main[\s>]/.test(read(f)) || BARE_MAIN.test(read(f)))
    expect(bare).toEqual([])
  })
})
