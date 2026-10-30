import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { AppBootScreen, SplashScene } from "@/components/protectedRoute/Splash"
import { APP_BOOT_SCRIPT } from "@/lib/appBoot"

afterEach(cleanup)

// The splash (shell §L1; 17 Oct 2026, the owner: "make the initial splash
// screen for mobile and desktop look better", and "feel free to add some
// motion graphic"). One scene on every start screen: a halo of the theme's
// glow, two orbits, three hue dots and the logo's ring, which assembles from
// three arcs, closes with one ripple and is joined by the spark. The demo's
// start puts two of its people and its agent on the orbits (admin critic #21:
// never a lone ring).

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
/** The splash's rules, from its heading to the skeletons'. */
const splashCss = css.slice(css.indexOf("/* THE SPLASH (L1"), css.indexOf("/* SKELETONS (L2)"))
/** One @keyframes block's body. */
const keyframes = (name: string) => {
  const at = css.indexOf(`@keyframes ${name} {`)
  expect(at, `@keyframes ${name}`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = css.indexOf("{", at); i < css.length; i++) {
    if (css[i] === "{") depth++
    else if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1)
  }
  return css.slice(at)
}

describe("the splash's scene", () => {
  it("is the camp round the logo's ring: a halo, two orbits, three hue dots, the ring in three arcs, a ripple and one spark", () => {
    const { container } = render(<SplashScene />)
    const scene = container.querySelector("[data-splash-scene]")!
    expect(scene.getAttribute("aria-hidden")).toBe("true")
    expect(scene.querySelectorAll(".ss-halo")).toHaveLength(1)
    expect(scene.querySelectorAll(".ss-orbits circle")).toHaveLength(2)
    expect(scene.querySelectorAll(".ss-dots circle")).toHaveLength(3)
    expect(scene.querySelectorAll(".ss-arc")).toHaveLength(3)
    expect(scene.querySelectorAll(".ss-ring circle")).toHaveLength(1)
    expect(scene.querySelectorAll(".ss-ripple")).toHaveLength(1)
    expect(scene.querySelectorAll(".ss-spark path")).toHaveLength(1)
    // Nobody's face on a member's splash: the people are the demo's.
    expect(scene.querySelectorAll(".ss-face")).toHaveLength(0)
  })

  // Each arc is a third of the ring and a little more, so the three close
  // with no seam where they meet; each is drawn where it ends up, so its
  // gradient is the ring's own once it lands (only a transform moves it).
  it("closes the ring with its three arcs, overlapping a little, in the ring's own gradient", () => {
    const { container } = render(<SplashScene />)
    const arcs = [...container.querySelectorAll(".ss-arc circle")]
    const ring = container.querySelector(".ss-ring circle")!
    const starts: number[] = []
    for (const arc of arcs) {
      expect(arc.getAttribute("pathLength")).toBe("3")
      const [dash, gap] = arc.getAttribute("stroke-dasharray")!.split(" ").map(Number)
      expect(dash + gap).toBeCloseTo(3)
      expect(dash).toBeGreaterThan(1)
      expect(dash).toBeLessThan(1.1)
      expect(arc.getAttribute("stroke")).toBe(ring.getAttribute("stroke"))
      starts.push((((-Number(arc.getAttribute("stroke-dashoffset")) % 3) + 3) % 3))
    }
    // Starting a third apart, each overlapping the next.
    starts.sort((a, b) => a - b)
    expect(starts[1] - starts[0]).toBeCloseTo(1)
    expect(starts[2] - starts[1]).toBeCloseTo(1)
    // The gradient is defined in an SVG that is always drawn: Chrome paints
    // nothing from a gradient inside a hidden one, and the ring is hidden
    // while the arcs play.
    const id = ring.getAttribute("stroke")!.match(/^url\(#(.+)\)$/)![1]
    expect(container.querySelector(`.ss-orbits linearGradient#${id}`)).toBeTruthy()
  })

  it("gives every instance its own gradient, so two on one page never share a hidden one", () => {
    const { container } = render(
      <>
        <SplashScene />
        <SplashScene people />
      </>,
    )
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })
})

describe("the splash's motion", () => {
  // Everything that moves is its own element moved by transform and
  // opacity, which the compositor runs by itself: the scene stays smooth
  // while the app's code downloads and parses on the main thread. The ring
  // drawn by its dash offset repainted on the main thread.
  it("moves by transform and opacity alone", () => {
    for (const name of ["ss-in", "ss-orbits", "ss-arc", "ss-ripple", "ss-halo", "ss-breathe", "ss-orbit", "ss-spark", "ss-face", "ss-line"]) {
      const props = [...keyframes(name).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.filter((p) => p !== "opacity" && p !== "transform"), name).toEqual([])
    }
    expect(splashCss).not.toMatch(/stroke-dashoffset|ring-draw/)
  })

  // Chrome counts nothing at opacity 0 as painted, and a fade on the
  // compositor paints nothing new: starting from 0 put the first contentful
  // paint after the app's (1.9 s to 3.8 s on a phone).
  it("is contentful from its first frame: the orbits and the line start at 1%, not 0", () => {
    for (const name of ["ss-orbits", "ss-line"]) {
      const from = keyframes(name).match(/from \{ opacity: ([\d.]+);/)
      expect(Number(from?.[1]), name).toBeGreaterThan(0)
      expect(Number(from?.[1]), name).toBeLessThanOrEqual(0.02)
    }
  })

  it("plays only for people who haven't asked for less motion, and they get the whole scene, still", () => {
    const motion = splashCss.slice(splashCss.indexOf("@media (prefers-reduced-motion: no-preference)"))
    expect(motion).toMatch(/\.ss-arc \{[^}]*display: block;[^}]*animation: ss-arc /)
    // At rest (and under reduced motion): the ring, not the arcs; no ripple.
    const rest = splashCss.slice(0, splashCss.indexOf("@media (prefers-reduced-motion: no-preference)"))
    expect(rest).toMatch(/\.ss-arc \{[^}]*display: none;/)
    expect(rest).toMatch(/\.ss-ripple \{[^}]*opacity: 0;/)
    expect(rest).not.toMatch(/animation:/)
  })

  // A loop, if any, is slow and never a spinner: the halo breathes over
  // seconds and the dots take most of a minute to go round. The ring itself
  // never turns once it has landed.
  it("loops only slowly, and never turns the ring", () => {
    expect(splashCss).toMatch(/ss-breathe [5-9]s ease-in-out [^;]*infinite alternate/)
    expect(splashCss).toMatch(/ss-orbit [3-9]\ds linear infinite/)
    expect(splashCss).not.toMatch(/\.ss-(ring|arc)[^{]*\{[^}]*infinite/)
  })

  it("comes in settled where the scene was already on screen: the loops go on, nothing enters again", () => {
    // Every arrival long over, its last frame held (they all fill both ways),
    // while the loops carry on.
    expect(splashCss).toMatch(/\.splash\[data-settled\] \*,\s*\.splash\[data-settled\]::before,\s*\.splash\[data-settled\]::after \{ animation-delay: -9s; \}/)
    for (const intro of ["ss-orbits 760ms", "ss-arc 700ms", "ss-spark 520ms", "ss-line 420ms"]) {
      expect(splashCss, intro).toMatch(new RegExp(`${intro} [^;]* both;`))
    }
  })

  // When the app is ready the splash goes at once, mid-motion if need be: a
  // short cross-fade over the app, which is drawn under it, never a wait.
  it("hands over with a short cross-fade", () => {
    expect(splashCss).toMatch(/html\[data-app-boot="leaving"\] \.app-boot[^{]*\{[^}]*opacity: 0;[^}]*pointer-events: none;/)
    const fade = splashCss.match(/\.app-boot,\s*\.splash\[data-leaving\] \{[^}]*transition: opacity (\d+)ms/)
    expect(fade, "the fade").toBeTruthy()
    expect(Number(fade![1])).toBeLessThanOrEqual(240)
  })
})

describe("the splash's ground", () => {
  // The phone's app is the sheet edge to edge; from 640px it is the frame.
  // The splash is drawn on the one the app it hands over to is drawn on, so
  // the cross-fade changes the mark and nothing else.
  it("is the sheet on a phone, with the phone's glow and no grain, and the frame from 640px", () => {
    const phone = splashCss.slice(splashCss.indexOf("@media (max-width: 639.98px)"))
    expect(phone).toMatch(/\.splash\.app-frame \{ background: var\(--sheet\); \}/)
    expect(phone).toMatch(/\.splash\.app-frame::after \{ display: none; \}/)
    // Never a written-out colour: the ground follows the theme's mode.
    expect(splashCss).not.toMatch(/background(-color)?:\s*#[0-9a-f]{3,6}\b/i)
  })
})

describe("the splash's weight", () => {
  // Drawn into every page by the root layout, before any code: what it adds
  // to the first load stays a few hundred bytes. These ceilings were set at
  // their first measurement (17 Oct 2026) and only go down.
  it("keeps the first paint's splash and its script small", () => {
    const markup = renderToString(<AppBootScreen className="app-boot fixed inset-0" />)
    expect(gzipSync(markup).length, "the static splash's markup, gzipped").toBeLessThanOrEqual(MARKUP_GZIP_CEILING)
    expect(gzipSync(APP_BOOT_SCRIPT).length, "the boot script, gzipped").toBeLessThanOrEqual(SCRIPT_GZIP_CEILING)
    // As it ships: the build drops the comments.
    const shipped = splashCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ")
    expect(gzipSync(shipped).length, "the splash's CSS, gzipped").toBeLessThanOrEqual(CSS_GZIP_CEILING)
  })
})

/**
 * Bytes, gzipped. Set at the first measurement; they may only go down. The
 * line's type moved from the CSS to the scale's class in the markup (tracking
 * comes from the scale alone, app/tracking.test.ts): markup 720 to 727, CSS
 * 1,207 to 1,191.
 */
const MARKUP_GZIP_CEILING = 727
const SCRIPT_GZIP_CEILING = 536
const CSS_GZIP_CEILING = 1191
