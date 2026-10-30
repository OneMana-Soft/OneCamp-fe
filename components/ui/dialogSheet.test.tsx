import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

/**
 * Owner, 18 Oct; drawers-v3 §3.1: on a phone every dialog is a sheet. The
 * base Dialog becomes one in the primitive, as the confirm did, still Radix's
 * dialog: on the bottom edge at the screen's width, its footer pinned at its
 * foot. The calendar's feed and share dialogs sat centred at 390
 * (DESIGN-BUILD-8). A computer keeps the centred dialog at the caller's width.
 * The sheet's layout is app/phone.css C5d's, keyed on data-v3-sheet; a real
 * browser measures it in e2e/calendarFeed.
 */
const mode = vi.hoisted(() => ({ sheet: true }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => mode.sheet }))

const { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } = await import("@/components/ui/dialog")
const { OverlayBody } = await import("@/components/ui/overlay")

afterEach(cleanup)

function Share() {
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle>Share the calendar</DialogTitle>
          <DialogDescription>People you add see its events.</DialogDescription>
        </DialogHeader>
        <OverlayBody>The people</OverlayBody>
        <DialogFooter>
          <button type="button">Cancel</button>
          <button type="button">Share</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe("a dialog on a phone", () => {
  it("is a sheet, still a dialog, over a sheet's dim", () => {
    mode.sheet = true
    render(<Share />)
    expect(screen.getByRole("dialog", { name: "Share the calendar" }).getAttribute("data-v3-sheet")).toBe("")
    expect(document.querySelector(".v3-overlay")?.getAttribute("data-v3-scrim")).toBe("")
  })

  it("gives its close button a finger's reach", () => {
    mode.sheet = true
    render(<Share />)
    expect(screen.getByRole("button", { name: "Close" }).hasAttribute("data-touch-target")).toBe(true)
  })

  // It scrolled as one: on a short screen its title and its close went up out of sight with what it holds
  // (DialogBody's scroller stood down in it). Now the sheet holds its body as the one overlay layout does.
  // Its footer shrank in that column to its 60px floor, and on a phone the stacked buttons spilled up over the
  // body's last row (DESIGN-BUILD-16, 25 Oct 2026): the overlay layout's footer keeps its height.
  it("holds a body as a column: the sheet is what holds it, its header and footer stay, and a form between joins the column", () => {
    mode.sheet = true
    render(
      <Dialog open>
        <DialogContent>
          <form>
            <DialogHeader>
              <DialogTitle>Plan the import</DialogTitle>
            </DialogHeader>
            <OverlayBody>Statuses and priorities</OverlayBody>
            <DialogFooter>
              <button type="submit">Start import</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    )
    const sheet = screen.getByRole("dialog", { name: "Plan the import" })
    expect(sheet.getAttribute("data-overlay")).toBe("dialog")
    expect(sheet.hasAttribute("data-overlay-holds-body")).toBe(true)
    expect(sheet.querySelector("form")?.hasAttribute("data-overlay-column")).toBe(true)
    expect(screen.getByText("Plan the import").closest("[data-overlay-header]")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Start import" }).closest("[data-overlay-footer]")).not.toBeNull()
  })

  it("with no body, is its own one scroller, holding none", () => {
    mode.sheet = true
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>A note</DialogTitle>
          <p>Short.</p>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole("dialog", { name: "A note" }).hasAttribute("data-overlay-holds-body")).toBe(false)
  })

  it("takes a full-screen viewer's opt-out (the lightbox, the player at full screen) as the viewer sets it", () => {
    mode.sheet = true
    render(
      <Dialog open>
        <DialogContent data-full-screen="">
          <DialogTitle>A photo</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const viewer = screen.getByRole("dialog", { name: "A photo" })
    expect(viewer.getAttribute("data-v3-sheet")).toBe("")
    expect(viewer.getAttribute("data-full-screen")).toBe("")
  })
})

describe("a dialog on a computer", () => {
  it("stays the centred dialog at the caller's width", () => {
    mode.sheet = false
    render(<Share />)
    const dialog = screen.getByRole("dialog", { name: "Share the calendar" })
    expect(dialog.hasAttribute("data-v3-sheet")).toBe(false)
    expect(dialog.className.split(/\s+/)).toEqual(expect.arrayContaining(["inset-0", "m-auto", "h-fit", "sm:max-w-lg", "max-h-[80vh]"]))
    expect(document.querySelector(".v3-overlay")?.hasAttribute("data-v3-scrim")).toBe(false)
  })

  it("holds a body as the column's one scroller, its header and footer staying", () => {
    mode.sheet = false
    render(<Share />)
    const dialog = screen.getByRole("dialog", { name: "Share the calendar" })
    expect(dialog.getAttribute("data-overlay")).toBe("dialog")
    expect(dialog.hasAttribute("data-overlay-holds-body")).toBe(true)
  })
})

describe("a dialog's sheet (app/phone.css C5d)", () => {
  const css = readFileSync(join(process.cwd(), "app/phone.css"), "utf8")
  const SHEET = '.v3-dialog[role="dialog"][data-v3-sheet]'
  /** Every dialog's sheet, the confirm's too, but a full-screen viewer. */
  const GEOMETRY = ".v3-dialog[data-v3-sheet]:not([data-full-screen])"
  const ruleOf = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`)
    expect(at, `a rule for ${selector}`).toBeGreaterThan(-1)
    return { at, body: css.slice(at, css.indexOf("}", at)) }
  }
  /** How many blocks (an @layer, an @media) are open at `at`, comments aside. */
  const depth = (at: number) =>
    [...css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, "")].reduce((d, c) => d + (c === "{" ? 1 : c === "}" ? -1 : 0), 0)

  it("lays it on the bottom edge at the screen's width, over the classes a caller places a centred dialog with", () => {
    // The right panel's sheet on a phone (components/rightPanel/RightPanelSheet) takes the same box, in the same rule.
    const { at, body } = ruleOf(`${GEOMETRY},\n.shell-panel-phone`)
    // Out of the layers: an unlayered rule wins over every utility class, whatever its specificity.
    expect(depth(at)).toBe(0)
    for (const d of ["inset: auto 0 0;", "translate: none;", "width: 100%;", "max-width: 640px;", "max-height: 92dvh;", "margin-inline: auto;", "border-radius: var(--r-sheet) var(--r-sheet) 0 0;"]) {
      expect(body).toContain(d)
    }
    // A height a caller sets stands under the cap: GitHubIssueSearchDialog keeps one height for its tabs.
    expect(body).not.toMatch(/(^|[\s;{])(height|min-height|min-width):/)
  })

  it("leaves a full-screen viewer edge to edge: both rules that lay out a dialog's sheet pass over one", () => {
    // Each rule's first selector: the geometry's is shared with the right panel's sheet (.shell-panel-phone).
    const own = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^(\.v3-dialog\[[^\s>+~{,]*)(?:,\n[^{]*)? \{/gm)].map((m) => m[1])
    expect(own).toEqual([GEOMETRY, `${SHEET}:not([data-full-screen])`])
  })

  it("keeps the home-indicator strip, in its footer when it has one", () => {
    expect(ruleOf(`${SHEET}:not([data-full-screen])`).body).toMatch(/--dlg-pad-bottom: max\(var\(--dlg-pad\), env\(safe-area-inset-bottom\)\);[^}]*padding-bottom: var\(--dlg-pad-bottom\);/)
    // Its DialogFooter, or a footer of its own marked as the sheet's (a share dialog's).
    const footer = ruleOf(`:is(${SHEET} > .v3-dlg-footer, ${SHEET} > form > .v3-dlg-footer, ${SHEET} > [data-sheet-footer])`)
    expect(depth(footer.at)).toBe(0)
    // It bleeds through all of the sheet's bottom padding, the strip included;
    // its foot, the strip with it, is every phone sheet's (app/overlay.css 8b), not one of its own.
    expect(footer.body).toMatch(/bottom: calc\(var\(--dlg-pad-bottom\) \* -1\);\s*margin-bottom: calc\(var\(--dlg-pad-bottom\) \* -1\);\s*$/)
    const overlay = readFileSync(join(process.cwd(), "app/overlay.css"), "utf8")
    expect(overlay).toContain(`\n  ${SHEET} > .v3-dlg-footer,\n  ${SHEET} > form > .v3-dlg-footer,\n  ${SHEET} > [data-sheet-footer],\n`)
    expect(css).toContain(`  ${SHEET} > .v3-dlg-footer::before,\n  ${SHEET} > form > .v3-dlg-footer::before {`)
  })

  it("lets a body it holds be the one scroller: app/overlay.css makes the sheet that holds one a column", () => {
    const overlay = readFileSync(join(process.cwd(), "app/overlay.css"), "utf8")
    expect(overlay).toMatch(/\n\[data-overlay="dialog"\]\[data-overlay-holds-body\] \{\s*display: flex;\s*flex-direction: column;\s*overflow: hidden;/)
  })
})
