import { expect, test, type Page } from "@playwright/test"

/**
 * Design-system verification in a real browser.
 *
 * Everything else enforcing the visual rules — the elevation guard, the status
 * colour ratchet, the manifest icon tests — reads SOURCE. That catches drift in
 * what we wrote, but it cannot tell us what a user actually sees: whether a class
 * survived tailwind-merge, whether a token resolves to a real colour, whether two
 * primitives genuinely agree once the cascade has run. A class name can be present
 * and still lose to a later rule, and a CSS variable can be declared and still
 * resolve to nothing.
 *
 * So these assertions read COMPUTED style out of Chromium on a rendered page. The
 * public /reset-password route is used because it renders real Button and Input
 * primitives with no backend and no auth (the same reason the existing smoke spec
 * lives there).
 */

/** Renders real Button + Input primitives, unauthenticated. */
const PRIMITIVES_PAGE = "/reset-password?token=design-system-probe"

/** iPhone 14-ish. 360 is checked separately as the narrow Android floor. */
const MOBILE = { width: 390, height: 844 }

async function computed(page: Page, selector: string, prop: string): Promise<string> {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel as string)
      if (!el) throw new Error(`selector not found: ${sel}`)
      return getComputedStyle(el).getPropertyValue(p as string)
    },
    [selector, prop],
  )
}

/**
 * Resolves a Tailwind utility to a computed value by probing a real element.
 *
 * `dark` wraps the probe in an element carrying the `dark` class rather than
 * putting that class on <html>. The dark variant is `&:is(.dark *)`, so any
 * ancestor works, and this one is not shared with anybody: next-themes owns the
 * class on <html> and rewrites it on mount from the stored theme. A test that set
 * it there was racing the provider, and lost intermittently, reading the light
 * value twice and reporting that the token did not re-point.
 */
async function probeUtility(
  page: Page,
  classes: string,
  prop: string,
  opts: { dark?: boolean } = {},
): Promise<string> {
  return page.evaluate(
    ([cls, p, dark]) => {
      const host = document.createElement("div")
      if (dark) host.className = "dark"
      const probe = document.createElement("div")
      probe.className = cls as string
      host.appendChild(probe)
      document.body.appendChild(host)
      const value = getComputedStyle(probe).getPropertyValue(p as string)
      host.remove()
      return value
    },
    [classes, prop, Boolean(opts.dark)] as [string, string, boolean],
  )
}

test.describe("elevation rule, as rendered", () => {
  test("the Input primitive computes no box-shadow", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    const input = page.locator('input[type="password"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    // "none" is what a flat surface computes to. A leftover shadow-sm would
    // compute to an rgba(...) triple here regardless of what the source says.
    expect(await computed(page, 'input[type="password"]', "box-shadow")).toBe("none")
  })

  test("the Button primitive computes no box-shadow", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    const button = page.getByRole("button").first()
    await expect(button).toBeVisible({ timeout: 10_000 })
    const shadow = await page.evaluate(() => {
      const el = document.querySelector("button")
      return el ? getComputedStyle(el).boxShadow : "MISSING"
    })
    expect(shadow).toBe("none")
  })

  test("shadow-overlay still produces a real elevation, so the rule is not just 'no shadows'", async ({
    page,
  }) => {
    await page.goto(PRIMITIVES_PAGE)
    const overlay = await probeUtility(page, "shadow-overlay", "box-shadow")
    // Must be a real shadow AND carry the hairline ring (two comma-separated layers).
    expect(overlay).not.toBe("none")
    expect(overlay.split(/,(?![^(]*\))/).length).toBeGreaterThan(1)
  })
})

test.describe("radius agrees across primitives", () => {
  test("Input and Button compute the same border-radius", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 })
    const inputRadius = await computed(page, 'input[type="password"]', "border-top-left-radius")
    const buttonRadius = await computed(page, "button", "border-top-left-radius")
    // The point of dropping the rounded-xl overrides: a control and its
    // neighbouring control must not differ. Whatever the value, it must match.
    expect(inputRadius).toBe(buttonRadius)
    // And it must be the small end of the scale, not a 14px+ pill.
    expect(parseFloat(inputRadius)).toBeLessThanOrEqual(10)
  })
})

