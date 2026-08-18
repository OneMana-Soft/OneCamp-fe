import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Guards the elevation rule documented in app/globals.css: a shadow means the
 * surface floats above the page, and nothing else gets one.
 *
 * A convention in a comment decays. This reads the primitive sources so the rule
 * is enforced where it actually matters — in the base components every screen
 * renders. Before this, Card, Input, Textarea and four of five Button variants all
 * carried shadow-sm, which meant a static settings panel, the field inside it and
 * the button beside it were all "floating": elevation was decoration rather than
 * information, and the app read as a stack of physical cards instead of a document.
 */

const uiDir = resolve(__dirname)

/** Class strings only — the rule is discussed in prose in these files. */
function classSource(file: string): string {
  const raw = readFileSync(resolve(uiDir, file), "utf8")
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, "") // whole-line // comments
    .replace(/\/\/.*$/gm, "") // trailing // comments
}

/**
 * Shadow utilities declared in a file, ignoring the two that are always allowed:
 * shadow-overlay (the sanctioned floating-layer token — a file may legitimately
 * contain both an inline trigger and a floating panel, as select.tsx does) and
 * shadow-none (an explicit opt-out, which is the rule being obeyed, not broken).
 */
function shadowClasses(file: string): string[] {
  const found = classSource(file).match(/\b(?:hover:|focus:|active:|group-hover:|data-\[[^\]]+\]:)?shadow-[a-z0-9[\]/.-]+/g) || []
  return found.filter((c) => !c.endsWith("shadow-overlay") && !c.endsWith("shadow-none"))
}

/** Lives in the page: must be flat. */
const INLINE_PRIMITIVES = [
  "card.tsx",
  "input.tsx",
  "textarea.tsx",
  "button.tsx",
  "badge.tsx",
  "toggle.tsx",
  "tabs.tsx",
  "select.tsx",
  "input-group.tsx",
  "listRow.tsx",
]

/** Genuinely floats: must be elevated, or its edge disappears on a busy page. */
const FLOATING_PRIMITIVES = ["dropdown-menu.tsx", "popover.tsx", "dialog.tsx"]

describe("elevation rule", () => {
  for (const file of INLINE_PRIMITIVES) {
    it(`${file} carries no shadow: it sits in the page, not above it`, () => {
      const shadows = shadowClasses(file)
      expect(shadows, `${file} should be flat but declares: ${shadows.join(", ")}`).toEqual([])
    })

    it(`${file} does not rise on hover`, () => {
      // -translate-y on hover is the "card lifts under the cursor" idiom.
      expect(classSource(file)).not.toMatch(/hover:-translate-y/)
    })
  }

  for (const file of FLOATING_PRIMITIVES) {
    it(`${file} keeps an elevation, since it floats`, () => {
      expect(classSource(file)).toMatch(/shadow-(?:overlay|lg|xl|md)/)
    })
  }

  it("switch: flat track, but the thumb keeps a right-sized shadow", () => {
    // The one deliberate exception. A switch knob reads as a physical object by
    // universal convention (iOS, Material), so removing its shadow entirely would
    // make the control ambiguous rather than cleaner. What was wrong was the
    // SIZE — shadow-lg on a 16px dot — and the track carrying one too.
    const shadows = shadowClasses("switch.tsx")
    expect(shadows).toEqual(["shadow-sm"])
    expect(classSource("switch.tsx")).not.toMatch(/shadow-lg/)
  })

  it("the hover-lift utility is gone from the design vocabulary", () => {
    const globals = readFileSync(resolve(uiDir, "../../app/globals.css"), "utf8")
    // Defined only inside the explanatory comment, never as an @utility.
    expect(globals).not.toMatch(/@utility\s+hover-lift/)
  })

  it("keeps shadow-overlay as the one floating-surface token", () => {
    const globals = readFileSync(resolve(uiDir, "../../app/globals.css"), "utf8")
    expect(globals).toMatch(/@utility\s+shadow-overlay/)
  })
})

/**
 * The workspace UI never grows elevation under the cursor.
 *
 * hover:shadow-* is wrong on an inline surface (it shouldn't have a shadow at all)
 * AND on a floating one (a menu doesn't rise when you point at it), so unlike the
 * static-shadow question this needs no per-element judgement — it's just wrong. It
 * was on 25 elements: every combobox trigger, the "add member" buttons, doc and
 * attachment cards, search results and an AI action tile. All of them already had
 * a background or border hover, so removing it cost no affordance.
 */
describe("no hover-elevation in the workspace UI", () => {
  const root = resolve(uiDir, "../..")

  /** app/page.tsx is the public marketing/landing surface, not the workspace. It
   *  runs a deliberately louder language (gradients, elevation) and is exempt. */
  const EXEMPT = new Set([resolve(root, "app/page.tsx")])

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue
        walk(full, out)
      } else if (entry.name.endsWith(".tsx")) {
        out.push(full)
      }
    }
    return out
  }

  const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))].filter(
    (f) => !EXEMPT.has(f),
  )

  it("scans a meaningful number of files", () => {
    // Guards against the walker silently finding nothing and the suite passing.
    expect(files.length).toBeGreaterThan(100)
  })

  it("declares no hover:shadow-* anywhere", () => {
    const offenders = files
      .filter((f) => /hover:shadow-/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(root.length + 1))
    expect(offenders, `hover elevation found in: ${offenders.join(", ")}`).toEqual([])
  })

  /**
   * Flattening the primitives only holds if callers don't override the shadow back
   * on. They had: a Button re-raised itself with shadow-sm, an Input did the same,
   * three recording tiles carried one, and GitHubIntegrationCard had TWO raw
   * <input> elements with a hand-copied replica of the Input primitive's class
   * string — shadow included — so they kept floating after the primitive stopped.
   *
   * A small fixed height (h-8..h-11) is a reliable tell for "control or
   * control-sized tile". Some of those legitimately DO float — the board's canvas
   * buttons sit absolute over arbitrary content, and the editor's link toolbar is a
   * popover that happens to be h-10 — so the rule is not "no shadow" but "if it
   * floats, say so with the sanctioned token". Those four were converted from ad-hoc
   * shadow-md/shadow-lg to shadow-overlay, which also made their edge treatment
   * consistent with every other floating surface.
   *
   * There is deliberately no escape hatch. A future case that genuinely needs
   * something else will fail here, which is the point: it should be a conversation,
   * not a quiet one-off.
   */
  it("control-sized elements use shadow-overlay or no shadow at all", () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/\bshadow-(?:sm|md|lg|xl|2xl|xs)\b/.test(line)) continue
        if (!/\bh-(?:8|9|10|11)\b/.test(line)) continue
        offenders.push(`${file.slice(root.length + 1)}: ${line.trim().slice(0, 90)}`)
      }
    }
    expect(offenders, `control-sized elevation:\n${offenders.join("\n")}`).toEqual([])
  })
})
