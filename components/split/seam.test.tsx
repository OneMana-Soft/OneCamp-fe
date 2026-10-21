import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// react-resizable-panels drew its resize cursor with a rule for every element
// (*{cursor}), added and taken away as a seam was hovered, dragged and stopped
// at a limit: the whole page restyled each time (split view, fluid-21). A seam
// wears its cursor itself, and once a drag takes the pointer off it a surface
// over the page wears it and takes the pointer. Not on the press: laid then, it
// took the release, the click went to the page, and a double-click never evened
// the views (e2e, 21 Oct). The library stands in for its own drag here;
// e2e/splitArrange.spec.ts drags a real seam.

const panels = vi.hoisted(() => ({ disableGlobalCursorStyles: vi.fn() }))
vi.mock("react-resizable-panels", () => ({
  disableGlobalCursorStyles: panels.disableGlobalCursorStyles,
  PanelResizeHandle: ({ onDragging, children, ...rest }: { onDragging?: (d: boolean) => void; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
    <div role="separator" {...rest} onPointerDown={() => onDragging?.(true)} onPointerUp={() => onDragging?.(false)}>
      {children}
    </div>
  ),
}))

import { Seam } from "./Seam"

afterEach(cleanup)

const surface = () => document.body.querySelector<HTMLElement>(":scope > .shell-seam-surface")

describe("a seam", () => {
  it("leaves the library's page-wide cursor rule off", () => {
    expect(panels.disableGlobalCursorStyles).toHaveBeenCalled()
  })

  it("lays a surface wearing its cursor over the page once a drag takes the pointer off it, and only then", () => {
    const dragging = vi.fn()
    render(<Seam label="Resize views 1 and 2" onDragging={dragging} />)
    const seam = screen.getByRole("separator", { name: "Resize views 1 and 2" })
    expect(surface()).toBeNull()
    fireEvent.pointerDown(seam)
    expect(dragging).toHaveBeenLastCalledWith(true)
    // Pressed, and moving on the seam: it is still the seam's own.
    expect(surface()).toBeNull()
    fireEvent.pointerMove(seam.querySelector("i")!)
    expect(surface()).toBeNull()
    // Off it: the surface takes the pointer, and stays to the release.
    fireEvent.pointerMove(document.body)
    expect(surface()).not.toBeNull()
    fireEvent.pointerMove(surface()!)
    expect(surface()).not.toBeNull()
    fireEvent.pointerUp(seam)
    expect(surface()).toBeNull()
    expect(dragging).toHaveBeenLastCalledWith(false)
  })

  it("lays nothing over itself on a press, so a double-click lands on it and evens the views", () => {
    const reset = vi.fn()
    render(<Seam label="Resize views 1 and 2" onReset={reset} />)
    const seam = screen.getByRole("separator", { name: "Resize views 1 and 2" })
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(seam)
      // The release lands on what is under the pointer: the seam, with nothing laid over it.
      expect(surface()).toBeNull()
      fireEvent.pointerUp(seam)
    }
    fireEvent.doubleClick(seam)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