test.describe("status colour tokens resolve to real colours", () => {
  for (const token of ["success", "warning", "info", "destructive"]) {
    test(`text-${token} resolves in light mode`, async ({ page }) => {
      await page.goto(PRIMITIVES_PAGE)
      const colour = await probeUtility(page, `text-${token}`, "color")
      // A missing @theme mapping is the failure mode that still compiles: the
      // class exists, the variable doesn't, and the element renders with the
      // inherited colour. Assert we got a real colour that isn't transparent.
      // Chromium serialises our oklch() authored values as lab(), so accept the
      // whole CSS Color 4 family rather than assuming a serialisation.
      expect(colour, `text-${token} produced no colour`).toMatch(
        /^(rgb|rgba|oklch|oklab|lab|lch|color)\(/,
      )
      expect(colour).not.toContain("rgba(0, 0, 0, 0)")
    })
  }

  test("success differs from destructive, and both differ from body text", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    const success = await probeUtility(page, "text-success", "color")
    const destructive = await probeUtility(page, "text-destructive", "color")
    const body = await computed(page, "body", "color")
    expect(success).not.toBe(destructive)
    expect(success).not.toBe(body)
    expect(destructive).not.toBe(body)
  })

  test("the tokens re-point in dark mode instead of staying light", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    const light = await probeUtility(page, "text-success", "color")
    const dark = await probeUtility(page, "text-success", "color", { dark: true })
    // The whole reason 78 `text-x-600 dark:text-x-400` pairs could collapse into
    // one class is that the token itself is mode-aware. If these matched, every
    // converted call site would be wrong in dark mode.
    expect(dark).not.toBe(light)
  })
})

test.describe("mobile layout", () => {
  test.use({ viewport: MOBILE })

  test("no horizontal overflow at 390px", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 })
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    // A sideways scrollbar on a phone is the most obvious "not built for this"
    // signal there is.
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1)
  })

  test("no horizontal overflow at the 360px Android floor", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto(PRIMITIVES_PAGE)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 })
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1)
  })

  test("text inputs are at least 16px, so iOS does not zoom on focus", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 })
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("input, textarea"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({
          type: el.getAttribute("type") || el.tagName.toLowerCase(),
          fontSize: parseFloat(getComputedStyle(el).fontSize),
        })),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) {
      // Safari zooms the whole viewport when a sub-16px field takes focus, and
      // never zooms back out. This is why Input is text-base md:text-sm.
      expect(s.fontSize, `${s.type} is ${s.fontSize}px`).toBeGreaterThanOrEqual(16)
    }
  })

  test("interactive controls meet a 44px touch target", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 })
    const small = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>("button, a[href], input:not([type=hidden]), [role=button]"),
      )
        .filter((el) => el.offsetParent !== null)
        // Skip links are intentionally 1x1 until focused — they are a keyboard
        // affordance that expands on :focus, never a touch target, and enlarging
        // one would put a visible artefact at the top of every page.
        .filter((el) => !/^skip to/i.test((el.textContent || "").trim()))
        .map((el) => {
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          }
        })
        // Width can legitimately be small for a square icon button only if height
        // carries it; the binding constraint on a phone is the shorter side.
        .filter((m) => m.h < 44),
    )
    expect(
      small,
      `controls under 44px tall:\n${small.map((m) => `  ${m.tag} "${m.label}" ${m.w}x${m.h}`).join("\n")}`,
    ).toEqual([])
  })
})

test.describe("focus is visible for keyboard users", () => {
  test("tabbing to a field produces a visible focus ring", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    const input = page.locator('input[type="password"]').first()
    await expect(input).toBeVisible({ timeout: 10_000 })

    const before = await computed(page, 'input[type="password"]', "box-shadow")
    await input.focus()
    // focus-visible is satisfied by programmatic focus on a text field in
    // Chromium, which is the same path a keyboard user takes.
    const after = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('input[type="password"]')
      return el ? getComputedStyle(el).boxShadow : "MISSING"
    })
    // The ring is drawn with box-shadow by Tailwind's ring utilities, so focus
    // must change it. Equal values would mean no visible focus affordance —
    // WCAG 2.4.7, and the reason the primitive uses focus-visible:ring-2.
    expect(after).not.toBe(before)
    expect(after).not.toBe("none")
  })
})

test.describe("dense type scale, as rendered", () => {
  /**
   * The scale below text-xs is declared as @theme tokens (--text-2xs, --text-3xs)
   * rather than a tailwind.config entry, so "the class name is spelled right" is
   * not evidence that anything renders. If a token were removed or renamed, every
   * `text-3xs` in the app would silently fall back to inherited size — a whole
   * class of labels quietly changing size with a green test suite. These probe the
   * computed font-size instead.
   */
  test("text-2xs computes to 11px, with the deliberate line-height", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    expect(await probeUtility(page, "text-2xs", "font-size")).toBe("11px")
    expect(await probeUtility(page, "text-2xs", "line-height")).toBe("16px")
  })

  test("text-3xs computes to 10px, the documented floor", async ({ page }) => {
    await page.goto(PRIMITIVES_PAGE)
    expect(await probeUtility(page, "text-3xs", "font-size")).toBe("10px")
    expect(await probeUtility(page, "text-3xs", "line-height")).toBe("14px")
  })

  test("the floor is really a floor — nothing in the scale renders below 10px", async ({
    page,
  }) => {
    await page.goto(PRIMITIVES_PAGE)
    for (const cls of ["text-3xs", "text-2xs", "text-xs", "text-sm"]) {
      const px = parseFloat(await probeUtility(page, cls, "font-size"))
      expect(px, `${cls} must not render below the 10px floor`).toBeGreaterThanOrEqual(10)
    }
  })
})
