import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

/**
 * Owner, 18 Oct: on a phone every dialog is a sheet. The confirm (useConfirm's
 * and every AlertDialog's) becomes one in the primitive, still an alert
 * dialog: on the bottom edge at the screen's width, its actions pinned at its
 * foot with Cancel last. A computer keeps the centred dialog at the caller's
 * width.
 */
const mode = vi.hoisted(() => ({ sheet: true }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => mode.sheet }))

const { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } =
  await import("@/components/ui/alert-dialog")

afterEach(cleanup)

function Confirm() {
  return (
    <AlertDialog open>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the webhook?</AlertDialogTitle>
          <AlertDialogDescription>Its deliveries stop.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const classes = (el: Element) => el.className.split(/\s+/)

describe("a confirm on a phone", () => {
  it("is a sheet on the bottom edge at the screen's width, and still an alert dialog", () => {
    mode.sheet = true
    render(<Confirm />)
    const sheet = screen.getByRole("alertdialog", { name: "Delete the webhook?" })
    expect(sheet.hasAttribute("data-v3-sheet")).toBe(true)
    // Its geometry is the one rule every dialog's sheet takes (dialogSheet.test, app/phone.css C5d).
    expect(classes(sheet)).toEqual(expect.arrayContaining(["v3-dialog", "v3-confirm-sheet", "fixed"]))
    // A dialog's centring and the caller's dialog width stay off the sheet.
    expect(classes(sheet)).not.toContain("top-[50%]")
    expect(classes(sheet)).not.toContain("sm:max-w-md")
    expect(document.querySelector(".v3-overlay")?.hasAttribute("data-v3-scrim")).toBe(true)
  })

  it("pins its actions at its foot over the home-indicator strip, the action over Cancel", () => {
    mode.sheet = true
    render(<Confirm />)
    const footer = screen.getByRole("button", { name: "Delete" }).parentElement!
    expect(footer.hasAttribute("data-sheet-footer")).toBe(true)
    expect(classes(footer)).toEqual(expect.arrayContaining(["sticky", "bottom-0", "flex-col-reverse", "px-5"]))
    // Its foot, over the strip, is every phone sheet's (app/overlay.css 8b), not a class of its own.
    expect(classes(footer).filter((c) => /^pb-/.test(c))).toEqual([])
    // Stacked at every width a sheet has, a phone held sideways too.
    expect(classes(footer)).not.toContain("sm:flex-row")
    // Cancel comes first, so the reversed column draws it last.
    expect([...footer.children].map((b) => b.textContent)).toEqual(["Cancel", "Delete"])
  })
})

describe("a confirm on a computer", () => {
  it("stays the centred dialog at the caller's width", () => {
    mode.sheet = false
    render(<Confirm />)
    const dialog = screen.getByRole("alertdialog", { name: "Delete the webhook?" })
    expect(dialog.hasAttribute("data-v3-sheet")).toBe(false)
    expect(classes(dialog)).toEqual(expect.arrayContaining(["inset-0", "m-auto", "h-fit", "sm:max-w-md"]))
    expect(classes(dialog)).not.toContain("v3-confirm-sheet")
    expect(screen.getByRole("button", { name: "Delete" }).parentElement!.hasAttribute("data-sheet-footer")).toBe(false)
  })
})

// The confirm's sheet and the dialog's share these rules.
const BOTH = String.raw`:is\(\.v3-confirm-sheet, \.v3-dialog\[role="dialog"\]\[data-v3-sheet\]\)`

describe("the confirm sheet's motion (app/phone.css C5d)", () => {
  const css = readFileSync(join(process.cwd(), "app/phone.css"), "utf8")

  it("rises in --t-sheet and goes in --t-sheet-out on the push curve, its dim in time with it", () => {
    expect(css).toMatch(new RegExp(String.raw`${BOTH}\[data-state="open"\] \{\s*animation: phone-sheet-rise var\(--t-sheet\) var\(--ease-push\) backwards;`))
    expect(css).toMatch(new RegExp(String.raw`${BOTH}\[data-state="closed"\] \{\s*animation: phone-sheet-fall var\(--t-sheet-out\) var\(--ease-push\) both;`))
    expect(css).toMatch(/\.v3-overlay\[data-v3-scrim\]\[data-state="open"\] \{\s*animation-duration: var\(--t-sheet\);/)
  })

  it("keeps its rise in the list while it shakes, so the rise doesn't run again after", () => {
    expect(css).toMatch(new RegExp(String.raw`${BOTH}\[data-state="open"\]\[data-shake="true"\] \{\s*animation: phone-sheet-rise [^;]*, phone-shake `))
  })

  it("stands on the keyboard while one is up, as the right panel's sheet does", () => {
    const sheets = String.raw`:is\(\.v3-confirm-sheet, \.v3-dialog\[role="dialog"\]\[data-v3-sheet\], \.shell-panel-phone\)`
    expect(css).toMatch(new RegExp(String.raw`html\[data-keyboard="open"\] ${sheets} \{\s*bottom: calc\(100% - var\(--app-vv-top, 0px\) - var\(--app-vvh, 100%\)\);`))
  })
})
