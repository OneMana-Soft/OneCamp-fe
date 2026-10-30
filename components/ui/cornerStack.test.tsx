import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { CornerCard } from "./CornerStack"

/**
 * The bottom corners have one owner (design v3, shell T4). Floating cards
 * each did their own offset maths: the demo prompt moved by a guessed 30vw
 * when the right panel opened and sat on its composer, the PWA prompt was on
 * the devtools layer over every dialog, the timer sat on a composer, and the
 * first demo prompt shipped behind the phone's drawer with a raw z-50.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
/** Comments explain the old bugs and so name them; only code counts. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const CARDS = [
  "components/onboarding/KeyboardTip.tsx",
  "components/time/RunningTimerChip.tsx",
  "components/pwa/PwaInstallPrompt.tsx",
  "components/command/GlobalCommandHost.tsx",
]

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

afterEach(() => {
  cleanup()
  document.querySelectorAll("[data-corner-stack]").forEach((n) => n.remove())
})

describe("the corner cards", () => {
  it.each(CARDS)("%s is placed by the corner stack, not by itself", (file) => {
    const src = code(read(file))
    expect(src).toMatch(/<CornerCard\b/)
    expect(src, "a fixed position of its own").not.toMatch(/["'`\s]fixed\s/)
    expect(src, "a bottom offset of its own").not.toMatch(/\b(md:)?bottom-(\d|\[)/)
    expect(src, "a raw z-index").not.toMatch(/\bz-\d+\b/)
  })

  it("leaves nothing offset by a guessed share of the window beside the right panel", () => {
    const bad = ["app", "components"].flatMap((d) => sources(d)).filter((f) => /right-\[calc\([^\]]*vw/.test(code(read(f))))
    expect(bad).toEqual([])
  })

  it("keeps the devtools layer for devtools", () => {
    const bad = ["app", "components"]
      .flatMap((d) => sources(d))
      .filter((f) => !/devtools/i.test(f) && /z-\[var\(--z-devtools\)\]/.test(code(read(f))))
      .map((f) => relative(ROOT, join(ROOT, f)))
    expect(bad).toEqual([])
  })
})

describe("the corner stack", () => {
  it("draws a card in its side's host, nearest the bottom by order", async () => {
    render(
      <>
        <CornerCard side="left" order={1}>
          <p>tip</p>
        </CornerCard>
        <CornerCard side="right">
          <p>prompt</p>
        </CornerCard>
      </>,
    )
    await act(async () => {})
    const left = document.querySelector('[data-corner-stack="left"]')!
    const right = document.querySelector('[data-corner-stack="right"]')!
    expect(left.textContent).toBe("tip")
    expect(right.textContent).toBe("prompt")
    expect((left.firstElementChild as HTMLElement).style.order).toBe("1")
    expect(left.className).toContain("corner-stack-left")
  })

  it("sits 16px inside the sheet's edges, 8px between cards, on the corner layer", () => {
    const css = read("app/globals.css")
    const at = css.indexOf(".corner-stack {")
    const block = css.slice(at, css.indexOf("@keyframes corner-in", at))
    expect(block).toMatch(/z-index:\s*var\(--z-corner\)/)
    expect(block).toMatch(/gap:\s*8px/)
    expect(block).toMatch(/left:\s*calc\(var\(--shell-left-inset, 0px\) \+ 16px\)/)
    expect(block).toMatch(/right:\s*calc\(var\(--shell-right-inset, 8px\) \+ 16px\)/)
    // Above the phone's tab bar and its home indicator, or 8px over the foot a page publishes (V-68).
    expect(block).toMatch(/bottom:\s*max\(calc\(4rem \+ env\(safe-area-inset-bottom\) \+ 8\.5rem\),\s*calc\(var\(--mobile-drawer-h, 0px\) \+ 8px\)\)/)
  })

  it("puts the corner cards over the page and under anything opened on it", () => {
    // On the toast layer, the demo prompt covered the lower half of a
    // message's More menu: Edit and Delete couldn't be clicked (QA F-03).
    const css = read("app/globals.css")
    const z = (name: string) => Number(css.match(new RegExp(`--z-${name}:\\s*(\\d+)`))![1])
    // Over the tab bar, the composer and the right panel over the page (fixed + 1).
    expect(z("corner")).toBeGreaterThan(z("fixed") + 1)
    // Under a dialog's scrim, so a modal covers the cards it would otherwise leave clickable.
    for (const above of ["modal", "popover", "dropdown", "tooltip", "toast"]) {
      expect(z("corner"), above).toBeLessThan(z(above))
    }
  })

  it("puts the toasts above whatever the right corner holds", () => {
    // Above the corner, or above a call's dock while one is on screen (max() with --call-dock-floor).
    expect(read("components/ui/toast.tsx")).toContain("sm:bottom-[max(calc(1.5rem+var(--corner-right-h,0px)),var(--call-dock-floor,0px))]")
    expect(read("components/ui/CornerStack.tsx")).toContain("--corner-right-h")
  })

  it("goes under the keyboard while it is up, as the tab bar does, whatever the page (V-68)", () => {
    // Over a foot that sits on the keyboard (a doc's Formatting bar, a task's comment box) a risen
    // card covered the line being typed. One rule on the shell's keyboard signal (lib/ui/visualViewport)
    // hides the stack for every card on every page, so no page needs a rule of its own, and the
    // cards come back when the signal goes.
    const css = code(read("app/globals.css"))
    const hidden = /\{\s*visibility:\s*hidden;?\s*\}/.source
    expect(css).toMatch(new RegExp(`html\\[data-keyboard="open"\\] \\[data-app-viewport\\] nav\\[aria-label="Primary"\\]\\s*${hidden}`))
    const onKeyboard = (css.match(/[^{};]*\.corner-stack[^{]*\{[^}]*\}/g) ?? []).filter((rule) => rule.includes("data-keyboard"))
    expect(onKeyboard).toHaveLength(1)
    expect(onKeyboard[0].trim()).toMatch(new RegExp(`^html\\[data-keyboard="open"\\] \\.corner-stack\\s*${hidden}$`))
  })
})
