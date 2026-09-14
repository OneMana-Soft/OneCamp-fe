import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

afterEach(cleanup)

/** A sheet with more in it than a short phone can show. */
function TallDrawer() {
    return (
        <Drawer open onOpenChange={() => {}}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>Menu</DrawerTitle>
                    <DrawerDescription>A long one</DrawerDescription>
                </DrawerHeader>
                <div>
                    {Array.from({ length: 30 }, (_, i) => (
                        <button key={i} type="button" className="h-12 w-full">
                            row {i}
                        </button>
                    ))}
                </div>
            </DrawerContent>
        </Drawer>
    )
}

const sheet = () => document.querySelector('[data-vaul-drawer]') as HTMLElement | null

describe("a drawer taller than the screen", () => {
    // It is fixed to the bottom with an automatic height, so it grew off the
    // top of the screen and the rows up there could not be reached by any
    // gesture. mt-24 never did anything: margin does nothing to a fixed box
    // with no top.
    it("is capped to the visible viewport", () => {
        render(<TallDrawer />)
        const el = sheet()
        expect(el, "no drawer rendered").toBeTruthy()
        expect(el!.className, "no height cap, so a long sheet runs off the top").toContain("max-h-")
    })

    // dvh, not vh: on mobile Safari vh is measured as if the address bar were
    // hidden, so a 92vh sheet still runs under the bar when it is not.
    it("measures against the viewport that is actually visible", () => {
        render(<TallDrawer />)
        expect(sheet()!.className).toMatch(/max-h-\[\d+dvh\]/)
    })

    it("scrolls its content instead of clipping it", () => {
        const { container } = render(<TallDrawer />)
        const scroller = container.ownerDocument.querySelector(".overflow-y-auto")
        expect(scroller, "nothing in the drawer scrolls").toBeTruthy()
        expect(scroller!.textContent).toContain("row 29")
    })

    // A flick at the end of the list must not scroll the page underneath.
    it("keeps the scroll inside the sheet", () => {
        render(<TallDrawer />)
        const scroller = document.querySelector(".overflow-y-auto") as HTMLElement
        expect(scroller.className).toContain("overscroll-contain")
    })

    // The grab handle is what says this can be dismissed; scrolling it away
    // takes the affordance with it.
    it("keeps the handle in place while the body moves", () => {
        render(<TallDrawer />)
        const handle = document.querySelector(".rounded-full.bg-muted") as HTMLElement
        expect(handle, "no drag handle").toBeTruthy()
        expect(handle.className).toContain("shrink-0")
        expect(handle.closest(".overflow-y-auto"), "the handle scrolls with the content").toBeNull()
    })
})

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

function TallSheet({ side }: { side: "top" | "bottom" | "left" | "right" }) {
    return (
        <Sheet open onOpenChange={() => {}}>
            <SheetContent side={side}>
                <SheetHeader className="sr-only">
                    <SheetTitle>Panel</SheetTitle>
                    <SheetDescription>A long one</SheetDescription>
                </SheetHeader>
                {Array.from({ length: 30 }, (_, i) => (
                    <p key={i}>row {i}</p>
                ))}
            </SheetContent>
        </Sheet>
    )
}

const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null

describe("a sheet taller than the screen", () => {
    // The side ones are bounded by h-full and were simply cut off; the top and
    // bottom ones have an automatic height and grew off the edge entirely.
    it.each(["top", "bottom", "left", "right"] as const)("scrolls its own content (%s)", (side) => {
        render(<TallSheet side={side} />)
        const el = panel()
        expect(el, "no sheet rendered").toBeTruthy()
        expect(el!.className, `a ${side} sheet clips what does not fit`).toContain("overflow-y-auto")
        expect(el!.className).toContain("overscroll-contain")
        cleanup()
    })

    it.each(["top", "bottom"] as const)("is capped to the visible viewport (%s)", (side) => {
        render(<TallSheet side={side} />)
        expect(panel()!.className).toMatch(/max-h-\[\d+dvh\]/)
        cleanup()
    })
})
