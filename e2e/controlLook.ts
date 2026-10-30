import type { Locator } from "@playwright/test"

/** What a probe wears: Tailwind classes, inline style properties, or both; `dark` puts it under a `dark` host. */
export interface ProbeLook {
  classes?: string
  style?: Record<string, string>
  dark?: boolean
}

/**
 * Resolves a look to computed values by probing a real element: `props` read off
 * a throwaway element that wears it, inside `at` (the page's body) or beside it
 * (a control, so the tokens a surface redefines resolve as they do for it).
 *
 * `dark` wraps the probe in an element carrying the `dark` class rather than
 * putting that class on <html>. The dark variant is `&:is(.dark *)`, so any
 * ancestor works, and this one is not shared with anybody: next-themes owns the
 * class on <html> and rewrites it on mount from the stored theme. A test that set
 * it there was racing the provider, and lost intermittently, reading the light
 * value twice and reporting that the token did not re-point.
 */
export async function probe(at: Locator, look: ProbeLook, props: string[], where: "inside" | "beside" = "beside"): Promise<string[]> {
  return at.evaluate(
    (el, [look, props, where]) => {
      const host = document.createElement("div")
      if (look.dark) host.className = "dark"
      const sample = host.appendChild(document.createElement("div"))
      sample.className = look.classes ?? ""
      for (const [prop, value] of Object.entries(look.style ?? {})) sample.style.setProperty(prop, value)
      if (where === "inside") el.append(host)
      else el.after(host)
      const style = getComputedStyle(sample)
      const values = props.map((prop) => style.getPropertyValue(prop))
      host.remove()
      return values
    },
    [look, props, where] as const,
  )
}

/**
 * How a primary that can't be pressed paints, against the disabled field's look
 * it wears (app/interaction.css): whether its ground is the sunken one, its ink
 * the third and its edge the field's hairline, with its opacity. A disabled
 * primary at half its brand fill still read as an action, and one with no edge
 * had no shape on a sunken footer.
 */
export async function disabledPrimaryLook(control: Locator): Promise<{ ground: boolean; ink: boolean; edge: boolean; opacity: string }> {
  const field = { background: "var(--sunken)", color: "var(--ink-3)", "box-shadow": "0 0 0 1px var(--line)" }
  const [ground, ink, edge] = await probe(control, { style: field }, ["background-color", "color", "box-shadow"])
  const got = await control.evaluate((el) => {
    const style = getComputedStyle(el)
    return { ground: style.backgroundColor, ink: style.color, edge: style.boxShadow, opacity: style.opacity }
  })
  return { ground: got.ground === ground, ink: got.ink === ink, edge: got.edge === edge, opacity: got.opacity }
}

/** The look disabledPrimaryLook reads on a disabled primary. */
export const FIELD_LOOK = { ground: true, ink: true, edge: true, opacity: "1" }

/**
 * How a button busy with its own action paints (Button's busy): whether it
 * keeps its brand ground, its opacity, whether it says it's busy, and whether
 * its spinner turns (the layer's ::after, app/interaction.css). A primary
 * disabled while it saved turned to the field's look, and one dimmed to 70%
 * with nothing turning put its label at 2.94:1: both read as unavailable.
 */
export async function busyPrimaryLook(control: Locator): Promise<{ brand: boolean; opacity: string; busy: string | null; spinning: boolean }> {
  const [brand] = await probe(control, { classes: "bg-brand" }, ["background-color"])
  const got = await control.evaluate((el) => {
    const spinner = getComputedStyle(el, "::after")
    return {
      ground: getComputedStyle(el).backgroundColor,
      opacity: getComputedStyle(el).opacity,
      busy: el.getAttribute("aria-busy"),
      spinning: spinner.content !== "none" && spinner.animationName !== "none",
    }
  })
  return { brand: got.ground === brand, opacity: got.opacity, busy: got.busy, spinning: got.spinning }
}

/** The look busyPrimaryLook reads on a busy primary: full strength, spinning. */
export const BUSY_LOOK = { brand: true, opacity: "1", busy: "true", spinning: true }
