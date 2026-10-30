import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./alert-dialog"

afterEach(cleanup)

const classes = (el: Element) => el.className.split(/\s+/)

function Confirm({ action = {}, onOpenChange = () => {} }: { action?: React.ComponentProps<typeof AlertDialogAction>; onOpenChange?: (open: boolean) => void }) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete the webhook?</AlertDialogTitle>
        <AlertDialogDescription>Its deliveries stop.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction {...action}>Delete webhook</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// shadcn's AlertDialog actions are Buttons (SA-5). Ours were Radix's bare
// buttons dressed in buttonVariants' classes: no interaction layer, no press,
// no finger's target, and a confirm that destroys patched its own fill in
// seven places (a danger-ink raised button, the old shadcn red, the brand's).
describe("a confirm's buttons", () => {
  it("are Buttons: the interaction layer's, the press, a finger's 44px target", () => {
    render(<Confirm />)
    for (const name of ["Delete webhook", "Cancel"]) {
      const b = screen.getByRole("button", { name })
      expect(b.getAttribute("data-interactive"), name).toBe("button")
      expect(b.hasAttribute("data-touch-target"), name).toBe(true)
      expect(b.getAttribute("data-press"), name).toBe("control")
    }
    expect(classes(screen.getByRole("button", { name: "Delete webhook" }))).toContain("bg-brand")
    expect(screen.getByRole("button", { name: "Delete webhook" }).getAttribute("data-tone")).toBe("primary")
    expect(classes(screen.getByRole("button", { name: "Cancel" }))).toContain("bg-raised")
  })

  it("draws a confirm that destroys danger-solid, darkening under the pointer as a solid fill does", () => {
    render(<Confirm action={{ variant: "dangerSolid" }} />)
    const b = screen.getByRole("button", { name: "Delete webhook" })
    // Its label is the fill's foreground: white in light, dark ink in dark (AA on the lifted red).
    expect(classes(b)).toEqual(expect.arrayContaining(["btn-danger-solid", "bg-destructive", "text-destructive-foreground"]))
    expect(classes(b)).not.toContain("text-white")
    expect(classes(b)).not.toContain("bg-brand")
    expect(b.getAttribute("data-tone")).toBe("primary")
  })

  it("takes a Button's size and still closes the dialog", () => {
    const onOpenChange = vi.fn()
    render(<Confirm action={{ size: "sm" }} onOpenChange={onOpenChange} />)
    const b = screen.getByRole("button", { name: "Delete webhook" })
    expect(classes(b)).toContain("h-7")
    fireEvent.click(b)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("closes on Cancel", () => {
    const onOpenChange = vi.fn()
    render(<Confirm onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
