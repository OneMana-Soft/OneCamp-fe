import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { ShortcutsDialog, openShortcuts } from "./ShortcutsDialog"

// The keyboard list titles its sections the way the palette that opens it
// titles its groups: sentence case, 12px, medium, muted. It shouted them in
// spaced capitals ("EVERYWHERE", "GO TO").

afterEach(cleanup)

describe("the keyboard shortcuts list", () => {
  it("titles its sections as the palette titles its groups", () => {
    render(<ShortcutsDialog />)
    act(() => openShortcuts())
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(["Everywhere", "Go to", "Lists and boards of tasks", "Side by side"])
    const command = readFileSync(resolve(__dirname, "../ui/command.tsx"), "utf8")
    for (const token of ["text-xs", "font-medium", "text-muted-foreground"]) {
      expect(command).toContain(`[&_[cmdk-group-heading]]:${token}`)
    }
    for (const h of headings) {
      const cls = h.className.split(/\s+/)
      expect(cls).toEqual(expect.arrayContaining(["text-xs", "font-medium", "text-muted-foreground"]))
      expect(cls).not.toContain("uppercase")
      expect(cls.some((c) => c.startsWith("tracking-"))).toBe(false)
    }
  })

  it("names My tasks in sentence case", () => {
    render(<ShortcutsDialog />)
    act(() => openShortcuts())
    expect(screen.getByText("My tasks")).toBeTruthy()
  })
})
