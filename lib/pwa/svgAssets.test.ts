import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Every SVG we ship must actually parse.
 *
 * A broken SVG fails in the quietest way there is: the browser renders the alt
 * text and a broken-image glyph, the build succeeds, every unit test passes, and
 * nothing anywhere reports an error. It is only visible by looking at the page.
 *
 * The one that motivated this: a comment was added to logo.svg explaining the
 * stroke colour, and it contained the string "var(--brand)". An XML comment may
 * not contain a double hyphen, so the file stopped parsing and the product logo
 * became a broken image in the app shell, the favicon and the install prompt.
 */

const PUBLIC_DIR = resolve(__dirname, "..", "..", "public")

function svgFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) svgFiles(full, acc)
    else if (entry.name.endsWith(".svg")) acc.push(full)
  }
  return acc
}

describe("shipped SVG assets", () => {
  const files = svgFiles(PUBLIC_DIR)

  it("finds some to check", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((f) => [f.replace(PUBLIC_DIR + "/", ""), f]))("%s parses", (_name, file) => {
    const body = readFileSync(file, "utf8")

    // The exact failure: "--" inside a comment. Checked by name because the
    // generic parse error that follows does not say which rule was broken.
    const comments = body.match(/<!--[\s\S]*?-->/g) ?? []
    for (const c of comments) {
      expect(
        c.slice(4, -3).includes("--"),
        `an XML comment contains a double hyphen, which is illegal and stops the file parsing:\n${c.slice(0, 120)}`,
      ).toBe(false)
    }

    // A DOMParser reports XML errors as a parsererror node rather than throwing.
    const doc = new DOMParser().parseFromString(body, "image/svg+xml")
    const error = doc.querySelector("parsererror")
    expect(error?.textContent ?? "", `does not parse as SVG`).toBe("")
    expect(doc.documentElement.tagName.toLowerCase()).toBe("svg")
  })
})
