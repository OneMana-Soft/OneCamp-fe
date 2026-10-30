import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Button } from "./button"
import { TaskCheck } from "@/components/task/TaskCheck"
import { watchScrolling } from "@/lib/ui/scrollState"

// A disabled control's reason is the app's tooltip, portalled to the page
// (components/ui/disabledTip.tsx), so no clip around the control cuts it. It
// was a CSS ::after; e2e/disabledTip.spec.ts measures it whole in a browser.
//
// The control is drawn at once and stays the same node when the tip's code
// arrives (22 Oct 2026). It was drawn again inside Radix's trigger, so a
// pointer or focus already on it was lost: the read-only list's check never
// said why (e2e/disabledTip.spec.ts:70, batch 6b). The tests that land a
// pointer or a focus before the code comes import the controls afresh, so
// their lazy tip hasn't come yet.

vi.mock("@/lib/celebrateSoon", () => ({ celebrateTask: vi.fn(), warmBurstsWhenIdle: () => undefined }))
vi.mock("@/components/task/taskStatusCell", () => ({ statusKindOf: () => "todo", useStatusLabel: () => "Todo" }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const chip = () => document.body.querySelector("[data-radix-popper-content-wrapper]")
const READ_ONLY = "Only this project's members can change it"
/** Long enough for the tooltips' 400 ms and the chunk, on a loaded machine. */
const SOON = { timeout: 3000 }
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

/** Button and TaskCheck as a page's first disabled control finds them: their tip's code not fetched yet. */
async function beforeTheChunk() {
  vi.resetModules()
  const [{ Button: FreshButton }, { TaskCheck: FreshCheck }] = await Promise.all([import("./button"), import("@/components/task/TaskCheck")])
  return { FreshButton, FreshCheck }
}

/** The browser saying the pointer rests on `el` (jsdom keeps no hover). */
function pointerOn(el: Element) {
  const matches = Element.prototype.matches
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":hover" ? this === el || this.contains(el) : matches.call(this, selector)
  })
}

describe("a disabled control's reason", () => {
  it("opens with focus as a tooltip drawn at the page's end, and the button names it", async () => {
    const { FreshButton } = await beforeTheChunk()
    const press = vi.fn()
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <FreshButton disabled disabledReason="Pick a project first" aria-label="Attach a file" onClick={press} />
      </div>,
    )
    const button = screen.getByRole("button", { name: "Attach a file" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect((button as HTMLButtonElement).disabled).toBe(false)
    // Focused from the keys before the tip's code comes: it keeps the focus, and the tip opens as the code lands.
    act(() => button.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("Pick a project first"), SOON)
    expect(screen.getByRole("button", { name: "Attach a file" }), "the same button, never drawn again").toBe(button)
    expect(document.activeElement).toBe(button)
    expect(container.contains(chip())).toBe(false)
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    fireEvent.click(button)
    expect(press).not.toHaveBeenCalled()
  })

  it("isn't there for an enabled button, or a disabled one with no reason", () => {
    render(
      <>
        <Button disabledReason="Never shown">Go</Button>
        <Button disabled>Stop</Button>
      </>,
    )
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("data-disabled-reason")).toBeNull()
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("aria-describedby")).toBeNull()
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("still hands the button to the caller's ref, object or function", async () => {
    const box = { current: null as HTMLButtonElement | null }
    let called: HTMLButtonElement | null = null
    await act(async () => {
      render(
        <>
          <Button ref={box} disabled disabledReason="Not yet">A</Button>
          <Button ref={(el) => void (called = el)} disabled disabledReason="Not yet">B</Button>
        </>,
      )
    })
    expect(box.current).toBe(screen.getByRole("button", { name: "A" }))
    expect(called).toBe(screen.getByRole("button", { name: "B" }))
  })

  it("is TaskCheck's too, and its CSS tip says nothing while disabled", async () => {
    const { FreshCheck } = await beforeTheChunk()
    render(<FreshCheck done={false} status={{ name: "todo" } as never} taskName="Draft" onToggle={() => {}} disabled />)
    const check = screen.getByRole("button", { name: "Mark Draft complete" })
    expect(check.getAttribute("data-tip")).toBe("")
    act(() => check.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe(READ_ONLY), SOON)
    expect(screen.getByRole("button", { name: "Mark Draft complete" }), "the same check, never drawn again").toBe(check)
    expect(document.activeElement).toBe(check)
  })

  // A webhook's switch waited with no reason, a dead press beside a Create that said why (V-112).
  it("is the Switch's too: focusable, it says why, and a press runs neither its change nor a parent's", async () => {
    vi.resetModules()
    const { Switch: FreshSwitch } = await import("./switch")
    const change = vi.fn()
    const parent = vi.fn()
    render(
      <div onClick={parent}>
        <FreshSwitch checked disabled disabledReason="Tick an event first" aria-label="Feed is on" onCheckedChange={change} />
        <FreshSwitch checked disabled aria-label="Plain is on" />
      </div>,
    )
    const toggle = screen.getByRole("switch", { name: "Feed is on" })
    expect(toggle.getAttribute("aria-disabled")).toBe("true")
    expect((toggle as HTMLButtonElement).disabled).toBe(false)
    act(() => toggle.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("Tick an event first"), SOON)
    expect(screen.getByRole("switch", { name: "Feed is on" }), "the same switch, never drawn again").toBe(toggle)
    expect(toggle.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    fireEvent.click(toggle)
    expect(change).not.toHaveBeenCalled()
    expect(parent).not.toHaveBeenCalled()
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    // With no reason it is disabled as before.
    expect((screen.getByRole("switch", { name: "Plain is on" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("answers a pointer that came to rest on the check before its code did", async () => {
    const { FreshCheck } = await beforeTheChunk()
    render(<FreshCheck done={false} status={{ name: "todo" } as never} taskName="Draft" onToggle={() => {}} disabled />)
    const check = screen.getByRole("button", { name: "Mark Draft complete" })
    pointerOn(check)
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe(READ_ONLY), SOON)
    expect(screen.getByRole("button", { name: "Mark Draft complete" }), "the same check, never drawn again").toBe(check)
  })

  it("answers a check drawn again under a resting pointer, which gets a pointerenter and no pointermove", async () => {
    watchScrolling()
    // The list drew its rows again (a remount) under a pointer at rest: the browser sends the new check pointerover
    // and pointerenter, and no pointermove, which is all Radix's own trigger listens to.
    await act(async () => {
      render(<TaskCheck done={false} status={{ name: "todo" } as never} taskName="Draft" onToggle={() => {}} disabled />)
    })
    const check = screen.getByRole("button", { name: "Mark Draft complete" })
    fireEvent.pointerOver(check)
    fireEvent.pointerEnter(check)
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe(READ_ONLY), SOON)
  })

  it("opens no tip on the checks a scroll carries under a resting pointer", async () => {
    watchScrolling()
    // Drawn while the list scrolls (a window brings rows in), then entered as the scroll settles.
    fireEvent.scroll(window)
    await act(async () => {
      render(<TaskCheck done={false} status={{ name: "todo" } as never} taskName="One" onToggle={() => {}} disabled />)
    })
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Mark One complete" }))
    // Drawn at rest, then the list scrolls under the pointer before the browser says it is over the check.
    await act(async () => {
      render(<TaskCheck done={false} status={{ name: "todo" } as never} taskName="Two" onToggle={() => {}} disabled />)
    })
    fireEvent.scroll(window)
    await wait(200)
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Mark Two complete" }))
    await wait(700)
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
