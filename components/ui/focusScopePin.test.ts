import { createRequire } from "node:module"
import { readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// ⌥T reaches the toasts from inside a modal by taking a turn on Radix's
// focus-scope stack (components/ui/toastTurn.tsx, V-99). The stack is a module
// of @radix-ui/react-focus-scope, so the app's own copy must be the one its
// dialogs, sheets, popovers, menus and selects use: one copy, pinned to 1.1.7.
// An upgrade that splits them, or moves the pin, fails here first.
const app = createRequire(import.meta.url)
const scopeOf = (...chain: string[]) => {
  const from = chain.reduce((at, pkg) => createRequire(at.resolve(pkg)), app)
  return realpathSync(path.dirname(path.dirname(from.resolve("@radix-ui/react-focus-scope"))))
}

describe("the focus-scope pin (V-99)", () => {
  it("is the app's own dependency at exactly 1.1.7, the one copy every Radix trap of the app uses", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    expect(pkg.dependencies["@radix-ui/react-focus-scope"], "pinned, no range").toBe("1.1.7")
    const dirs = new Set([
      scopeOf(),
      scopeOf("@radix-ui/react-dialog"),
      scopeOf("@radix-ui/react-alert-dialog", "@radix-ui/react-dialog"),
      scopeOf("vaul", "@radix-ui/react-dialog"),
      scopeOf("@radix-ui/react-popover"),
      scopeOf("@radix-ui/react-dropdown-menu", "@radix-ui/react-menu"),
      scopeOf("@radix-ui/react-select"),
    ])
    expect(dirs.size, "the app, dialogs, sheets, drawers, popovers, menus and selects share one copy").toBe(1)
    const [dir] = dirs
    expect(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version).toBe("1.1.7")
  })
})
