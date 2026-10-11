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

  it("sits 16px inside the sheet's edges, 8px between cards, on the toast layer", () => {
    const css = read("app/globals.css")
    const at = css.indexOf(".corner-stack {")
    const block = css.slice(at, css.indexOf("@keyframes corner-in", at))
    expect(block).toMatch(/z-index:\s*var\(--z-toast\)/)
    expect(block).toMatch(/gap:\s*8px/)
    expect(block).toMatch(/left:\s*calc\(var\(--shell-left-inset, 0px\) \+ 16px\)/)
    expect(block).toMatch(/right:\s*calc\(var\(--shell-right-inset, 8px\) \+ 16px\)/)
    // Above the phone's tab bar and its home indicator.
    expect(block).toMatch(/bottom:\s*calc\(4rem \+ env\(safe-area-inset-bottom\)/)
    // The toast layer outranks a drawer, or a card hides behind an open sheet.
    const z = (name: string) => Number(css.match(new RegExp(`--z-${name}:\\s*(\\d+)`))![1])
    expect(z("toast")).toBeGreaterThan(z("modal"))
  })

  it("puts the toasts above whatever the right corner holds", () => {
    expect(read("components/ui/toast.tsx")).toContain("sm:bottom-[calc(1.5rem+var(--corner-right-h,0px))]")
    expect(read("components/ui/CornerStack.tsx")).toContain("--corner-right-h")
  })
})
