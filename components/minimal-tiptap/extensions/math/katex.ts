"use client"

/**
 * KaTeX for a doc's equations (docs programme B3, editor.md P1-9). This
 * module and its stylesheet load the first time an equation is drawn, never
 * with a doc that has none (I20). The doc stores only the TeX (I5).
 *
 * TeX is anyone's who can edit the doc, so it's drawn without trust: no
 * \href, \url, \includegraphics or HTML extensions, sizes and macro expansion
 * capped, and an error drawn as the source in the danger ink instead of
 * thrown.
 */

import katex from "katex"
import "katex/dist/katex.min.css"

const OPTIONS = {
  throwOnError: false,
  errorColor: "var(--danger-ink)",
  output: "htmlAndMathml" as const,
  strict: "ignore" as const,
  trust: false,
  maxSize: 50,
  maxExpand: 500,
}

/** Draws TeX into an element: inline, or as a display (block) equation. */
export function renderMath(into: HTMLElement, latex: string, display: boolean) {
  katex.render(latex, into, { ...OPTIONS, displayMode: display })
}

/** Why TeX can't be read, in KaTeX's words without its prefix; null when it can. */
export function mathError(latex: string, display: boolean): string | null {
  try {
    katex.renderToString(latex, { ...OPTIONS, displayMode: display, throwOnError: true })
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return message.replace(/^KaTeX parse error:\s*/, "")
  }
}
