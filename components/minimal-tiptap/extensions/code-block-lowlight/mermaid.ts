/**
 * Draws a Mermaid block (docs programme B3, I5): the doc stores only the
 * source, and the diagram is drawn here, in the reader's browser, in the
 * reader's theme. Mermaid loads the first time a diagram is shown.
 *
 * Mermaid runs at its strict security level (no scripts, no click handlers,
 * labels escaped), and what it draws goes through DOMPurify's SVG profile
 * before it reaches the page: the source is anyone's who can edit the doc.
 * Its own DOMPurify, not the app's: the app's strips every class the editor
 * doesn't write (lib/sanitizeHtml), and the diagram's look hangs on Mermaid's
 * classes. Its <style> stays, without @import or anything fetched by url().
 */

import DOMPurify from "dompurify"
import { once } from "@/lib/lazy/once"

type Mermaid = typeof import("mermaid")["default"]

let purifier: ReturnType<typeof DOMPurify> | null = null
let themed: "light" | "dark" | null = null
let seq = 0

/** A token's value on the page, or undefined (Mermaid's own default then). */
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined

const load: () => Promise<Mermaid> = once(() => import("mermaid").then((m) => m.default))

/** A diagram's CSS with nothing that fetches: no @import, no url() but to its own #ids. */
export function safeCss(css: string): string {
  return css.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, "none")
}

/** The page's theme, as the diagram should be drawn in it. */
const themeNow = (): "light" | "dark" => (document.documentElement.classList.contains("dark") ? "dark" : "light")

/** The diagram's SVG, made safe; or why the source can't be drawn. */
export async function renderMermaid(source: string): Promise<{ svg: string } | { error: string }> {
  const m = await load()
  const theme = themeNow()
  if (themed !== theme) {
    themed = theme
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      // Labels as SVG text: no HTML inside the drawing for the sanitiser to keep.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: "base",
      fontFamily: css("--font-sans"),
      themeVariables: {
        darkMode: theme === "dark",
        background: css("--sheet"),
        primaryColor: css("--raised"),
        primaryTextColor: css("--ink"),
        primaryBorderColor: css("--ink-3"),
        lineColor: css("--ink-2"),
        secondaryColor: css("--sunken"),
        tertiaryColor: css("--sunken"),
        fontSize: "14px",
      },
    })
  }
  // This draw's own: another may start before it ends, and seq moves on.
  const id = `oc-mermaid-${++seq}`
  try {
    const { svg } = await m.render(id, source)
    purifier ??= DOMPurify(window)
    const clean = purifier.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["style"] })
    return { svg: clean.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => open + safeCss(css) + close) }
  } catch (e) {
    // Mermaid leaves its error drawing in the page, in a <div id="d…">: take it away.
    document.getElementById(`d${id}`)?.remove()
    document.getElementById(id)?.remove()
    const message = e instanceof Error ? e.message : String(e)
    return { error: message.split("\n").find((l) => l.trim()) ?? "The diagram has a mistake in it." }
  }
}
