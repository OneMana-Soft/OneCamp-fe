import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { listenForEscape } from "@/lib/keys/escape"

// Esc closes the innermost layer that is open, one layer a press (interaction
// spec, rule 7). Radix keeps a closing popover mounted while it fades out
// (180ms) and still counted it the innermost layer, so a press in that time was
// the fading popover's and did nothing: Esc, Esc out of New task's Labels left
// the dialog open (newTaskTemplate e2e at 1280, 2 Nov 2026, where the Labels'
// Esc, Create and the last Esc fell within 190ms). A layer that is closing
// (data-state="closed") is no layer for Esc now, in every Radix layer
// (patches/@radix-ui__react-dismissable-layer@1.1.11.patch). jsdom runs no
// animations, so each popover here closes with one that never reports its end
// (drawerClose.test.tsx): a popover still fading out, as in Chrome. This test
// keeps the patch through upgrades.

/** The popover's computed animations, as the shared PopoverContent's classes give them: enter, then exit (180ms). */
function fadeOuts() {
  const real = window.getComputedStyle.bind(window)
  return vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
    const style = real(el, pseudo)
    if (!(el instanceof HTMLElement) || !el.matches("[data-radix-popper-content-wrapper] > [data-state]")) return style
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "animationName") return el.getAttribute("data-state") === "closed" ? "exit" : "enter"
        if (prop === "animationDuration") return "0.18s"
        if (prop === "animationDelay") return "0s"
        const value = Reflect.get(target, prop)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  })
}

let stopEscape = () => {}

beforeEach(() => {
  stopEscape = listenForEscape()
  fadeOuts()
})

afterEach(() => {
  cleanup()
  stopEscape()
  vi.restoreAllMocks()
})

/** A key, pressed where focus is. Everything it opens or closes, it does inside the press. */
async function press(key: string) {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key })
  })
}

/** New task's Labels chip, as components/task/taskCreateForm.tsx draws it: a popover drawn in place. */
function Labels() {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">Labels</button>
      </PopoverTrigger>
      <PopoverContent portalled={false}>
        <label htmlFor="labels">Labels</label>
        <input id="labels" />
      </PopoverContent>
    </Popover>
  )
}

function NewTask() {
  const [open, setOpen] = React.useState(true)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>New task</DialogTitle>
        <DialogDescription>Name it and pick its project.</DialogDescription>
        <input aria-label="Task title" />
        <Labels />
      </DialogContent>
    </Dialog>
  )
}

/** Labels opened from its chip, as a person opens it: after the dialog it is in (a layer opened with its
 * dialog, in one render, would be counted under it). */
async function openLabels() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Labels" })))
  await act(async () => labelsField().focus())
}

const dialogOpen = () => screen.queryByRole("dialog", { name: "New task" }) !== null
const labelsField = () => document.getElementById("labels") as HTMLInputElement
/** Labels closed, and still drawn: fading out. */
const fadingOut = () => labelsField()?.closest("[data-state]")?.getAttribute("data-state") === "closed"

describe("Esc while a popover fades out", () => {
  it("closes the popover, and the next press closes the dialog it was in while the popover still fades out", async () => {
    render(<NewTask />)
    await openLabels()
    await press("Escape")
    expect(fadingOut(), "the first press closes Labels, still fading out").toBe(true)
    expect(dialogOpen(), "and leaves New task open").toBe(true)
    await press("Escape")
    expect(dialogOpen(), "the second press closes New task").toBe(false)
  })

  it("is the same with the focus back in the form (the task made, its title focused)", async () => {
    render(<NewTask />)
    await openLabels()
    await press("Escape")
    await act(async () => screen.getByRole("textbox", { name: "Task title" }).focus())
    expect(fadingOut()).toBe(true)
    await press("Escape")
    expect(dialogOpen(), "the press closes New task").toBe(false)
  })
})
