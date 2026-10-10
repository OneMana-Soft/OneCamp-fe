import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

afterEach(cleanup)

describe("where toasts are drawn", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8")

  // The one Toaster lived in the signed-in app's providers, so a toast on a
  // guest page, the invoice page or any signed-out page drew nothing: a
  // guest's comment that failed to post failed in silence.
  it("is one Toaster at the root, under every page", () => {
    expect(read("components/providers/ClientProviders.tsx")).toMatch(/<Toaster\s*\/>/)
    expect(read("app/app/ClientProviders.tsx")).not.toMatch(/<Toaster\b/)
  })

  // On a phone a toast 5rem up sat over a channel's message box while the
  // person typed. At the top it covers nothing they are using.
  it("comes in at the top on a phone and bottom right from sm up", async () => {
    const { ToastProvider, ToastViewport } = await import("@/components/ui/toast")
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" />
      </ToastProvider>,
    )
    const cls = screen.getByTestId("viewport").className
    expect(cls).toMatch(/(^|\s)top-0(\s|$)/)
    expect(cls).toContain("sm:top-auto")
    expect(cls).toContain("sm:bottom-0")
    expect(cls).toContain("sm:right-0")
    expect(cls).not.toMatch(/(^|\s)pb-\[calc\(env\(safe-area-inset-bottom\)\+5rem\)\]/)
  })
})
