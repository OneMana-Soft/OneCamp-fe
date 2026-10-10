import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
/**
 * Hand-written uppercase section labels may only decrease.
 *
 * "Sources" above a citation list, "Automation" above a template category, the
 * weekday letters in a calendar header, a field label in a profile panel — one
 * idea, written out 53 times across 26 files at FIVE sizes (text-xs,
 * text-[10px], text-[11px], text-2xs, and one with none) and FOUR weights
 * (semibold 37, medium 11, bold 1, none 4).
 *
 * None of that shows in a single screenshot. All of it shows when you move
 * between screens, and it is most of what "doesn't feel designed" means in
 * practice. components/ui/eyebrow.tsx is now the one place that decides, with the
 * class exported separately for the FormLabel cases that cannot be swapped for a
 * span.
 *
 * It was a ratchet rather than a hard zero at first, for the same reason as the type-scale one:
 * the remaining sites differ in element type, in whether they carry layout
 * classes, and in whether the weight change is visible against their background,
 * so each is a small judgement rather than a rename. The count may fall freely
 * and any rise fails, which is enough to stop the population growing while it
 * drains.
 */
const root = resolve(__dirname, "..")
/** An uppercase label written by hand, in either class order. */
const HAND_WRITTEN =
  /className="[^"]*(?:uppercase[^"]*tracking-(?:wider|widest|\[[^\]"]+\])|tracking-(?:wider|widest|\[[^\]"]+\])[^"]*uppercase)[^"]*"/g
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}
const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]
describe("uppercase section labels come from one place", () => {
  it("exposes both a component and a class, since some labels cannot be a span", () => {
    const src = readFileSync(resolve(root, "components/ui/eyebrow.tsx"), "utf8")
    expect(src).toMatch(/export function Eyebrow/)
    // FormLabel carries form wiring (htmlFor, error state), so those consume the
    // class. Without it they would become a second population that drifts alone.
    expect(src).toMatch(/export const eyebrowClass/)
    // One weight, deliberately not a prop — weight is what drifted worst.
    expect(src).toMatch(/font-medium/)
    expect(src, "weight must not be configurable").not.toMatch(/weight\?:/)
  })

  it("has no hand-written uppercase labels", () => {
    // Was a ratchet from 53 labels at five sizes and four weights, down to 39; the
    // last 39 moved onto eyebrowClass on 29 Sep 2026, keeping only what each place
    // needs on top (its spacing, a smaller size, a destructive or accent colour).
    const holders: string[] = []
    for (const file of files) {
      const n = (readFileSync(file, "utf8").match(HAND_WRITTEN) || []).length
      if (n > 0) holders.push(`${file.slice(root.length + 1)} (${n})`)
    }
    expect(
      holders,
      "Hand-written uppercase labels. Use <Eyebrow> from components/ui/eyebrow.tsx, " +
        "or cn(eyebrowClass, …) when the element cannot be a span (FormLabel and friends).",
    ).toEqual([])
  })

  // The pattern above leaves out tracking-wide, which other areas still use.
  // Admin, settings, sign-in, guest and state pages have none, and keep none:
  // a label there is the Eyebrow, or quiet sentence case like the task panel's.
  it("has none at any tracking in admin, settings, sign-in, guest and state pages", () => {
    const AREA = [
      "components/admin", "app/app/admin", "app/app/settings", "components/profile", "components/auth",
      "components/guest", "app/guest", "components/onboarding", "components/error", "app/admin-setup",
      "app/signup", "app/reset-password", "app/forgot-password", "app/unsubscribe", "app/connect",
      "app/logout", "app/error",
    ]
    // The Eyebrow itself counts too: its uppercase lives in components/ui, so
    // "WHAT CAME ACROSS" under a Slack import passed a scan of class strings.
    const ANY_TRACKING = /className="[^"]*(?:uppercase[^"]*tracking-wide\b|tracking-wide\b[^"]*uppercase)[^"]*"|<Eyebrow\b|\beyebrowClass\b/g
    const holders: string[] = []
    for (const dir of AREA) {
      let inDir: string[] = []
      try {
        inDir = walk(resolve(root, dir))
      } catch {
        continue
      }
      for (const file of inDir) {
        const n = (readFileSync(file, "utf8").match(ANY_TRACKING) || []).length
        if (n > 0) holders.push(`${file.slice(root.length + 1)} (${n})`)
      }
    }
    for (const page of ["app/page.tsx", "app/not-found.tsx", "app/global-error.tsx"]) {
      const n = (readFileSync(resolve(root, page), "utf8").match(ANY_TRACKING) || []).length
      if (n > 0) holders.push(`${page} (${n})`)
    }
    expect(holders).toEqual([])
  })
})
