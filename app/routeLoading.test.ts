import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The shell never unloads on navigation (design v3, shell §L2). Every route
 * under /app draws its own skeleton inside the sheet while it loads, from a
 * loading.tsx, so a route change never blanks the page or shows a centred
 * spinner. A route that should not have one is listed here with its reason.
 */
const APP = join(process.cwd(), "app/app")

const WITHOUT_LOADING: Record<string, string> = {
  // A call is bare (no frame, no sheet): it draws its own pre-join screen.
  meet: "a call has no sheet to draw a skeleton in",
  // Development-only showcase pages.
  "(showcase)": "development only",
  // Any /app address no route answers: it renders the 404 at once.
  "[...missing]": "draws the 404 straight away",
}

function hasPage(dir: string): boolean {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (e === "page.tsx") return true
    if (statSync(p).isDirectory() && hasPage(p)) return true
  }
  return false
}

const routes = readdirSync(APP).filter((d) => statSync(join(APP, d)).isDirectory() && hasPage(join(APP, d)))

describe("route loading", () => {
  it("found the routes", () => {
    expect(routes).toContain("home")
    expect(routes).toContain("channel")
  })

  it.each(routes)("/app/%s draws a skeleton in the sheet while it loads, or says why not", (route) => {
    if (WITHOUT_LOADING[route]) return
    const file = join(APP, route, "loading.tsx")
    expect(existsSync(file), `app/app/${route}/loading.tsx is missing`).toBe(true)
    const src = readFileSync(file, "utf8")
    expect(src).toMatch(/SheetSkeleton/)
    expect(src).not.toMatch(/Loader2|LoadingStateCircle|animate-spin/)
  })
})

/**
 * No page-centred spinner (shell §L2): LoadingStateCircle at lg or xl, and a
 * 40px spinning Loader2, belong nowhere outside buttons. The files that still
 * have one are counted; the counts may only go down.
 */
const SPINNER = /LoadingStateCircle[^>]*size=["'](lg|xl)["']|Loader2[^>]*(size-10|h-10 w-10)/g
const SPINNER_BASELINE: Record<string, number> = {
  // The lightbox's spinner over a photo that is still arriving, on the black
  // viewer: the image's own placeholder, not a page. The viewer's to replace.
  "components/dialog/attachmentLightboxDialog.tsx": 1,
}

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe("no page-centred spinner", () => {
  it("has no large spinner outside buttons, past the counted files", () => {
    const over: string[] = []
    for (const file of ["app", "components"].flatMap((d) => sources(join(process.cwd(), d)))) {
      const rel = file.slice(process.cwd().length + 1)
      if (rel.startsWith("components/ui/button")) continue
      const n = (readFileSync(file, "utf8").match(SPINNER) ?? []).length
      if (n > (SPINNER_BASELINE[rel] ?? 0)) over.push(`${rel}: ${n}`)
    }
    expect(over).toEqual([])
  })
})
