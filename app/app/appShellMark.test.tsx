import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { APP_SHELL_ATTR, AppShellMark } from "./AppShellMark"

// The page lock is the signed-in app's alone (app/globals.css), by a mark on
// <html> rather than html:has() on a span: a :has() on the root is matched
// again whenever anything is added to or taken from the document.

const root = join(__dirname, "..", "..")
const css = readFileSync(join(root, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

afterEach(cleanup)

describe("the app's page lock", () => {
  it("marks <html> while the app is drawn, and only then", () => {
    expect(document.documentElement.hasAttribute(APP_SHELL_ATTR)).toBe(false)
    const view = render(<AppShellMark />)
    expect(document.documentElement.hasAttribute(APP_SHELL_ATTR)).toBe(true)
    view.unmount()
    expect(document.documentElement.hasAttribute(APP_SHELL_ATTR)).toBe(false)
  })

  it("is the signed-in layout's", () => {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    expect(layout).toMatch(/<AppShellMark \/>/)
    expect(layout).not.toMatch(/data-app-shell/)
  })

  it("locks the page by the mark, never by html:has() or body:has()", () => {
    expect(css).not.toMatch(/(html|body):has\(/)
    expect(css).toMatch(/html\[data-app-shell\]\s*\{[^}]*overflow:\s*hidden/)
    expect(css).toMatch(/html\[data-app-shell\] body\s*\{[^}]*position:\s*fixed/)
  })
})
