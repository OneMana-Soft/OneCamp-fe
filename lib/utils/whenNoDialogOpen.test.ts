import { afterEach, describe, expect, it, vi } from "vitest"
import { whenNoDialogOpen } from "./whenNoDialogOpen"

const tick = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  document.body.innerHTML = ""
})

describe("whenNoDialogOpen", () => {
  it("runs at once when nothing is open", () => {
    const fn = vi.fn()
    whenNoDialogOpen(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("waits for an open dialog to close, then runs once", async () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div>'
    const fn = vi.fn()
    whenNoDialogOpen(fn)
    await tick()
    expect(fn).not.toHaveBeenCalled()
    document.querySelector('[role="dialog"]')!.setAttribute("data-state", "closed")
    await tick()
    expect(fn).toHaveBeenCalledTimes(1)
    document.body.innerHTML = '<div role="dialog" data-state="open"></div><div role="dialog" data-state="closed"></div>'
    await tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("can be called off while it waits", async () => {
    document.body.innerHTML = '<div role="alertdialog" data-state="open"></div>'
    const fn = vi.fn()
    const cancel = whenNoDialogOpen(fn)
    cancel()
    document.body.innerHTML = ""
    await tick()
    expect(fn).not.toHaveBeenCalled()
  })
})
